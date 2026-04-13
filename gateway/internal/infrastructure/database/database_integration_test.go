//go:build integration

// Integration tests for the database wrapper. Exercises the pgx-native
// path after the sqlx/stdlib drop: the sentinel swap (sql.ErrNoRows →
// pgx.ErrNoRows), the pgconn.CommandTag.RowsAffected shape, transaction
// commit/rollback semantics, JSONB roundtrip, and pgx.Rows iteration.
//
// Skipped unless TEST_DATABASE_URL is set — this test WRITES (and
// cleans up) a handful of rows in the target schema, so point it at an
// ephemeral dev database.
//
// Run with:
//
//	TEST_DATABASE_URL=postgres://user:pass@localhost:5432/starnion_test \
//	  go test -tags integration ./internal/infrastructure/database/...
package database

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := NewPostgres(ctx, url)
	if err != nil {
		t.Fatalf("NewPostgres: %v", err)
	}
	if err := RunMigrations(ctx, db, zap.NewNop()); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// TestPingRoundtrip verifies the pool accepts connections.
func TestPingRoundtrip(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	if err := db.Ping(ctx); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}
}

// TestUserCRUD covers the hot-path scan shape (uuid, text, jsonb) and
// the pgconn.CommandTag.RowsAffected() shape that replaced the legacy
// sql.Result 2-return signature.
func TestUserCRUD(t *testing.T) {
	db := openTestDB(t)
	pool := db.Pool()
	ctx := context.Background()

	userID := uuid.New()
	email := "integration-" + userID.String() + "@test.local"
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()

	// INSERT — test native pool.Exec + CommandTag.RowsAffected().
	tag, err := pool.Exec(ctx, `
		INSERT INTO users (id, email, display_name, password_hash)
		VALUES ($1, $2, 'Integration Test', '')`,
		userID, email,
	)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Errorf("expected 1 row inserted, got %d", tag.RowsAffected())
	}

	// QueryRow hit — should scan without error.
	var gotEmail, gotName string
	if err := pool.QueryRow(ctx,
		`SELECT email, display_name FROM users WHERE id = $1`,
		userID,
	).Scan(&gotEmail, &gotName); err != nil {
		t.Fatalf("select user: %v", err)
	}
	if gotEmail != email {
		t.Errorf("email mismatch: got %q, want %q", gotEmail, email)
	}

	// QueryRow miss — MUST return pgx.ErrNoRows, NOT sql.ErrNoRows.
	// This is the single biggest migration regression risk: any repo
	// still checking errors.Is(err, sql.ErrNoRows) would silently 500
	// instead of 404. The sweep in PR 2 replaced all 30 sites, and
	// this test codifies the new contract.
	unknown := uuid.New()
	err = pool.QueryRow(ctx,
		`SELECT email FROM users WHERE id = $1`,
		unknown,
	).Scan(&gotEmail)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("expected pgx.ErrNoRows on miss, got %v", err)
	}

	// UPDATE — pgconn.CommandTag.RowsAffected() is a single-return int64.
	tag, err = pool.Exec(ctx,
		`UPDATE users SET display_name = $1 WHERE id = $2`,
		"Updated Name", userID,
	)
	if err != nil {
		t.Fatalf("update user: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Errorf("expected 1 row updated, got %d", tag.RowsAffected())
	}
}

// TestJSONBRoundtrip verifies JSONB columns scan into []byte /
// json.RawMessage unchanged under the native driver — this was the
// single biggest "invisible" regression risk during the sqlx → pgx
// swap because pgx's jsonb codec handles these targets via a
// different code path than the stdlib driver did.
func TestJSONBRoundtrip(t *testing.T) {
	db := openTestDB(t)
	pool := db.Pool()
	ctx := context.Background()

	userID := uuid.New()
	email := "jsonb-" + userID.String() + "@test.local"
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()

	prefs := []byte(`{"language":"ko","timezone":"Asia/Seoul"}`)
	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id, email, display_name, password_hash, preferences)
		VALUES ($1, $2, 'JSONB Test', '', $3::jsonb)`,
		userID, email, prefs,
	); err != nil {
		t.Fatalf("insert user with jsonb: %v", err)
	}

	// Read into []byte — the same shape used by GetPreferences, the
	// notifier dispatcher, cron repo preferences fetch, and every
	// chatctx helper that reads users.preferences.
	var raw []byte
	if err := pool.QueryRow(ctx,
		`SELECT preferences FROM users WHERE id = $1`,
		userID,
	).Scan(&raw); err != nil {
		t.Fatalf("scan jsonb into []byte: %v", err)
	}
	if len(raw) == 0 {
		t.Errorf("expected jsonb payload, got empty")
	}
	if string(raw) != string(prefs) {
		t.Errorf("jsonb roundtrip mismatch: got %s, want %s", raw, prefs)
	}
}

// TestTransactionCommitRollback exercises pgx.Tx semantics with the
// native Commit(ctx)/Rollback(ctx) signatures. Specifically verifies
// that calling Rollback after a successful Commit returns
// pgx.ErrTxClosed (and that the `defer pool.Rollback` idiom wraps it
// harmlessly in _ = ...).
func TestTransactionCommitRollback(t *testing.T) {
	db := openTestDB(t)
	pool := db.Pool()
	ctx := context.Background()

	userA := uuid.New()
	userB := uuid.New()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, userA, userB)
	}()

	// Commit path.
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatalf("BeginTx: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, display_name, password_hash)
		VALUES ($1, $2, 'tx A', '')`,
		userA, "tx-a-"+userA.String()+"@test.local",
	); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("tx insert: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("tx commit: %v", err)
	}
	// pgx.Tx.Rollback after Commit returns pgx.ErrTxClosed. Callers
	// discard the error via `_ = tx.Rollback(ctx)` so double-rollback
	// is safe in production.
	if err := tx.Rollback(ctx); !errors.Is(err, pgx.ErrTxClosed) {
		t.Errorf("expected pgx.ErrTxClosed after double rollback, got %v", err)
	}

	// Rollback path.
	tx, err = pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatalf("BeginTx: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, display_name, password_hash)
		VALUES ($1, $2, 'tx B', '')`,
		userB, "tx-b-"+userB.String()+"@test.local",
	); err != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("tx insert: %v", err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Errorf("explicit Rollback: %v", err)
	}

	// Verify only userA persisted.
	var exists bool
	_ = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, userA).Scan(&exists)
	if !exists {
		t.Errorf("committed user A should exist")
	}
	_ = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, userB).Scan(&exists)
	if exists {
		t.Errorf("rolled-back user B must not exist")
	}
}

// TestQueryRowsIteration exercises the pgx.Rows surface
// (Next/Scan/Err/Close) + passing a uuid[] array parameter.
func TestQueryRowsIteration(t *testing.T) {
	db := openTestDB(t)
	pool := db.Pool()
	ctx := context.Background()

	// Seed three users we can iterate over.
	ids := [3]uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	defer func() {
		for _, id := range ids {
			_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
		}
	}()
	for i, id := range ids {
		if _, err := pool.Exec(ctx, `
			INSERT INTO users (id, email, display_name, password_hash)
			VALUES ($1, $2, $3, '')`,
			id,
			"iter-"+id.String()+"@test.local",
			"iter display",
		); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}

	rows, err := pool.Query(ctx, `
		SELECT id, email FROM users WHERE id = ANY($1::uuid[])
		ORDER BY email`,
		[]uuid.UUID{ids[0], ids[1], ids[2]},
	)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var gotID uuid.UUID
		var gotEmail string
		if err := rows.Scan(&gotID, &gotEmail); err != nil {
			t.Errorf("scan row: %v", err)
			continue
		}
		count++
	}
	if err := rows.Err(); err != nil {
		t.Errorf("rows.Err: %v", err)
	}
	if count != 3 {
		t.Errorf("expected 3 rows, got %d", count)
	}
}
