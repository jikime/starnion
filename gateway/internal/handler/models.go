package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
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
		FROM providers
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
		INSERT INTO providers (user_id, provider, api_key, base_url, enabled_models, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (user_id, provider) DO UPDATE SET
			api_key        = CASE WHEN $3 = '' THEN providers.api_key ELSE $3 END,
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
		`DELETE FROM providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// ValidateProvider POST /api/v1/providers/validate
// Body: { provider, apiKey, baseUrl }
// Returns { valid: true } or { valid: false, error: "..." }
func (h *ModelsHandler) ValidateProvider(c echo.Context) error {
	var body struct {
		Provider string `json:"provider"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid body"})
	}
	if body.Provider == "" || body.APIKey == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "provider and apiKey required"})
	}

	valid, errMsg := probeProvider(body.Provider, body.APIKey, body.BaseURL)
	if valid {
		return c.JSON(http.StatusOK, echo.Map{"valid": true})
	}
	return c.JSON(http.StatusUnauthorized, echo.Map{"valid": false, "error": errMsg})
}

// probeProvider performs a lightweight HTTP probe to validate an API key.
func probeProvider(provider, apiKey, baseURL string) (bool, string) {
	client := &http.Client{Timeout: 10 * time.Second}

	switch provider {
	case "anthropic":
		// Minimal messages request — any non-401/403 means key is accepted
		payload := map[string]interface{}{
			"model":      "claude-3-haiku-20240307",
			"max_tokens": 1,
			"messages":   []map[string]string{{"role": "user", "content": "hi"}},
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(b))
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
		req.Header.Set("content-type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return false, "Anthropic API에 연결할 수 없어요: " + err.Error()
		}
		defer resp.Body.Close()
		// 401/403 = invalid key; anything else (400, 529…) = key is valid
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return false, "API 키가 유효하지 않아요."
		}
		return true, ""

	case "openai":
		req, _ := http.NewRequest(http.MethodGet, "https://api.openai.com/v1/models", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey)

		resp, err := client.Do(req)
		if err != nil {
			return false, "OpenAI API에 연결할 수 없어요: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return false, "API 키가 유효하지 않아요."
		}
		return true, ""

	case "gemini":
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", apiKey)
		resp, err := client.Get(url)
		if err != nil {
			return false, "Google API에 연결할 수 없어요: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnauthorized ||
			resp.StatusCode == http.StatusForbidden {
			return false, "API 키가 유효하지 않아요."
		}
		return true, ""

	case "zai":
		req, _ := http.NewRequest(http.MethodGet, "https://api.z.ai/api/paas/v4/models", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey)

		resp, err := client.Do(req)
		if err != nil {
			return false, "Z.AI API에 연결할 수 없어요: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return false, "API 키가 유효하지 않아요."
		}
		return true, ""

	case "custom":
		if baseURL == "" {
			return false, "Base URL을 입력해주세요."
		}
		// For custom endpoints we skip validation (no standard probe URL)
		return true, ""

	default:
		return false, "알 수 없는 프로바이더예요: " + provider
	}
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

// builtinPersona defines one of the five built-in persona presets.
type builtinPersona struct {
	Name         string
	Description  string
	SystemPrompt string
	IsDefault    bool
}

// builtinPersonas are seeded into personas on first visit.
// NOTE: The Python agent (persona.py) controls tone for built-in personas at runtime
// and ignores this SystemPrompt field for known built-in personas.
// This SystemPrompt is kept for reference and gateway-side usage only.
var builtinPersonas = []builtinPersona{
	{
		Name:        "기본 비서",
		Description: "일상적인 질문과 업무를 도와주는 기본 AI 비서",
		SystemPrompt: "존댓말을 사용하세요 (예: '~했어요', '~할게요')\n" +
			"간결하고 핵심적인 정보를 제공하세요\n" +
			"적절한 맥락 정보를 추가하세요 (누적 금액, 비율 등)\n" +
			"과거 대화 맥락이 있으면 자연스럽게 활용하세요",
		IsDefault: true,
	},
	{
		Name:        "금융 전문가",
		Description: "재무 데이터와 수치 분석에 특화된 전문가",
		SystemPrompt: "격식체를 사용하세요 (예: '~입니다', '~됩니다')\n" +
			"전문 용어를 활용하되 이해하기 쉽게 설명하세요\n" +
			"데이터와 수치를 중심으로 분석적으로 응답하세요\n" +
			"재무 지표와 트렌드 분석을 포함하세요",
		IsDefault: false,
	},
	{
		Name:        "친한 친구",
		Description: "편하게 대화할 수 있는 친근한 친구",
		SystemPrompt: "반드시 반말만 사용하세요. 존댓말(~요, ~습니다, ~세요, ~어요)은 절대 금지입니다.\n" +
			"올바른 예시: '~했어', '~할게', '~거든', '~이야', '~해줄게', '~어때?', '~인 것 같아'\n" +
			"이모지를 자주 사용하세요 😊\n" +
			"친근하고 재미있는 표현을 쓰세요\n" +
			"친구처럼 편하게 대화하는 느낌으로 응답하세요",
		IsDefault: false,
	},
	{
		Name:        "재정 코치",
		Description: "목표 달성을 독려하고 실천 방법을 제안하는 코치",
		SystemPrompt: "격려하는 톤을 사용하세요 (예: '~해봐요!', '~할 수 있어요!')\n" +
			"목표 달성을 독려하며 긍정적인 피드백을 주세요\n" +
			"칭찬과 응원을 아끼지 마세요\n" +
			"구체적인 실천 방법을 제안하세요",
		IsDefault: false,
	},
	{
		Name:        "데이터 분석가",
		Description: "수치와 통계를 기반으로 객관적으로 분석하는 전문가",
		SystemPrompt: "객관적이고 간결하게 응답하세요\n" +
			"수치, 퍼센트, 추세를 강조하세요\n" +
			"감정적 표현을 최소화하고 팩트 위주로 전달하세요\n" +
			"비교 분석과 통계적 관점을 제공하세요",
		IsDefault: false,
	},
}

// ListPersonas GET /api/v1/personas?user_id=
func (h *ModelsHandler) ListPersonas(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "user_id required"})
	}

	ctx := c.Request().Context()

	// Seed built-in personas on first visit (count == 0).
	var count int
	if err := h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM personas WHERE user_id = $1`, userID,
	).Scan(&count); err == nil && count == 0 {
		for _, p := range builtinPersonas {
			if _, err := h.db.ExecContext(ctx, `
				INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
				VALUES ($1, $2, $3, '', '', $4, $5)
			`, userID, p.Name, p.Description, p.SystemPrompt, p.IsDefault); err != nil {
				log.Warn().Err(err).Str("persona", p.Name).Msg("seed builtin persona failed")
			}
		}
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT id::text, name, description, provider, model, system_prompt, is_default, created_at, updated_at
		FROM personas
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
			`UPDATE personas SET is_default = FALSE WHERE user_id = $1`, userID,
		); err != nil {
			log.Warn().Err(err).Msg("clear default personas failed")
		}
	}

	var id string
	err := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
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

	tx, err := h.db.BeginTx(c.Request().Context(), nil)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "tx begin failed"})
	}
	defer tx.Rollback() //nolint:errcheck

	if body.IsDefault {
		if _, err := tx.ExecContext(c.Request().Context(),
			`UPDATE personas SET is_default = FALSE WHERE user_id = $1`, userID,
		); err != nil {
			log.Error().Err(err).Msg("clear default personas failed")
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "clear default failed"})
		}
		log.Info().Str("user_id", userID).Str("persona_id", id).
			Str("name", body.Name).Msg("[Persona] setting as default")
	}

	res, err := tx.ExecContext(c.Request().Context(), `
		UPDATE personas SET
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
	if err := tx.Commit(); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "commit failed"})
	}

	log.Info().Str("user_id", userID).Str("persona_id", id).
		Str("name", body.Name).Bool("is_default", body.IsDefault).
		Str("provider", body.Provider).Str("model", body.Model).
		Msg("[Persona] updated")
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
		`DELETE FROM personas WHERE id = $1::uuid AND user_id = $2`, id, userID,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
