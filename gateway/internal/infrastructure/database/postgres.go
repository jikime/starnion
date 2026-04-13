package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB is a thin handle around pgxpool.Pool. Call sites use the native
// pgx API via Pool() — Query/QueryRow/Exec/BeginTx methods come
// straight from pgx.
//
// The wrapper used to carry sqlx.DB + stdlib.OpenDBFromPool + a
// database/sql-style compat shim (QueryContext/ExecContext/...) to
// cushion the migration off lib/pq. All of that layer cake is gone
// now that the codebase is fully on native pgx: call `db.Pool()` to
// get a *pgxpool.Pool and use pool.Query / pool.Exec / pool.BeginTx
// directly.
//
// Historical note: the old stack created a pgxpool, wrapped it via
// stdlib.OpenDBFromPool to get a *sql.DB, then wrapped that via
// sqlx.NewDb. The outer *sql.DB had its own connection pool that
// was never tuned (SetMaxOpenConns=0 = unlimited), so the
// pgxpool.MaxConns setting was effectively a floor, not a cap.
// Collapsing back to a single pgxpool layer fixes that latent bug.
type DB struct {
	pool *pgxpool.Pool
}

// NewPostgres builds a pgxpool with the gateway's pool tuning.
func NewPostgres(ctx context.Context, databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	config.MaxConns = 50                      // raised: SSE/WS streams each hold a conn
	config.MinConns = 5                       // keep warm connections ready
	config.MaxConnLifetime = 15 * time.Minute // shorter: recycle after 15m to prevent stale conns
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second // more frequent health checks
	config.ConnConfig.Config.ConnectTimeout = 5 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return &DB{pool: pool}, nil
}

// Pool exposes the underlying pgxpool.Pool. Call sites use it to
// reach the native pgx API: pool.Query / pool.QueryRow / pool.Exec
// / pool.BeginTx / pool.SendBatch / pool.CopyFrom.
func (d *DB) Pool() *pgxpool.Pool { return d.pool }

// Close releases all pool resources.
func (d *DB) Close() { d.pool.Close() }

// Ping verifies a live connection can be obtained from the pool.
func (d *DB) Ping(ctx context.Context) error { return d.pool.Ping(ctx) }
