package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type IntegrationsRepository struct {
	db            *database.DB
	encryptionKey string
}

func NewIntegrationsRepository(db *database.DB, encryptionKey string) *IntegrationsRepository {
	return &IntegrationsRepository{db: db, encryptionKey: encryptionKey}
}

// ── Generic integration keys ──────────────────────────────────────

func (r *IntegrationsRepository) GetKey(ctx context.Context, userID uuid.UUID, provider string) (string, bool, error) {
	var enc string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("postgres integrations get: %w", err)
	}
	plain, _ := crypto.Decrypt(enc, r.encryptionKey)
	return plain, true, nil
}

func (r *IntegrationsRepository) ListKeys(ctx context.Context, userID uuid.UUID) ([]entity.IntegrationKey, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT provider, api_key FROM integration_keys WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres integrations list: %w", err)
	}
	defer rows.Close()
	var out []entity.IntegrationKey
	for rows.Next() {
		var k entity.IntegrationKey
		var enc string
		if err := rows.Scan(&k.Provider, &enc); err != nil {
			return nil, fmt.Errorf("postgres integrations list scan: %w", err)
		}
		k.APIKey, _ = crypto.Decrypt(enc, r.encryptionKey)
		out = append(out, k)
	}
	return out, rows.Err()
}

func (r *IntegrationsRepository) UpsertKey(ctx context.Context, userID uuid.UUID, provider, apiKey string) error {
	enc, err := crypto.Encrypt(apiKey, r.encryptionKey)
	if err != nil {
		return fmt.Errorf("postgres integrations encrypt: %w", err)
	}
	_, err = r.db.Pool().Exec(ctx,
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, provider) DO UPDATE
		   SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		userID, provider, enc,
	)
	if err != nil {
		return fmt.Errorf("postgres integrations upsert: %w", err)
	}
	return nil
}

func (r *IntegrationsRepository) DeleteKey(ctx context.Context, userID uuid.UUID, provider string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	)
	if err != nil {
		return fmt.Errorf("postgres integrations delete: %w", err)
	}
	return nil
}

// ── Google tokens ─────────────────────────────────────────────────

func (r *IntegrationsRepository) GetGoogleTokens(ctx context.Context, userID uuid.UUID) (entity.GoogleTokens, bool, error) {
	var encAccess, encRefresh, scopes string
	var t entity.GoogleTokens
	err := r.db.Pool().QueryRow(ctx,
		`SELECT access_token, refresh_token, scopes, expires_at FROM google_tokens WHERE user_id = $1`,
		userID,
	).Scan(&encAccess, &encRefresh, &scopes, &t.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.GoogleTokens{}, false, nil
	}
	if err != nil {
		return entity.GoogleTokens{}, false, fmt.Errorf("postgres google tokens get: %w", err)
	}
	t.AccessToken, _ = crypto.Decrypt(encAccess, r.encryptionKey)
	t.RefreshToken, _ = crypto.Decrypt(encRefresh, r.encryptionKey)
	t.Scopes = scopes
	return t, true, nil
}

func (r *IntegrationsRepository) UpsertGoogleTokens(ctx context.Context, userID uuid.UUID, t entity.GoogleTokens) error {
	encAccess, err := crypto.Encrypt(t.AccessToken, r.encryptionKey)
	if err != nil {
		return fmt.Errorf("postgres google tokens access encrypt: %w", err)
	}
	encRefresh, err := crypto.Encrypt(t.RefreshToken, r.encryptionKey)
	if err != nil {
		return fmt.Errorf("postgres google tokens refresh encrypt: %w", err)
	}
	_, err = r.db.Pool().Exec(ctx,
		`INSERT INTO google_tokens (user_id, access_token, refresh_token, scopes, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id) DO UPDATE
		   SET access_token  = EXCLUDED.access_token,
		       refresh_token = CASE WHEN EXCLUDED.refresh_token <> '' THEN EXCLUDED.refresh_token ELSE google_tokens.refresh_token END,
		       scopes        = EXCLUDED.scopes,
		       expires_at    = EXCLUDED.expires_at,
		       updated_at    = NOW()`,
		userID, encAccess, encRefresh, t.Scopes, t.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("postgres google tokens upsert: %w", err)
	}
	return nil
}

func (r *IntegrationsRepository) DeleteGoogleTokens(ctx context.Context, userID uuid.UUID) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM google_tokens WHERE user_id = $1`, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres google tokens delete: %w", err)
	}
	return nil
}

func (r *IntegrationsRepository) GetGoogleAccessToken(ctx context.Context, userID uuid.UUID) (string, error) {
	var enc string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT access_token FROM google_tokens WHERE user_id = $1`, userID,
	).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("postgres google access token get: %w", err)
	}
	plain, _ := crypto.Decrypt(enc, r.encryptionKey)
	return plain, nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.IntegrationsRepository = (*IntegrationsRepository)(nil)
