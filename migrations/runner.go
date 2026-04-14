// Package migrations is the single source of truth for the StarNion
// SQL schema. The package owns:
//
//   - The canonical .sql files under sql/, embedded into any consumer
//     binary via //go:embed.
//   - The Run function that applies pending migrations to a database
//     connection, tracking which versions have been applied via the
//     schema_migrations table.
//
// Both the gateway server (boots and auto-migrates on startup) and the
// starnion-cli installer wizard depend on this package so the SQL
// files exist in exactly one place. Docker's postgres bootstrap also
// mounts directly from migrations/sql/ — see docker-compose.yml.
//
// The Executor interface keeps the runner free of any specific pgx
// connection type so the gateway can pass a *pgxpool.Pool and the CLI
// can pass a *pgx.Conn without conversion.
package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// FS is the embedded filesystem holding every canonical SQL migration.
// Exposed so callers can list, read, or stream individual files for
// debugging without going through Run.
//
//go:embed all:sql
var FS embed.FS

// Executor is the minimal pgx surface the runner needs to apply
// migrations. *pgx.Conn and *pgxpool.Pool both satisfy it.
type Executor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error)
}

// Logger is the small logging surface Run calls into. Both zap.Logger
// and a no-op stub satisfy it via thin adapter funcs at the call
// sites — keeping migrations dependency-free of any concrete logger.
type Logger interface {
	Infof(format string, args ...any)
}

// nopLogger is the silent default used when Run is called with a nil
// Logger. Useful for tests and short-lived CLI flows that don't need
// per-migration progress.
type nopLogger struct{}

func (nopLogger) Infof(string, ...any) {}

// Run applies every pending migration against db, in alphabetical
// filename order. Each file is wrapped in a single transaction so a
// half-applied migration cannot leave the schema in an inconsistent
// state.
//
// The schema_migrations tracking table is created on the first call.
// Already-applied versions (filename without .sql extension) are
// skipped, so Run is safe to invoke on every server start.
//
// Files prefixed with "phase0" are intentionally skipped — they
// contain destructive DROP statements and are reserved for cold-start
// bootstrap via Postgres's own docker-entrypoint-initdb.d mechanism.
func Run(ctx context.Context, db Executor, logger Logger) error {
	if logger == nil {
		logger = nopLogger{}
	}

	if _, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        NOT NULL PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("migrations: create schema_migrations: %w", err)
	}

	rows, err := db.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("migrations: query schema_migrations: %w", err)
	}
	applied := make(map[string]bool)
	for rows.Next() {
		var v string
		if rows.Scan(&v) == nil {
			applied[v] = true
		}
	}
	rows.Close()

	entries, err := fs.ReadDir(FS, "sql")
	if err != nil {
		return fmt.Errorf("migrations: read embedded sql dir: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	pending := 0
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".sql") {
			continue
		}
		// phase0 files are full-schema dumps with DROP statements —
		// reserved for fresh-DB bootstrap, never applied incrementally.
		if strings.HasPrefix(name, "phase0") {
			continue
		}

		version := strings.TrimSuffix(name, ".sql")
		if applied[version] {
			continue
		}

		sqlBytes, err := FS.ReadFile("sql/" + name)
		if err != nil {
			return fmt.Errorf("migrations: read %s: %w", name, err)
		}

		logger.Infof("[migrate] applying %s", name)

		tx, err := db.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return fmt.Errorf("migrations: begin tx for %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migrations: execute %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
			version,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migrations: record %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("migrations: commit %s: %w", name, err)
		}
		logger.Infof("[migrate] applied %s", version)
		pending++
	}

	if pending == 0 {
		logger.Infof("[migrate] all migrations up to date")
	} else {
		logger.Infof("[migrate] complete (%d applied)", pending)
	}
	return nil
}
