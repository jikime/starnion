// Package settings hosts the provider / model-pricing / model-
// assignment configuration use cases. Validation rules (length caps,
// https prefix on base URLs, endpoint-type defaulting) live here so
// they can be unit-tested against a fake SettingsRepository.
package settings

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	maxProviderLen     = 100
	maxBaseURLLen      = 500
	maxEndpointTypeLen = 50
	maxModelNameLen    = 200
	maxUseCaseLen      = 100
	maxEnabledModelLen = 200
)

type UseCase struct {
	repo repository.SettingsRepository
}

func NewUseCase(repo repository.SettingsRepository) *UseCase {
	return &UseCase{repo: repo}
}

// ── Providers ──────────────────────────────────────────────────────

// ProviderView is the read-side projection. APIKeyMasked is the
// "***...1234" masked form; HasKey is true iff a key is stored. The
// handler marshals this directly.
type ProviderView struct {
	ID            string
	Provider      string
	HasKey        bool
	APIKeyMasked  string
	BaseURL       string
	EnabledModels []string
	EndpointType  string
	CreatedAt     any
	UpdatedAt     any
}

func (u *UseCase) ListProviders(ctx context.Context, userID uuid.UUID) ([]ProviderView, error) {
	rows, err := u.repo.ListProviders(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]ProviderView, 0, len(rows))
	for _, p := range rows {
		models := p.EnabledModels
		if models == nil {
			models = []string{}
		}
		out = append(out, ProviderView{
			ID:            p.ID,
			Provider:      p.Provider,
			HasKey:        p.APIKey != "",
			APIKeyMasked:  MaskKey(p.APIKey),
			BaseURL:       p.BaseURL,
			EnabledModels: models,
			EndpointType:  p.EndpointType,
			CreatedAt:     p.CreatedAt,
			UpdatedAt:     p.UpdatedAt,
		})
	}
	return out, nil
}

func (u *UseCase) GetProvider(ctx context.Context, userID uuid.UUID, provider string) (entity.ProviderMeta, error) {
	meta, found, err := u.repo.GetProvider(ctx, userID, provider)
	if err != nil {
		return entity.ProviderMeta{}, err
	}
	if !found {
		return entity.ProviderMeta{}, domain.ErrNotFound
	}
	if meta.EnabledModels == nil {
		meta.EnabledModels = []string{}
	}
	return meta, nil
}

// UpsertProviderCommand is the input DTO for POST /providers. An
// empty APIKey means "keep the previously-stored key" — the repo
// guards against wiping the existing value.
type UpsertProviderCommand struct {
	Provider      string
	APIKey        string
	BaseURL       string
	EnabledModels []string
	EndpointType  string
}

func (u *UseCase) UpsertProvider(ctx context.Context, userID uuid.UUID, cmd UpsertProviderCommand) (string, error) {
	if cmd.Provider == "" {
		return "", fmt.Errorf("%w: provider is required", domain.ErrInvalidArgument)
	}
	if cmd.BaseURL != "" && !strings.HasPrefix(cmd.BaseURL, "https://") {
		return "", fmt.Errorf("%w: base_url must start with https://", domain.ErrInvalidArgument)
	}

	cmd.Provider = trim(cmd.Provider, maxProviderLen)
	cmd.BaseURL = trim(cmd.BaseURL, maxBaseURLLen)
	if cmd.EndpointType == "" {
		cmd.EndpointType = "other"
	}
	cmd.EndpointType = trim(cmd.EndpointType, maxEndpointTypeLen)
	if cmd.EnabledModels == nil {
		cmd.EnabledModels = []string{}
	}
	for i, m := range cmd.EnabledModels {
		cmd.EnabledModels[i] = trim(m, maxEnabledModelLen)
	}
	return u.repo.UpsertProvider(ctx, userID, repository.ProviderUpsert{
		Provider:      cmd.Provider,
		APIKey:        cmd.APIKey,
		BaseURL:       cmd.BaseURL,
		EnabledModels: cmd.EnabledModels,
		EndpointType:  cmd.EndpointType,
	})
}

func (u *UseCase) DeleteProvider(ctx context.Context, userID uuid.UUID, provider string) error {
	return u.repo.DeleteProvider(ctx, userID, provider)
}

// ── Model pricing ──────────────────────────────────────────────────

func (u *UseCase) ListModelPricing(ctx context.Context, userID uuid.UUID) ([]entity.ModelPricing, error) {
	rows, err := u.repo.ListModelPricing(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []entity.ModelPricing{}
	}
	return rows, nil
}

// UpsertPricingCommand is the input DTO for POST /model-pricing.
type UpsertPricingCommand struct {
	Model         string
	Provider      string
	InputUSD      float64
	OutputUSD     float64
	CacheInputUSD float64
}

func (u *UseCase) UpsertModelPricing(ctx context.Context, userID uuid.UUID, cmd UpsertPricingCommand) error {
	if cmd.Model == "" {
		return fmt.Errorf("%w: model is required", domain.ErrInvalidArgument)
	}
	return u.repo.UpsertModelPricing(ctx, userID, entity.ModelPricing{
		Model:         trim(cmd.Model, maxModelNameLen),
		Provider:      trim(cmd.Provider, maxProviderLen),
		InputUSD:      cmd.InputUSD,
		OutputUSD:     cmd.OutputUSD,
		CacheInputUSD: cmd.CacheInputUSD,
	})
}

func (u *UseCase) DeleteModelPricing(ctx context.Context, userID uuid.UUID, model string) error {
	return u.repo.DeleteModelPricing(ctx, userID, model)
}

// ── Model assignments ──────────────────────────────────────────────

func (u *UseCase) ListModelAssignments(ctx context.Context, userID uuid.UUID) ([]entity.ModelAssignment, error) {
	rows, err := u.repo.ListModelAssignments(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []entity.ModelAssignment{}
	}
	return rows, nil
}

// UpsertAssignmentCommand is the input DTO for POST /model-assignments.
type UpsertAssignmentCommand struct {
	UseCase  string
	Provider string
	Model    string
}

func (u *UseCase) UpsertModelAssignment(ctx context.Context, userID uuid.UUID, cmd UpsertAssignmentCommand) (string, error) {
	if cmd.UseCase == "" || cmd.Model == "" {
		return "", fmt.Errorf("%w: use_case and model are required", domain.ErrInvalidArgument)
	}
	return u.repo.UpsertModelAssignment(ctx, userID,
		trim(cmd.UseCase, maxUseCaseLen),
		trim(cmd.Provider, maxProviderLen),
		trim(cmd.Model, maxModelNameLen),
	)
}

func (u *UseCase) DeleteModelAssignment(ctx context.Context, userID uuid.UUID, useCase string) error {
	return u.repo.DeleteModelAssignment(ctx, userID, useCase)
}

// ── Helpers ────────────────────────────────────────────────────────

// MaskKey shows only the last 4 characters of an API key, e.g.
// "***...abcd". For "client_id:client_secret" style (naver_search)
// each half is masked independently. Exported because the handler
// needs to reach into it for a non-persisted render path.
func MaskKey(key string) string {
	if strings.Contains(key, ":") {
		parts := strings.SplitN(key, ":", 2)
		return MaskKey(parts[0]) + ":" + MaskKey(parts[1])
	}
	if len(key) <= 4 {
		return "****"
	}
	return "***..." + key[len(key)-4:]
}

func trim(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}
