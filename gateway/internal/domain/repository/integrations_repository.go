package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// IntegrationsRepository owns reads/writes for integration_keys and
// google_tokens. Plaintext keys and tokens flow across this port —
// the postgres adapter handles encryption/decryption.
type IntegrationsRepository interface {
	// ── Generic integration keys ──────────────────────────────────
	GetKey(ctx context.Context, userID uuid.UUID, provider string) (string, bool, error)
	ListKeys(ctx context.Context, userID uuid.UUID) ([]entity.IntegrationKey, error)
	UpsertKey(ctx context.Context, userID uuid.UUID, provider, apiKey string) error
	DeleteKey(ctx context.Context, userID uuid.UUID, provider string) error

	// ── Google OAuth tokens ───────────────────────────────────────
	GetGoogleTokens(ctx context.Context, userID uuid.UUID) (entity.GoogleTokens, bool, error)
	UpsertGoogleTokens(ctx context.Context, userID uuid.UUID, tokens entity.GoogleTokens) error
	DeleteGoogleTokens(ctx context.Context, userID uuid.UUID) error

	// GetGoogleAccessToken is a narrow read used by the disconnect
	// flow — it returns just the plaintext access token (or "").
	GetGoogleAccessToken(ctx context.Context, userID uuid.UUID) (string, error)
}
