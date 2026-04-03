package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"go.uber.org/zap"
)

//go:embed all:migrations
var migrationFiles embed.FS

// RunMigrations applies any pending SQL migration files from the embedded
// migrations directory.  Files are sorted alphabetically and applied in order.
//
// Each file is recorded in schema_migrations (version = filename without
// extension) once applied.  Already-recorded files are skipped, so the
// runner is safe to call on every server start.
//
// phase0_full_schema.sql is excluded — it contains DROP TABLE statements and
// is only meant to be run when bootstrapping a completely fresh database via
// docker-compose initdb.
func RunMigrations(ctx context.Context, db *DB, logger *zap.Logger) error {
	// Ensure the tracking table exists.
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        NOT NULL PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// Load already-applied versions.
	rows, err := db.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("query schema_migrations: %w", err)
	}
	applied := make(map[string]bool)
	for rows.Next() {
		var v string
		if rows.Scan(&v) == nil {
			applied[v] = true
		}
	}
	rows.Close()

	// Collect candidate files from the embedded FS.
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	// Sort alphabetically so phase1 < phase2 < … < phase9 < phase10 etc.
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	pending := 0
	for _, e := range entries {
		name := e.Name()

		// Skip the full-schema bootstrap file — it has destructive DROP statements.
		if strings.HasPrefix(name, "phase0") {
			continue
		}

		// Derive the version key from the filename without extension.
		version := strings.TrimSuffix(name, ".sql")
		if applied[version] {
			continue
		}

		sql, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		logger.Info("[migrate] applying migration", zap.String("file", name))

		// Execute the entire script in a single transaction.
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", name, err)
		}

		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			tx.Rollback() //nolint:errcheck
			return fmt.Errorf("execute migration %s: %w", name, err)
		}

		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
			version,
		); err != nil {
			tx.Rollback() //nolint:errcheck
			return fmt.Errorf("record migration %s: %w", name, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}

		logger.Info("[migrate] migration applied", zap.String("version", version))
		pending++
	}

	if pending == 0 {
		logger.Info("[migrate] all migrations up to date")
	} else {
		logger.Info("[migrate] migrations complete", zap.Int("applied", pending))
	}
	return nil
}
