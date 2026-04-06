// migrate-encrypt encrypts all plaintext sensitive values already stored in the
// database. It is safe to run multiple times — already-encrypted values (those
// starting with "enc:") are skipped.
//
// Usage:
//
//	ENCRYPTION_KEY=<your-key> DATABASE_URL=<postgres-url> go run ./gateway/cmd/migrate-encrypt/
//
// Or, if you use .env / starnion.yaml, the config.Load() call picks those up.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/lib/pq"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
)

func main() {
	// Load .env if present (same as the main server binary).
	_ = godotenv.Load("../.env")

	cfg := config.Load()

	if cfg.EncryptionKey == "" {
		log.Fatal("ENCRYPTION_KEY is not set. Cannot migrate without an encryption key.")
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	ctx := context.Background()
	key := cfg.EncryptionKey

	total := 0
	skipped := 0
	encrypted := 0
	failed := 0

	// ── 1. providers.api_key ─────────────────────────────────────────────────
	{
		n, s, e, f := migrateColumn(ctx, db, key,
			"providers", "id", "api_key", nil)
		report("providers.api_key", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	// ── 2. integration_keys.api_key ──────────────────────────────────────────
	{
		n, s, e, f := migrateColumnCompositePK(ctx, db, key,
			"integration_keys", []string{"user_id", "provider"}, "api_key",
			"api_key IS NOT NULL AND api_key <> ''")
		report("integration_keys.api_key", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	// ── 3. google_tokens.access_token ────────────────────────────────────────
	{
		n, s, e, f := migrateColumn(ctx, db, key,
			"google_tokens", "user_id", "access_token", nil)
		report("google_tokens.access_token", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	// ── 4. google_tokens.refresh_token (skip empty) ──────────────────────────
	{
		n, s, e, f := migrateColumn(ctx, db, key,
			"google_tokens", "user_id", "refresh_token",
			func(v string) bool { return v == "" })
		report("google_tokens.refresh_token", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	// ── 5. telegram_bot_configs.bot_token ────────────────────────────────────
	{
		n, s, e, f := migrateColumn(ctx, db, key,
			"telegram_bot_configs", "id", "bot_token", nil)
		report("telegram_bot_configs.bot_token", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	// ── 6. channel_settings.bot_token (telegram channel only) ────────────────
	{
		n, s, e, f := migrateColumnCompositePK(ctx, db, key,
			"channel_settings", []string{"user_id", "channel"}, "bot_token",
			"channel = 'telegram' AND bot_token IS NOT NULL AND bot_token <> ''")
		report("channel_settings.bot_token (telegram)", n, s, e, f)
		total += n; skipped += s; encrypted += e; failed += f
	}

	fmt.Printf("\n──────────────────────────────────────────\n")
	fmt.Printf("TOTAL   rows scanned : %d\n", total)
	fmt.Printf("SKIPPED already enc  : %d\n", skipped)
	fmt.Printf("UPDATED encrypted    : %d\n", encrypted)
	fmt.Printf("FAILED  errors       : %d\n", failed)
	fmt.Printf("──────────────────────────────────────────\n")

	if failed > 0 {
		os.Exit(1)
	}
}

// migrateColumn encrypts all plaintext values in table.column, using pkCol as
// the primary key for the UPDATE.
func migrateColumn(
	ctx context.Context,
	db *sql.DB,
	key, table, pkCol, col string,
	_ func(string) bool,
) (total, skipped, encrypted, failed int) {
	return migrateColumnWhere(ctx, db, key, table, pkCol, col,
		fmt.Sprintf("%s IS NOT NULL AND %s <> ''", col, col))
}

func migrateColumnWhere(
	ctx context.Context,
	db *sql.DB,
	key, table, pkCol, col, where string,
) (total, skipped, encrypted, failed int) {
	query := fmt.Sprintf(`SELECT %s, %s FROM %s WHERE %s`, pq.QuoteIdentifier(pkCol), pq.QuoteIdentifier(col), pq.QuoteIdentifier(table), where)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("ERROR querying %s.%s: %v", table, col, err)
		failed++
		return
	}
	defer rows.Close()

	type row struct {
		pk  string
		val string
	}
	var all []row
	for rows.Next() {
		var pk, val string
		if err := rows.Scan(&pk, &val); err != nil {
			log.Printf("WARN scan %s.%s: %v", table, col, err)
			failed++
			continue
		}
		all = append(all, row{pk, val})
	}
	if err := rows.Err(); err != nil {
		log.Printf("ERROR iterating %s.%s: %v", table, col, err)
		failed++
	}

	for _, r := range all {
		total++
		if strings.HasPrefix(r.val, "enc:") {
			skipped++
			continue
		}
		enc, err := crypto.Encrypt(r.val, key)
		if err != nil {
			log.Printf("ERROR encrypt %s pk=%s: %v", table, r.pk, err)
			failed++
			continue
		}
		upd := fmt.Sprintf(`UPDATE %s SET %s = $1 WHERE %s = $2`, pq.QuoteIdentifier(table), pq.QuoteIdentifier(col), pq.QuoteIdentifier(pkCol))
		if _, err := db.ExecContext(ctx, upd, enc, r.pk); err != nil {
			log.Printf("ERROR update %s pk=%s: %v", table, r.pk, err)
			failed++
			continue
		}
		encrypted++
	}
	return
}

// migrateColumnCompositePK handles tables with composite or non-"id" primary keys.
// pkCols lists all PK column names; the WHERE clause for the UPDATE is built from them.
func migrateColumnCompositePK(
	ctx context.Context,
	db *sql.DB,
	key, table string, pkCols []string, col, where string,
) (total, skipped, encrypted, failed int) {
	quotedPKs := make([]string, len(pkCols))
	for i, pk := range pkCols {
		quotedPKs[i] = pq.QuoteIdentifier(pk)
	}
	selectCols := strings.Join(quotedPKs, ", ") + ", " + pq.QuoteIdentifier(col)
	query := fmt.Sprintf(`SELECT %s FROM %s WHERE %s`, selectCols, pq.QuoteIdentifier(table), where)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("ERROR querying %s.%s: %v", table, col, err)
		failed++
		return
	}
	defer rows.Close()

	type row struct {
		pkVals []string
		val    string
	}
	var all []row
	for rows.Next() {
		dest := make([]interface{}, len(pkCols)+1)
		pkPtrs := make([]string, len(pkCols))
		for i := range pkCols {
			dest[i] = &pkPtrs[i]
		}
		var val string
		dest[len(pkCols)] = &val
		if err := rows.Scan(dest...); err != nil {
			log.Printf("WARN scan %s.%s: %v", table, col, err)
			failed++
			continue
		}
		all = append(all, row{pkPtrs, val})
	}
	if err := rows.Err(); err != nil {
		log.Printf("ERROR iterating %s.%s: %v", table, col, err)
		failed++
	}

	for _, r := range all {
		total++
		if strings.HasPrefix(r.val, "enc:") {
			skipped++
			continue
		}
		enc, err := crypto.Encrypt(r.val, key)
		if err != nil {
			log.Printf("ERROR encrypt %s pk=%v: %v", table, r.pkVals, err)
			failed++
			continue
		}
		// Build: UPDATE t SET col = $1 WHERE pk1 = $2 AND pk2 = $3 ...
		whereParts := make([]string, len(pkCols))
		args := make([]interface{}, len(pkCols)+1)
		args[0] = enc
		for i, c := range pkCols {
			whereParts[i] = fmt.Sprintf("%s = $%d", pq.QuoteIdentifier(c), i+2)
			args[i+1] = r.pkVals[i]
		}
		upd := fmt.Sprintf(`UPDATE %s SET %s = $1 WHERE %s`,
			pq.QuoteIdentifier(table), pq.QuoteIdentifier(col), strings.Join(whereParts, " AND "))
		if _, err := db.ExecContext(ctx, upd, args...); err != nil {
			log.Printf("ERROR update %s pk=%v: %v", table, r.pkVals, err)
			failed++
			continue
		}
		encrypted++
	}
	return
}

func report(label string, total, skipped, encrypted, failed int) {
	fmt.Printf("%-45s total=%-4d skip=%-4d enc=%-4d fail=%d\n",
		label, total, skipped, encrypted, failed)
}
