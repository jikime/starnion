package handler

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
)

// ModelsHandler handles per-user provider and persona CRUD.
type ModelsHandler struct {
	db *sql.DB
}

// NewModelsHandler creates a ModelsHandler.
func NewModelsHandler(db *sql.DB) *ModelsHandler {
	return &ModelsHandler{db: db}
}

// ── Provider types ─────────────────────────────────────────────────────────

type providerResp struct {
	Provider      string    `json:"provider"`
	APIKeyMasked  string    `json:"apiKeyMasked"`  // masked for display
	HasKey        bool      `json:"hasKey"`
	BaseURL       string    `json:"baseUrl"`
	EnabledModels []string  `json:"enabledModels"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// ListProviders GET /api/v1/providers?user_id=
func (h *ModelsHandler) ListProviders(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id required"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT provider, api_key, base_url, enabled_models, updated_at
		FROM user_providers
		WHERE user_id = $1
		ORDER BY provider
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("ListProviders query failed")
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "query failed"})
	}
	defer rows.Close()

	result := []providerResp{}
	for rows.Next() {
		var provider, apiKey, baseURL string
		var models pq.StringArray
		var updatedAt time.Time
		if err := rows.Scan(&provider, &apiKey, &baseURL, &models, &updatedAt); err != nil {
			continue
		}
		masked := ""
		if len(apiKey) > 8 {
			masked = apiKey[:4] + "..." + apiKey[len(apiKey)-4:]
		} else if apiKey != "" {
			masked = "••••"
		}
		result = append(result, providerResp{
			Provider:      provider,
			APIKeyMasked:  masked,
			HasKey:        apiKey != "",
			BaseURL:       baseURL,
			EnabledModels: []string(models),
			UpdatedAt:     updatedAt,
		})
	}
	return c.JSON(http.StatusOK, echo.Map{"providers": result})
}

// UpsertProvider POST /api/v1/providers?user_id=
// Body: { provider, apiKey, baseUrl, enabledModels }
// If apiKey is "" the existing key is kept (allows updating models without re-entering key).
func (h *ModelsHandler) UpsertProvider(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id required"})
	}

	var body struct {
		Provider      string   `json:"provider"`
		APIKey        string   `json:"apiKey"`
		BaseURL       string   `json:"baseUrl"`
		EnabledModels []string `json:"enabledModels"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid body"})
	}
	if body.Provider == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "provider required"})
	}
	if body.EnabledModels == nil {
		body.EnabledModels = []string{}
	}

	_, err := h.db.ExecContext(c.Request().Context(), `
		INSERT INTO user_providers (user_id, provider, api_key, base_url, enabled_models, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (user_id, provider) DO UPDATE SET
			api_key        = CASE WHEN $3 = '' THEN user_providers.api_key ELSE $3 END,
			base_url       = $4,
			enabled_models = $5,
			updated_at     = NOW()
	`, userID, body.Provider, body.APIKey, body.BaseURL, pq.Array(body.EnabledModels))
	if err != nil {
		log.Error().Err(err).Str("provider", body.Provider).Msg("UpsertProvider failed")
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// DeleteProvider DELETE /api/v1/providers/:provider?user_id=
func (h *ModelsHandler) DeleteProvider(c echo.Context) error {
	userID := c.QueryParam("user_id")
	provider := c.Param("provider")
	if userID == "" || provider == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id and provider required"})
	}

	if _, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM user_providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// ── Persona types ──────────────────────────────────────────────────────────

type personaResp struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Provider     string    `json:"provider"`
	Model        string    `json:"model"`
	SystemPrompt string    `json:"systemPrompt"`
	IsDefault    bool      `json:"isDefault"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// ListPersonas GET /api/v1/personas?user_id=
func (h *ModelsHandler) ListPersonas(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id required"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT id::text, name, description, provider, model, system_prompt, is_default, created_at, updated_at
		FROM user_personas
		WHERE user_id = $1
		ORDER BY is_default DESC, created_at ASC
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("ListPersonas query failed")
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "query failed"})
	}
	defer rows.Close()

	result := []personaResp{}
	for rows.Next() {
		var r personaResp
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Provider, &r.Model,
			&r.SystemPrompt, &r.IsDefault, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return c.JSON(http.StatusOK, echo.Map{"personas": result})
}

// CreatePersona POST /api/v1/personas?user_id=
func (h *ModelsHandler) CreatePersona(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id required"})
	}

	var body struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		SystemPrompt string `json:"systemPrompt"`
		IsDefault    bool   `json:"isDefault"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid body"})
	}
	if body.Name == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "name required"})
	}

	if body.IsDefault {
		if _, err := h.db.ExecContext(c.Request().Context(),
			`UPDATE user_personas SET is_default = FALSE WHERE user_id = $1`, userID,
		); err != nil {
			log.Warn().Err(err).Msg("clear default personas failed")
		}
	}

	var id string
	err := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO user_personas (user_id, name, description, provider, model, system_prompt, is_default)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text
	`, userID, body.Name, body.Description, body.Provider, body.Model, body.SystemPrompt, body.IsDefault).Scan(&id)
	if err != nil {
		log.Error().Err(err).Msg("CreatePersona failed")
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "create failed"})
	}
	return c.JSON(http.StatusCreated, echo.Map{"id": id})
}

// UpdatePersona PUT /api/v1/personas/:id?user_id=
func (h *ModelsHandler) UpdatePersona(c echo.Context) error {
	userID := c.QueryParam("user_id")
	id := c.Param("id")
	if userID == "" || id == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id and id required"})
	}

	var body struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		SystemPrompt string `json:"systemPrompt"`
		IsDefault    bool   `json:"isDefault"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid body"})
	}

	if body.IsDefault {
		if _, err := h.db.ExecContext(c.Request().Context(),
			`UPDATE user_personas SET is_default = FALSE WHERE user_id = $1`, userID,
		); err != nil {
			log.Warn().Err(err).Msg("clear default personas failed")
		}
	}

	res, err := h.db.ExecContext(c.Request().Context(), `
		UPDATE user_personas SET
			name          = $3,
			description   = $4,
			provider      = $5,
			model         = $6,
			system_prompt = $7,
			is_default    = $8,
			updated_at    = NOW()
		WHERE id = $1::uuid AND user_id = $2
	`, id, userID, body.Name, body.Description, body.Provider, body.Model, body.SystemPrompt, body.IsDefault)
	if err != nil {
		log.Error().Err(err).Msg("UpdatePersona failed")
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "update failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "not found"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// DeletePersona DELETE /api/v1/personas/:id?user_id=
func (h *ModelsHandler) DeletePersona(c echo.Context) error {
	userID := c.QueryParam("user_id")
	id := c.Param("id")
	if userID == "" || id == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id and id required"})
	}

	if _, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM user_personas WHERE id = $1::uuid AND user_id = $2`, id, userID,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
