package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type SettingsHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewSettingsHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *SettingsHandler {
	return &SettingsHandler{db: db, config: cfg, logger: logger}
}

// toPostgresArray converts a []string to a PostgreSQL array literal like {val1,val2}.
func toPostgresArray(ss []string) string {
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

// GET /api/v1/providers
func (h *SettingsHandler) ListProviders(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, provider, api_key, base_url, enabled_models, endpoint_type, created_at, updated_at
		 FROM providers WHERE user_id = $1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch providers"})
	}
	defer rows.Close()

	var providers []map[string]any
	for rows.Next() {
		var id, provider, apiKey, baseURL, enabledModelsStr, endpointType string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &provider, &apiKey, &baseURL, &enabledModelsStr, &endpointType, &createdAt, &updatedAt); err != nil {
			continue
		}
		plain, _ := crypto.Decrypt(apiKey, h.config.EncryptionKey)
		providers = append(providers, map[string]any{
			"id":            id,
			"provider":      provider,
			"hasKey":        apiKey != "",
			"apiKeyMasked":  maskKey(plain),
			"baseUrl":       baseURL,
			"enabledModels": parsePostgresArray(enabledModelsStr),
			"endpointType":  endpointType,
			"created_at":    createdAt,
			"updated_at":    updatedAt,
		})
	}
	if providers == nil {
		providers = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"providers": providers})
}

// POST /api/v1/providers
func (h *SettingsHandler) UpsertProvider(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Provider      string   `json:"provider"`
		APIKey        string   `json:"apiKey"`
		BaseURL       string   `json:"baseUrl"`
		EnabledModels []string `json:"enabledModels"`
		EndpointType  string   `json:"endpointType"`
	}
	if err := c.Bind(&req); err != nil || req.Provider == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "provider is required"})
	}
	if len(req.Provider) > 100 {
		req.Provider = req.Provider[:100]
	}
	if req.BaseURL != "" && !strings.HasPrefix(req.BaseURL, "https://") {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "base_url must start with https://"})
	}
	if len(req.BaseURL) > 500 {
		req.BaseURL = req.BaseURL[:500]
	}
	if req.EndpointType == "" {
		req.EndpointType = "other"
	}
	if len(req.EndpointType) > 50 {
		req.EndpointType = req.EndpointType[:50]
	}
	if req.EnabledModels == nil {
		req.EnabledModels = []string{}
	}
	for i, m := range req.EnabledModels {
		if len(m) > 200 {
			req.EnabledModels[i] = m[:200]
		}
	}

	// Only encrypt and update the key when a non-empty value is provided.
	// Encrypting an empty string produces a non-empty ciphertext that would
	// defeat the CASE guard in the UPSERT and silently wipe the stored key.
	encryptedKey := ""
	if req.APIKey != "" {
		var encErr error
		encryptedKey, encErr = crypto.Encrypt(req.APIKey, h.config.EncryptionKey)
		if encErr != nil {
			h.logger.Error("failed to encrypt provider api key", zap.Error(encErr))
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save provider"})
		}
	}

	var id string
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO providers (id, user_id, provider, api_key, base_url, enabled_models, endpoint_type)
		 VALUES ($1, $2, $3, $4, $5, $6::TEXT[], $7)
		 ON CONFLICT (user_id, provider) DO UPDATE
		   SET api_key        = CASE WHEN EXCLUDED.api_key != '' THEN EXCLUDED.api_key ELSE providers.api_key END,
		       base_url       = EXCLUDED.base_url,
		       enabled_models = EXCLUDED.enabled_models,
		       endpoint_type  = EXCLUDED.endpoint_type,
		       updated_at     = NOW()
		 RETURNING id`,
		uuid.New(), userID, req.Provider, encryptedKey, req.BaseURL, toPostgresArray(req.EnabledModels), req.EndpointType,
	).Scan(&id)
	if err != nil {
		h.logger.Error("upsert provider failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save provider"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": id, "provider": req.Provider, "status": "saved"})
}

// DELETE /api/v1/providers/:provider
func (h *SettingsHandler) DeleteProvider(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	provider := c.Param("provider")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete provider"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/v1/providers/validate
func (h *SettingsHandler) ValidateProvider(c echo.Context) error {
	var req struct {
		Provider string `json:"provider"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	// Stub: always returns valid for now
	return c.JSON(http.StatusOK, map[string]any{"valid": true, "provider": req.Provider})
}

// GET /api/v1/providers/:provider
func (h *SettingsHandler) GetProvider(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	provider := c.Param("provider")
	var id, baseURL, enabledModelsStr, endpointType string
	var createdAt, updatedAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, base_url, enabled_models, endpoint_type, created_at, updated_at
		 FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	).Scan(&id, &baseURL, &enabledModelsStr, &endpointType, &createdAt, &updatedAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "provider not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id":            id,
		"provider":      provider,
		"baseUrl":       baseURL,
		"enabledModels": parsePostgresArray(enabledModelsStr),
		"endpointType":  endpointType,
		"created_at":    createdAt,
		"updated_at":    updatedAt,
	})
}

// GET /api/v1/model-pricing
func (h *SettingsHandler) ListModelPricing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT model, provider, input_usd, output_usd, cache_input_usd, updated_at
		 FROM model_pricing WHERE user_id = $1 ORDER BY provider, model`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch model pricing"})
	}
	defer rows.Close()

	var pricing []map[string]any
	for rows.Next() {
		var model, provider string
		var inputUSD, outputUSD, cacheInputUSD float64
		var updatedAt time.Time
		if err := rows.Scan(&model, &provider, &inputUSD, &outputUSD, &cacheInputUSD, &updatedAt); err != nil {
			continue
		}
		pricing = append(pricing, map[string]any{
			"model":          model,
			"provider":       provider,
			"input_usd":      inputUSD,
			"output_usd":     outputUSD,
			"cache_input_usd": cacheInputUSD,
			"updated_at":     updatedAt,
		})
	}
	if pricing == nil {
		pricing = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"pricing": pricing})
}

// POST /api/v1/model-pricing
func (h *SettingsHandler) UpsertModelPricing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Model        string  `json:"model"`
		Provider     string  `json:"provider"`
		InputUSD     float64 `json:"input_usd"`
		OutputUSD    float64 `json:"output_usd"`
		CacheInputUSD float64 `json:"cache_input_usd"`
	}
	if err := c.Bind(&req); err != nil || req.Model == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "model is required"})
	}
	if len(req.Model) > 200 {
		req.Model = req.Model[:200]
	}
	if len(req.Provider) > 100 {
		req.Provider = req.Provider[:100]
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO model_pricing (id, user_id, model, provider, input_usd, output_usd, cache_input_usd)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (user_id, model) DO UPDATE
		   SET provider       = EXCLUDED.provider,
		       input_usd      = EXCLUDED.input_usd,
		       output_usd     = EXCLUDED.output_usd,
		       cache_input_usd = EXCLUDED.cache_input_usd,
		       updated_at     = NOW()`,
		uuid.New(), userID, req.Model, req.Provider, req.InputUSD, req.OutputUSD, req.CacheInputUSD,
	)
	if err != nil {
		h.logger.Error("upsert model pricing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save pricing"})
	}
	return c.JSON(http.StatusOK, map[string]any{"model": req.Model, "status": "saved"})
}

// DELETE /api/v1/model-pricing/:model
func (h *SettingsHandler) DeleteModelPricing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	model := c.Param("model")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM model_pricing WHERE user_id = $1 AND model = $2`,
		userID, model,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete pricing"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /api/v1/model-assignments
func (h *SettingsHandler) ListModelAssignments(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, use_case, provider, model, updated_at FROM model_assignments WHERE user_id = $1 ORDER BY use_case`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch assignments"})
	}
	defer rows.Close()

	var assignments []map[string]any
	for rows.Next() {
		var id, useCase, provider, model string
		var updatedAt time.Time
		if err := rows.Scan(&id, &useCase, &provider, &model, &updatedAt); err != nil {
			continue
		}
		assignments = append(assignments, map[string]any{
			"id":         id,
			"use_case":   useCase,
			"provider":   provider,
			"model":      model,
			"updated_at": updatedAt,
		})
	}
	if assignments == nil {
		assignments = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"assignments": assignments})
}

// POST /api/v1/model-assignments
func (h *SettingsHandler) UpsertModelAssignment(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		UseCase  string `json:"use_case"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := c.Bind(&req); err != nil || req.UseCase == "" || req.Model == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "use_case and model are required"})
	}
	if len(req.UseCase) > 100 {
		req.UseCase = req.UseCase[:100]
	}
	if len(req.Provider) > 100 {
		req.Provider = req.Provider[:100]
	}
	if len(req.Model) > 200 {
		req.Model = req.Model[:200]
	}

	var id string
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO model_assignments (id, user_id, use_case, provider, model)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, use_case) DO UPDATE
		   SET provider   = EXCLUDED.provider,
		       model      = EXCLUDED.model,
		       updated_at = NOW()
		 RETURNING id`,
		uuid.New(), userID, req.UseCase, req.Provider, req.Model,
	).Scan(&id)
	if err != nil {
		h.logger.Error("upsert model assignment failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save assignment"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": id, "use_case": req.UseCase, "status": "saved"})
}

// DELETE /api/v1/model-assignments/:use_case
func (h *SettingsHandler) DeleteModelAssignment(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	useCase := c.Param("use_case")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM model_assignments WHERE user_id = $1 AND use_case = $2`,
		userID, useCase,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete assignment"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// GetSystemDefaults returns the system-level default models per use-case.
// No auth required — used by the settings UI before user logs in.
func (h *SettingsHandler) GetSystemDefaults(c echo.Context) error {
	d := h.config.ModelDefaults
	return c.JSON(http.StatusOK, map[string]string{
		"chat":    d.Chat,
		"report":  d.Report,
		"diary":   d.Diary,
		"goals":   d.Goals,
		"finance": d.Finance,
	})
}
