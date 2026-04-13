package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type SettingsRepository struct {
	db            *database.DB
	encryptionKey string
}

func NewSettingsRepository(db *database.DB, encryptionKey string) *SettingsRepository {
	return &SettingsRepository{db: db, encryptionKey: encryptionKey}
}

// ── Providers ──────────────────────────────────────────────────────

func (r *SettingsRepository) ListProviders(ctx context.Context, userID uuid.UUID) ([]entity.Provider, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, provider, api_key, base_url, enabled_models, endpoint_type, created_at, updated_at
		 FROM providers WHERE user_id = $1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres settings providers list: %w", err)
	}
	defer rows.Close()
	var out []entity.Provider
	for rows.Next() {
		var p entity.Provider
		var encKey, enabledModelsStr string
		if err := rows.Scan(&p.ID, &p.Provider, &encKey, &p.BaseURL, &enabledModelsStr, &p.EndpointType, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres settings providers scan: %w", err)
		}
		p.APIKey, _ = crypto.Decrypt(encKey, r.encryptionKey)
		p.EnabledModels = parsePgArray(enabledModelsStr)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *SettingsRepository) GetProvider(ctx context.Context, userID uuid.UUID, provider string) (entity.ProviderMeta, bool, error) {
	var meta entity.ProviderMeta
	meta.Provider = provider
	var enabledModelsStr string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, base_url, enabled_models, endpoint_type, created_at, updated_at
		 FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	).Scan(&meta.ID, &meta.BaseURL, &enabledModelsStr, &meta.EndpointType, &meta.CreatedAt, &meta.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ProviderMeta{}, false, nil
	}
	if err != nil {
		return entity.ProviderMeta{}, false, fmt.Errorf("postgres settings provider get: %w", err)
	}
	meta.EnabledModels = parsePgArray(enabledModelsStr)
	return meta, true, nil
}

func (r *SettingsRepository) UpsertProvider(ctx context.Context, userID uuid.UUID, upsert repository.ProviderUpsert) (string, error) {
	// Encrypt only when a non-empty key is provided. Encrypting an
	// empty string produces a non-empty ciphertext that would defeat
	// the CASE guard in the UPSERT and silently wipe the stored key.
	encryptedKey := ""
	if upsert.APIKey != "" {
		enc, err := crypto.Encrypt(upsert.APIKey, r.encryptionKey)
		if err != nil {
			return "", fmt.Errorf("postgres settings provider encrypt: %w", err)
		}
		encryptedKey = enc
	}
	var id string
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO providers (id, user_id, provider, api_key, base_url, enabled_models, endpoint_type)
		 VALUES ($1, $2, $3, $4, $5, $6::TEXT[], $7)
		 ON CONFLICT (user_id, provider) DO UPDATE
		   SET api_key        = CASE WHEN EXCLUDED.api_key != '' THEN EXCLUDED.api_key ELSE providers.api_key END,
		       base_url       = EXCLUDED.base_url,
		       enabled_models = EXCLUDED.enabled_models,
		       endpoint_type  = EXCLUDED.endpoint_type,
		       updated_at     = NOW()
		 RETURNING id`,
		uuid.New(), userID, upsert.Provider, encryptedKey, upsert.BaseURL,
		toPgArray(upsert.EnabledModels), upsert.EndpointType,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("postgres settings provider upsert: %w", err)
	}
	return id, nil
}

func (r *SettingsRepository) DeleteProvider(ctx context.Context, userID uuid.UUID, provider string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	)
	if err != nil {
		return fmt.Errorf("postgres settings provider delete: %w", err)
	}
	return nil
}

// ── Model pricing ──────────────────────────────────────────────────

func (r *SettingsRepository) ListModelPricing(ctx context.Context, userID uuid.UUID) ([]entity.ModelPricing, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT model, provider, input_usd, output_usd, cache_input_usd, updated_at
		 FROM model_pricing WHERE user_id = $1 ORDER BY provider, model`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres settings pricing list: %w", err)
	}
	defer rows.Close()
	var out []entity.ModelPricing
	for rows.Next() {
		var p entity.ModelPricing
		if err := rows.Scan(&p.Model, &p.Provider, &p.InputUSD, &p.OutputUSD, &p.CacheInputUSD, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres settings pricing scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *SettingsRepository) UpsertModelPricing(ctx context.Context, userID uuid.UUID, p entity.ModelPricing) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO model_pricing (id, user_id, model, provider, input_usd, output_usd, cache_input_usd)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (user_id, model) DO UPDATE
		   SET provider       = EXCLUDED.provider,
		       input_usd      = EXCLUDED.input_usd,
		       output_usd     = EXCLUDED.output_usd,
		       cache_input_usd = EXCLUDED.cache_input_usd,
		       updated_at     = NOW()`,
		uuid.New(), userID, p.Model, p.Provider, p.InputUSD, p.OutputUSD, p.CacheInputUSD,
	)
	if err != nil {
		return fmt.Errorf("postgres settings pricing upsert: %w", err)
	}
	return nil
}

func (r *SettingsRepository) DeleteModelPricing(ctx context.Context, userID uuid.UUID, model string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM model_pricing WHERE user_id = $1 AND model = $2`,
		userID, model,
	)
	if err != nil {
		return fmt.Errorf("postgres settings pricing delete: %w", err)
	}
	return nil
}

// ── Model assignments ──────────────────────────────────────────────

func (r *SettingsRepository) ListModelAssignments(ctx context.Context, userID uuid.UUID) ([]entity.ModelAssignment, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, use_case, provider, model, updated_at
		 FROM model_assignments WHERE user_id = $1 ORDER BY use_case`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres settings assignments list: %w", err)
	}
	defer rows.Close()
	var out []entity.ModelAssignment
	for rows.Next() {
		var a entity.ModelAssignment
		if err := rows.Scan(&a.ID, &a.UseCase, &a.Provider, &a.Model, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres settings assignments scan: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *SettingsRepository) UpsertModelAssignment(ctx context.Context, userID uuid.UUID, useCase, provider, model string) (string, error) {
	var id string
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO model_assignments (id, user_id, use_case, provider, model)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, use_case) DO UPDATE
		   SET provider   = EXCLUDED.provider,
		       model      = EXCLUDED.model,
		       updated_at = NOW()
		 RETURNING id`,
		uuid.New(), userID, useCase, provider, model,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("postgres settings assignment upsert: %w", err)
	}
	return id, nil
}

func (r *SettingsRepository) DeleteModelAssignment(ctx context.Context, userID uuid.UUID, useCase string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM model_assignments WHERE user_id = $1 AND use_case = $2`,
		userID, useCase,
	)
	if err != nil {
		return fmt.Errorf("postgres settings assignment delete: %w", err)
	}
	return nil
}

// ── Postgres array helpers ─────────────────────────────────────────

// parsePgArray converts a Postgres text-array literal like "{a,b,c}"
// to a []string. Empty array literal "{}" returns nil.
func parsePgArray(s string) []string {
	if s == "" || s == "{}" {
		return nil
	}
	if len(s) >= 2 && s[0] == '{' && s[len(s)-1] == '}' {
		s = s[1 : len(s)-1]
	}
	if s == "" {
		return nil
	}
	return strings.Split(s, ",")
}

// toPgArray converts a []string to a Postgres text-array literal. It
// escapes backslashes, double-quotes, and elements that contain
// special characters so TEXT[] ingestion round-trips cleanly.
func toPgArray(ss []string) string {
	if len(ss) == 0 {
		return "{}"
	}
	escaped := make([]string, len(ss))
	for i, s := range ss {
		if strings.ContainsAny(s, `{},"\`) {
			s = strings.ReplaceAll(s, `\`, `\\`)
			s = strings.ReplaceAll(s, `"`, `\"`)
			escaped[i] = `"` + s + `"`
		} else {
			escaped[i] = s
		}
	}
	return "{" + strings.Join(escaped, ",") + "}"
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.SettingsRepository = (*SettingsRepository)(nil)
