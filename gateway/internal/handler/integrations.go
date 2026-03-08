package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// IntegrationHandler provides REST endpoints for managing external service integrations.
type IntegrationHandler struct {
	db        *sql.DB
	googleCfg GoogleOAuthConfig
}

// NewIntegrationHandler creates a new IntegrationHandler.
func NewIntegrationHandler(db *sql.DB, cfg GoogleOAuthConfig) *IntegrationHandler {
	return &IntegrationHandler{db: db, googleCfg: cfg}
}

// integrationStatus represents the connection state of a single provider.
type integrationStatus struct {
	Connected bool   `json:"connected"`
	Email     string `json:"email,omitempty"`   // Google only
	Scopes    string `json:"scopes,omitempty"`  // Google only
}

// Status returns the connection state of all integrations for the current user.
// GET /api/v1/integrations/status?user_id=...
func (h *IntegrationHandler) Status(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	result := map[string]integrationStatus{}

	// ── Google ──────────────────────────────────────────────────────────────
	// Tokens may be stored under the web UUID (new web OAuth flow) OR under
	// the Telegram platform_id (legacy Telegram bot flow). Check both.
	var googleScopes string
	err := h.db.QueryRowContext(c.Request().Context(), `
		SELECT scopes FROM google_tokens WHERE user_id = $1
		UNION ALL
		SELECT gt.scopes FROM google_tokens gt
		JOIN platform_identities pi ON pi.platform_id = gt.user_id AND pi.platform = 'telegram'
		WHERE pi.user_id = $1
		LIMIT 1
	`, userID).Scan(&googleScopes)
	if err == nil {
		result["google"] = integrationStatus{Connected: true, Scopes: googleScopes}
	} else {
		result["google"] = integrationStatus{Connected: false}
	}

	// ── Notion ───────────────────────────────────────────────────────────────
	var notionKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'notion'`, userID,
	).Scan(&notionKey)
	result["notion"] = integrationStatus{Connected: err == nil && notionKey != ""}

	// ── GitHub ───────────────────────────────────────────────────────────────
	var githubKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'github'`, userID,
	).Scan(&githubKey)
	result["github"] = integrationStatus{Connected: err == nil && githubKey != ""}

	// ── Tavily ───────────────────────────────────────────────────────────────
	var tavilyKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'tavily'`, userID,
	).Scan(&tavilyKey)
	result["tavily"] = integrationStatus{Connected: err == nil && tavilyKey != ""}

	// ── Naver Search ─────────────────────────────────────────────────────────
	var naverKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'naver_search'`, userID,
	).Scan(&naverKey)
	result["naver_search"] = integrationStatus{Connected: err == nil && naverKey != ""}

	// ── Gemini ───────────────────────────────────────────────────────────────
	var geminiKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'gemini'`, userID,
	).Scan(&geminiKey)
	result["gemini"] = integrationStatus{Connected: err == nil && geminiKey != ""}

	return c.JSON(http.StatusOK, result)
}

// TavilyConnect saves (or updates) a Tavily API key for the user.
// PUT /api/v1/integrations/tavily  Body: { "user_id": "...", "api_key": "..." }
func (h *IntegrationHandler) TavilyConnect(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and api_key required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, 'tavily', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		req.UserID, req.APIKey,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("integrations: tavily connect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// TavilyDisconnect removes the Tavily API key for the user.
// DELETE /api/v1/integrations/tavily?user_id=...
func (h *IntegrationHandler) TavilyDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = 'tavily'`, userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: tavily disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// GoogleAuthURL returns the Google OAuth2 authorization URL for web users.
// GET /api/v1/integrations/google/auth-url?user_id=...
func (h *IntegrationHandler) GoogleAuthURL(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	clientID := h.googleCfg.ClientID
	redirectURI := h.googleCfg.RedirectURI

	if clientID == "" || redirectURI == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error": "Google OAuth not configured — run: starnion config google",
		})
	}

	scopes := []string{
		"https://www.googleapis.com/auth/calendar",
		"https://www.googleapis.com/auth/gmail.modify",
		"https://www.googleapis.com/auth/drive",
		"https://www.googleapis.com/auth/documents",
		"https://www.googleapis.com/auth/tasks",
	}

	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", redirectURI)
	params.Set("response_type", "code")
	params.Set("access_type", "offline")
	params.Set("prompt", "consent")
	params.Set("state", fmt.Sprintf("web:%s", userID)) // "web:" prefix tells callback to redirect
	for i, s := range scopes {
		if i == 0 {
			params.Set("scope", s)
		} else {
			params["scope"][0] += " " + s
		}
	}

	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
	return c.JSON(http.StatusOK, map[string]string{"url": authURL})
}

// GoogleDisconnect removes the Google tokens for the current user.
// DELETE /api/v1/integrations/google?user_id=...
func (h *IntegrationHandler) GoogleDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(), `
		DELETE FROM google_tokens
		WHERE user_id = $1
		   OR user_id IN (
		       SELECT platform_id FROM platform_identities
		       WHERE user_id = $1 AND platform = 'telegram'
		   )
	`, userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: google disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// NotionConnect saves (or updates) a Notion API key for the user.
// PUT /api/v1/integrations/notion  Body: { "user_id": "...", "api_key": "..." }
func (h *IntegrationHandler) NotionConnect(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and api_key required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, 'notion', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		req.UserID, req.APIKey,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("integrations: notion connect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// NotionDisconnect removes the Notion API key for the user.
// DELETE /api/v1/integrations/notion?user_id=...
func (h *IntegrationHandler) NotionDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = 'notion'`, userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: notion disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// NaverSearchConnect saves (or updates) a Naver Search API client credentials for the user.
// PUT /api/v1/integrations/naver_search  Body: { "user_id": "...", "api_key": "client_id:client_secret" }
func (h *IntegrationHandler) NaverSearchConnect(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		APIKey string `json:"api_key"` // stored as "client_id:client_secret"
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and api_key required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, 'naver_search', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		req.UserID, req.APIKey,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("integrations: naver_search connect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// NaverSearchDisconnect removes the Naver Search credentials for the user.
// DELETE /api/v1/integrations/naver_search?user_id=...
func (h *IntegrationHandler) NaverSearchDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = 'naver_search'`, userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: naver_search disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// GeminiConnect saves (or updates) a Gemini API key for the user.
// PUT /api/v1/integrations/gemini  Body: { "user_id": "...", "api_key": "..." }
func (h *IntegrationHandler) GeminiConnect(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and api_key required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, 'gemini', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		req.UserID, req.APIKey,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("integrations: gemini connect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// GeminiDisconnect removes the Gemini API key for the user.
// DELETE /api/v1/integrations/gemini?user_id=...
func (h *IntegrationHandler) GeminiDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = 'gemini'`, userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: gemini disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// GitHubConnect saves (or updates) a GitHub PAT for the user.
// PUT /api/v1/integrations/github  Body: { "user_id": "...", "api_key": "..." }
func (h *IntegrationHandler) GitHubConnect(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and api_key required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, 'github', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		req.UserID, req.APIKey,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("integrations: github connect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// GitHubDisconnect removes the GitHub PAT for the user.
// DELETE /api/v1/integrations/github?user_id=...
func (h *IntegrationHandler) GitHubDisconnect(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	_, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = 'github'`, userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("integrations: github disconnect failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "disconnect failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}
