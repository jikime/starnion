package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// GoogleOAuthConfig holds the server-level Google OAuth2 credentials.
// These are set once by the administrator and shared by all users.
type GoogleOAuthConfig struct {
	ClientID       string
	ClientSecret   string
	RedirectURI    string // Telegram flow: points to gateway callback
	WebCallbackURI string // Web flow: points to UI callback (optional, falls back to RedirectURI)
}

// GoogleCallbackHandler handles the OAuth2 callback from Google.
type GoogleCallbackHandler struct {
	db         *sql.DB
	googleCfg  GoogleOAuthConfig
}

// NewGoogleCallbackHandler creates a new Google OAuth callback handler.
func NewGoogleCallbackHandler(db *sql.DB, cfg GoogleOAuthConfig) *GoogleCallbackHandler {
	return &GoogleCallbackHandler{db: db, googleCfg: cfg}
}

// tokenResponse represents the Google OAuth2 token exchange response.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

// exchangeCode exchanges a Google OAuth authorization code for tokens.
func (h *GoogleCallbackHandler) exchangeCode(ctx context.Context, code, redirectURI string) (tokenResponse, error) {
	tokenReq := fmt.Sprintf(
		"code=%s&client_id=%s&client_secret=%s&redirect_uri=%s&grant_type=authorization_code",
		code, h.googleCfg.ClientID, h.googleCfg.ClientSecret, redirectURI,
	)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/token",
		strings.NewReader(tokenReq),
	)
	if err != nil {
		return tokenResponse{}, fmt.Errorf("create token request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return tokenResponse{}, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var tokens tokenResponse
	if err := json.Unmarshal(body, &tokens); err != nil {
		return tokenResponse{}, fmt.Errorf("parse token response: %w", err)
	}
	if tokens.AccessToken == "" {
		return tokenResponse{}, fmt.Errorf("no access_token in response: %s", body)
	}
	return tokens, nil
}

// storeTokens upserts Google tokens for the given user.
func (h *GoogleCallbackHandler) storeTokens(ctx context.Context, userID string, tokens tokenResponse) error {
	expiresAt := time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO google_tokens (user_id, access_token, refresh_token, scopes, expires_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (user_id) DO UPDATE SET
		   access_token = EXCLUDED.access_token,
		   refresh_token = EXCLUDED.refresh_token,
		   scopes = EXCLUDED.scopes,
		   expires_at = EXCLUDED.expires_at,
		   updated_at = NOW()`,
		userID, tokens.AccessToken, tokens.RefreshToken, tokens.Scope, expiresAt,
	)
	return err
}

// Callback handles GET /auth/google/callback — used only by the Telegram OAuth flow.
// The web OAuth flow is handled by the UI (POST /api/v1/integrations/google/callback).
func (h *GoogleCallbackHandler) Callback(c echo.Context) error {
	code := c.QueryParam("code")
	state := c.QueryParam("state") // state = user_id (Telegram) or "web:{user_id}" (legacy web)
	errParam := c.QueryParam("error")

	isWeb := strings.HasPrefix(state, "web:")

	if errParam != "" {
		log.Warn().Str("error", errParam).Msg("Google OAuth error")
		if isWeb {
			return c.Redirect(http.StatusFound, "/settings/integrations?error=google")
		}
		return c.HTML(http.StatusOK, "<h2>구글 연동이 취소되었어요.</h2><p>텔레그램으로 돌아가주세요.</p>")
	}

	if code == "" || state == "" {
		return c.HTML(http.StatusBadRequest, "<h2>잘못된 요청이에요.</h2>")
	}

	userID := state
	if isWeb {
		userID = strings.TrimPrefix(state, "web:")
	}

	if h.googleCfg.ClientID == "" || h.googleCfg.ClientSecret == "" {
		log.Error().Msg("Google OAuth credentials not configured")
		return c.HTML(http.StatusInternalServerError,
			"<h2>서버 설정 오류</h2><p>관리자에게 Google OAuth 설정을 요청하세요.<br>"+
				"<code>starnion config google</code></p>")
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	tokens, err := h.exchangeCode(ctx, code, h.googleCfg.RedirectURI)
	if err != nil {
		log.Error().Err(err).Msg("Failed to exchange Google OAuth code")
		return c.HTML(http.StatusInternalServerError, "<h2>토큰 교환 실패</h2>")
	}

	if err := h.storeTokens(ctx, userID, tokens); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("Failed to store Google tokens")
		return c.HTML(http.StatusInternalServerError, "<h2>토큰 저장 실패</h2>")
	}

	log.Info().Str("user_id", userID).Msg("Google OAuth tokens stored successfully")

	if isWeb {
		return c.Redirect(http.StatusFound, "/settings/integrations?connected=google")
	}
	return c.HTML(http.StatusOK,
		"<h2>구글 계정 연동 완료!</h2>"+
			"<p>텔레그램으로 돌아가서 구글 서비스를 사용해보세요.</p>"+
			"<p>이 창은 닫아도 됩니다.</p>",
	)
}

// WebCallback handles POST /api/v1/integrations/google/callback (JWT-authenticated).
// Called by the UI's /api/auth/google/callback route after Google redirects there.
// Body: { "code": "...", "state": "web:{userID}" }
func (h *GoogleCallbackHandler) WebCallback(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Code  string `json:"code"`
		State string `json:"state"`
	}
	if err := c.Bind(&req); err != nil || req.Code == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
	}

	// Validate state to prevent CSRF.
	if req.State != "web:"+userID {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "state mismatch"})
	}

	if h.googleCfg.ClientID == "" || h.googleCfg.ClientSecret == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error": "Google OAuth not configured — run: starnion config google",
		})
	}

	redirectURI := h.googleCfg.WebCallbackURI
	if redirectURI == "" {
		redirectURI = h.googleCfg.RedirectURI
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	tokens, err := h.exchangeCode(ctx, req.Code, redirectURI)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("Failed to exchange Google OAuth code (web)")
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "token exchange failed"})
	}

	if err := h.storeTokens(ctx, userID, tokens); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("Failed to store Google tokens (web)")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to store tokens"})
	}

	log.Info().Str("user_id", userID).Msg("Google OAuth tokens stored via UI callback")
	return c.JSON(http.StatusOK, map[string]string{"status": "connected"})
}

// TelegramOAuthStart handles GET /auth/google/telegram?uid=<user_id>
// Generates a Google OAuth2 URL and redirects the browser directly.
// This avoids Telegram Markdown underscore-stripping issues that corrupt
// query parameter names (response_type → responsetype) when the full URL
// is sent as a chat message.
func (h *GoogleCallbackHandler) TelegramOAuthStart(c echo.Context) error {
	userID := c.QueryParam("uid")
	if userID == "" {
		return c.HTML(http.StatusBadRequest, "<h2>uid 파라미터가 필요해요.</h2>")
	}

	clientID := h.googleCfg.ClientID
	redirectURI := h.googleCfg.RedirectURI

	if clientID == "" {
		return c.HTML(http.StatusInternalServerError,
			"<h2>구글 설정이 올바르지 않아요.</h2><p>관리자에게 문의하세요.</p>")
	}

	scopes := []string{
		"https://www.googleapis.com/auth/calendar",
		"https://www.googleapis.com/auth/documents",
		"https://www.googleapis.com/auth/tasks",
		"https://www.googleapis.com/auth/drive.file",
		"https://www.googleapis.com/auth/gmail.compose",
		"https://www.googleapis.com/auth/gmail.readonly",
	}

	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", redirectURI)
	params.Set("response_type", "code")
	params.Set("access_type", "offline")
	params.Set("prompt", "consent")
	params.Set("state", userID) // no "web:" prefix → Telegram flow
	params.Set("scope", strings.Join(scopes, " "))
	params.Set("include_granted_scopes", "true")

	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
	log.Info().Str("user_id", userID).Msg("Telegram OAuth start redirect")
	return c.Redirect(http.StatusFound, authURL)
}
