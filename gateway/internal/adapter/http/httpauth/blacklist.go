package httpauth

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// tokenBlacklist maps revoked token strings to their expiry time.
// Shared across the handler package and the agentchat sub-package
// so WebSocket upgrades can reject revoked tokens without a
// circular import between them.
//
// The in-memory map is the hot-path cache; the `revoked_tokens` DB
// table is the durable backing store that survives process restarts.
// BlacklistToken writes to both; IsTokenBlacklisted checks memory
// only (populated from DB on InitBlacklist at boot).
var (
	tokenBlacklist sync.Map
	blacklistPool  *pgxpool.Pool
)

// init starts a janitor goroutine that evicts expired blacklist
// entries every 15 minutes so the map stays bounded even under
// heavy logout traffic. The DB janitor (DELETE WHERE expires_at <
// NOW()) also runs here so the table doesn't grow unbounded.
func init() {
	go func() {
		t := time.NewTicker(15 * time.Minute)
		defer t.Stop()
		for now := range t.C {
			tokenBlacklist.Range(func(k, v any) bool {
				if expiry, ok := v.(time.Time); ok && now.After(expiry) {
					tokenBlacklist.Delete(k)
				}
				return true
			})
			// Best-effort DB cleanup — if pool isn't wired yet, skip.
			if p := blacklistPool; p != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				p.Exec(ctx, `DELETE FROM revoked_tokens WHERE expires_at < NOW()`)
				cancel()
			}
		}
	}()
}

// InitBlacklist wires the pgxpool and loads any surviving revoked
// tokens from the database into the in-memory cache. Called once at
// server startup (server.go or bootstrap) before any HTTP request
// can arrive.
func InitBlacklist(pool *pgxpool.Pool) {
	blacklistPool = pool
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Ensure the table exists (idempotent).
	pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS revoked_tokens (
			token_hash TEXT        NOT NULL PRIMARY KEY,
			expires_at TIMESTAMPTZ NOT NULL
		)`)
	// Prune any already-expired rows.
	pool.Exec(ctx, `DELETE FROM revoked_tokens WHERE expires_at < NOW()`)

	// Reload active revocations into the in-memory cache so tokens
	// that were blacklisted before a restart stay rejected.
	rows, err := pool.Query(ctx,
		`SELECT token_hash, expires_at FROM revoked_tokens WHERE expires_at > NOW()`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var hash string
		var exp time.Time
		if rows.Scan(&hash, &exp) == nil {
			tokenBlacklist.Store(hash, exp)
		}
	}
}

// BlacklistToken marks a token as revoked until the given expiry.
// Writes to both the in-memory cache (instant rejection) and the
// DB table (survives restart). The DB write is best-effort — if it
// fails the in-memory entry still protects the running process, and
// the next logout of the same token will retry.
func BlacklistToken(tokenStr string, expiry time.Time) {
	tokenBlacklist.Store(tokenStr, expiry)
	if p := blacklistPool; p != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		p.Exec(ctx, `
			INSERT INTO revoked_tokens (token_hash, expires_at)
			VALUES ($1, $2)
			ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
			tokenStr, expiry,
		)
	}
}

// IsTokenBlacklisted reports whether a token has been revoked.
// Called from the WebSocket upgrade path so revoked tokens
// cannot be reused to open new streams.
func IsTokenBlacklisted(tokenStr string) bool {
	_, ok := tokenBlacklist.Load(tokenStr)
	return ok
}
