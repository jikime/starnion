package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// SettingsRepository owns reads and writes for the three settings
// tables: providers, model_pricing, model_assignments. API keys are
// stored encrypted in the `providers` table; the postgres adapter
// handles crypto so the usecase layer stays plaintext-only.
type SettingsRepository interface {
	// ── Providers ──────────────────────────────────────────────────
	ListProviders(ctx context.Context, userID uuid.UUID) ([]entity.Provider, error)
	GetProvider(ctx context.Context, userID uuid.UUID, provider string) (entity.ProviderMeta, bool, error)
	// UpsertProvider writes the provider row. Passing an empty APIKey
	// keeps the previously-stored key intact (see postgres impl for
	// the CASE-based guard that preserves existing keys).
	UpsertProvider(ctx context.Context, userID uuid.UUID, upsert ProviderUpsert) (string, error)
	DeleteProvider(ctx context.Context, userID uuid.UUID, provider string) error

	// ── Model pricing ──────────────────────────────────────────────
	ListModelPricing(ctx context.Context, userID uuid.UUID) ([]entity.ModelPricing, error)
	UpsertModelPricing(ctx context.Context, userID uuid.UUID, pricing entity.ModelPricing) error
	DeleteModelPricing(ctx context.Context, userID uuid.UUID, model string) error

	// ── Model assignments ──────────────────────────────────────────
	ListModelAssignments(ctx context.Context, userID uuid.UUID) ([]entity.ModelAssignment, error)
	UpsertModelAssignment(ctx context.Context, userID uuid.UUID, useCase, provider, model string) (string, error)
	DeleteModelAssignment(ctx context.Context, userID uuid.UUID, useCase string) error
}

// ProviderUpsert is the write shape for UpsertProvider. Plaintext API
// key; the postgres impl handles encryption + the empty-key guard.
type ProviderUpsert struct {
	Provider      string
	APIKey        string // plaintext; "" = keep existing
	BaseURL       string
	EnabledModels []string
	EndpointType  string
}
