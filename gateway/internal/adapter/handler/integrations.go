package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// googleHTTPClient is used for all outbound Google OAuth calls.
// A 15-second timeout prevents hanging goroutines if the Google endpoint is slow.
var googleHTTPClient = &http.Client{Timeout: 15 * time.Second}

// googleOAuthSuccessHTML is returned to the popup window after a successful OAuth flow.
// It sends a postMessage to the opener so the parent page can react, then closes itself.
const googleOAuthSuccessHTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Google 연결 완료</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'google-oauth-success' }, '*');
    window.close();
  } else {
    document.body.innerText = 'Google 계정이 연결되었습니다. 이 창을 닫아 주세요.';
  }
</script>
</body>
</html>`

// IntegrationsHandler manages third-party API key storage in the integration_keys table.
// Supported providers: tavily, naver_search, gemini, github, notion (and any future additions).
// Google OAuth is handled separately via /integrations/google/* routes.

// NaverMapClientConfig returns the decrypted client_id for the Naver Maps JS SDK,
// plus whether naver_search is configured (needed for agent geocoding).
// Only client_id (ncpKeyId) is exposed to the browser — client_secret stays server-side.
// JS SDK URL: oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId={client_id}
// GET /api/v1/integrations/naver_map/client-config
func (h *IntegrationsHandler) NaverMapClientConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	var encKey string
	err = h.db.QueryRowContext(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'naver_map'`,
		userID,
	).Scan(&encKey)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"configured":        false,
			"search_configured": false,
		})
	}

	plain, err := crypto.Decrypt(encKey, h.config.EncryptionKey)
	if err != nil || plain == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"configured":        false,
			"search_configured": false,
		})
	}

	clientID, _, found := strings.Cut(plain, ":")
	if !found || clientID == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"configured":        false,
			"search_configured": false,
		})
	}

	// Check if naver_search is also configured (needed for agent geocoding)
	var searchKey string
	searchConfigured := h.db.QueryRowContext(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'naver_search' LIMIT 1`,
		userID,
	).Scan(&searchKey) == nil

	return c.JSON(http.StatusOK, map[string]any{
		"configured":        true,
		"client_id":         clientID,
		"search_configured": searchConfigured,
	})
}

// allowedProviders is the whitelist for the :name path parameter in Upsert/Get/Delete.
var allowedProviders = map[string]bool{
	"tavily":       true,
	"naver_search": true,
	"naver_map":    true,
	"gemini":       true,
	"github":       true,
	"notion":       true,
	"google":       true,
	"openai":       true,
	"groq":         true,
}

type IntegrationsHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewIntegrationsHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *IntegrationsHandler {
	return &IntegrationsHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/integrations/:name
// Returns {"integration": name, "enabled": bool, "masked_key": "***...last4"}
func (h *IntegrationsHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	name := c.Param("name")
	if !allowedProviders[name] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unknown provider"})
	}

	var apiKey string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, name,
	).Scan(&apiKey)

	if err != nil {
		// Not found = not configured
		return c.JSON(http.StatusOK, map[string]any{
			"integration": name,
			"enabled":     false,
			"masked_key":  nil,
		})
	}

	plain, _ := crypto.Decrypt(apiKey, h.config.EncryptionKey)
	return c.JSON(http.StatusOK, map[string]any{
		"integration": name,
		"enabled":     true,
		"masked_key":  maskKey(plain),
	})
}

// GET /api/v1/integrations/status
// Returns all configured integrations for the user as a map.
func (h *IntegrationsHandler) Status(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT provider, api_key FROM integration_keys WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch integrations"})
	}
	defer rows.Close()

	status := map[string]any{}
	for rows.Next() {
		var provider, apiKey string
		if rows.Scan(&provider, &apiKey) == nil {
			plain, _ := crypto.Decrypt(apiKey, h.config.EncryptionKey)
			status[provider] = map[string]any{
				"enabled":    true,
				"masked_key": maskKey(plain),
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{"integrations": status})
}

// PUT /api/v1/integrations/:name  {"api_key": "..."}
func (h *IntegrationsHandler) Upsert(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	name := c.Param("name")
	if !allowedProviders[name] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unknown provider"})
	}

	var req struct {
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "api_key is required"})
	}

	encrypted, err := crypto.Encrypt(req.APIKey, h.config.EncryptionKey)
	if err != nil {
		h.logger.Error("failed to encrypt api key", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save integration"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, provider) DO UPDATE
		   SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		userID, name, encrypted,
	)
	if err != nil {
		h.logger.Error("failed to upsert integration key", zap.String("provider", name), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save integration"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"status":      "saved",
		"integration": name,
		"enabled":     true,
		"masked_key":  maskKey(req.APIKey),
	})
}

// DELETE /api/v1/integrations/:name
func (h *IntegrationsHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	name := c.Param("name")
	if !allowedProviders[name] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unknown provider"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, name,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete integration"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
)

// GET /api/v1/integrations/google/auth-url
// Returns the Google OAuth consent screen URL.
// Tries per-user credentials from integration_keys first; falls back to env vars.
func (h *IntegrationsHandler) GoogleAuthURL(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	clientID := h.resolveGoogleClientID(c.Request().Context(), userID.String())
	if clientID == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"url":     nil,
			"enabled": false,
			"message": "Google OAuth not configured (set GOOGLE_CLIENT_ID or configure via Google Workspace skill)",
		})
	}

	// Use HMAC-signed state to prevent CSRF
	state := oauthState(userID.String(), h.config.JWTSecret)
	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {h.config.GoogleRedirectURL},
		"response_type": {"code"},
		"scope":         {"openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly"},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
		"state":         {state},
	}
	authURL := googleAuthURL + "?" + params.Encode()

	return c.JSON(http.StatusOK, map[string]any{
		"url":     authURL,
		"enabled": true,
	})
}

// resolveGoogleClientID returns the per-user client_id from integration_keys,
// falling back to the server-wide GOOGLE_CLIENT_ID env var.
func (h *IntegrationsHandler) resolveGoogleClientID(ctx context.Context, userID string) string {
	var enc string
	if err := h.db.QueryRowContext(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'google'`,
		userID,
	).Scan(&enc); err == nil {
		raw, _ := crypto.Decrypt(enc, h.config.EncryptionKey)
		if strings.Contains(raw, ":") {
			return strings.SplitN(raw, ":", 2)[0]
		}
	}
	return h.config.GoogleClientID
}

// resolveGoogleCredentials returns (clientID, clientSecret) for a given user.
// Prefers per-user credentials from integration_keys; falls back to env vars.
func (h *IntegrationsHandler) resolveGoogleCredentials(ctx context.Context, userID string) (clientID, clientSecret string) {
	var enc string
	if err := h.db.QueryRowContext(ctx,
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = 'google'`,
		userID,
	).Scan(&enc); err == nil {
		raw, _ := crypto.Decrypt(enc, h.config.EncryptionKey)
		if strings.Contains(raw, ":") {
			parts := strings.SplitN(raw, ":", 2)
			return parts[0], parts[1]
		}
	}
	return h.config.GoogleClientID, h.config.GoogleClientSecret
}

// GET /api/v1/integrations/google/callback?code=...&state=...
// Called by Google after user consent. Exchanges code for tokens and stores them.
// Tries per-user credentials (from integration_keys) first; falls back to env vars.
func (h *IntegrationsHandler) GoogleCallback(c echo.Context) error {
	code := c.QueryParam("code")
	state := c.QueryParam("state")

	// Support POST with JSON body (from web proxy route)
	if code == "" || state == "" {
		var body struct {
			Code  string `json:"code"`
			State string `json:"state"`
		}
		if err := c.Bind(&body); err == nil {
			if code == "" {
				code = body.Code
			}
			if state == "" {
				state = body.State
			}
		}
	}

	if code == "" || state == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "code and state are required"})
	}

	// Verify HMAC-signed state and extract userID
	stateUserID, ok := verifyOAuthState(state, h.config.JWTSecret)
	if !ok {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid state parameter"})
	}

	ctx := c.Request().Context()

	clientID, clientSecret := h.resolveGoogleCredentials(ctx, stateUserID)
	if clientID == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "Google OAuth not configured"})
	}

	// Exchange authorization code for tokens
	tokens, err := exchangeGoogleCode(ctx, clientID, clientSecret, h.config.GoogleRedirectURL, code)
	if err != nil {
		h.logger.Error("Google token exchange failed", zap.Error(err))
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to exchange code"})
	}

	// Encrypt tokens before persisting
	encAccessToken, err := crypto.Encrypt(tokens.AccessToken, h.config.EncryptionKey)
	if err != nil {
		h.logger.Error("failed to encrypt Google access token", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save tokens"})
	}
	encRefreshToken, err := crypto.Encrypt(tokens.RefreshToken, h.config.EncryptionKey)
	if err != nil {
		h.logger.Error("failed to encrypt Google refresh token", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save tokens"})
	}

	// Persist tokens
	_, err = h.db.ExecContext(ctx,
		`INSERT INTO google_tokens (user_id, access_token, refresh_token, scopes, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id) DO UPDATE
		   SET access_token  = EXCLUDED.access_token,
		       refresh_token = CASE WHEN EXCLUDED.refresh_token <> '' THEN EXCLUDED.refresh_token ELSE google_tokens.refresh_token END,
		       scopes        = EXCLUDED.scopes,
		       expires_at    = EXCLUDED.expires_at,
		       updated_at    = NOW()`,
		stateUserID, encAccessToken, encRefreshToken, tokens.Scope, tokens.ExpiresAt,
	)
	if err != nil {
		h.logger.Error("failed to store Google tokens", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save tokens"})
	}

	// Redirect to UI success page or return a self-closing popup page.
	// Only allow relative paths (starting with "/") to prevent open-redirect.
	redirectUI := c.QueryParam("redirect")
	if redirectUI != "" {
		if !strings.HasPrefix(redirectUI, "/") {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid redirect"})
		}
		return c.Redirect(http.StatusFound, redirectUI+"?google=connected")
	}
	// When called from a popup window, post a message to the opener and close.
	return c.HTML(http.StatusOK, googleOAuthSuccessHTML)
}

// GET /api/v1/integrations/google/status
// Returns whether the user has a valid (non-expired) Google token.
func (h *IntegrationsHandler) GoogleStatus(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var expiresAt time.Time
	var scopes string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT expires_at, scopes FROM google_tokens WHERE user_id = $1`,
		userID,
	).Scan(&expiresAt, &scopes)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"connected": false})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"connected":  true,
		"expires_at": expiresAt,
		"expired":    time.Now().After(expiresAt),
		"scopes":     scopes,
	})
}

// DELETE /api/v1/integrations/google
// Revokes and removes the stored Google tokens.
func (h *IntegrationsHandler) GoogleDisconnect(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Fetch token to revoke it with Google
	var encAccessToken string
	_ = h.db.QueryRowContext(c.Request().Context(),
		`SELECT access_token FROM google_tokens WHERE user_id = $1`, userID,
	).Scan(&encAccessToken)

	if encAccessToken != "" {
		accessToken, _ := crypto.Decrypt(encAccessToken, h.config.EncryptionKey)
		if accessToken != "" {
			// Best-effort revoke (ignore error)
			revokeGoogleToken(accessToken) //nolint:errcheck
		}
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM google_tokens WHERE user_id = $1`, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to remove tokens"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// ── Google OAuth helpers ───────────────────────────────────────────────────────

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
	ExpiresAt    time.Time
}

func exchangeGoogleCode(ctx context.Context, clientID, clientSecret, redirectURL, code string) (*googleTokenResponse, error) {
	params := url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURL},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := googleHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token exchange %d: %s", resp.StatusCode, body)
	}

	var t googleTokenResponse
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, err
	}
	t.ExpiresAt = time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	return &t, nil
}

func revokeGoogleToken(token string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/revoke",
		strings.NewReader("token="+url.QueryEscape(token)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := googleHTTPClient.Do(req)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return nil
}

// oauthState builds an HMAC-SHA256 signed state token:
//
//	"<userID>:<unix_ts>.<hmac(userID:unix_ts)>"
//
// The embedded timestamp makes each state one-time-ish: verifyOAuthState
// rejects tokens older than 10 minutes, limiting replay-attack windows.
func oauthState(userID, secret string) string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	payload := userID + ":" + ts
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

// verifyOAuthState validates a state token produced by oauthState.
// Returns the embedded userID and true on success.
// Rejects tokens older than 10 minutes to prevent replay attacks.
func verifyOAuthState(state, secret string) (string, bool) {
	dot := strings.LastIndex(state, ".")
	if dot < 0 {
		return "", false
	}
	payload := state[:dot]
	// Constant-time HMAC verification.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(state[dot+1:]), []byte(expectedSig)) {
		return "", false
	}
	// Extract userID and timestamp from "<userID>:<unix_ts>".
	colon := strings.LastIndex(payload, ":")
	if colon < 0 {
		return "", false
	}
	userID := payload[:colon]
	ts, err := strconv.ParseInt(payload[colon+1:], 10, 64)
	if err != nil {
		return "", false
	}
	if time.Since(time.Unix(ts, 0)) > 10*time.Minute {
		return "", false
	}
	return userID, true
}

// maskKey shows only the last 4 characters of an API key, e.g. "***...abcd".
// For naver_search keys stored as "client_id:client_secret", each part is masked.
func maskKey(key string) string {
	if strings.Contains(key, ":") {
		parts := strings.SplitN(key, ":", 2)
		return maskKey(parts[0]) + ":" + maskKey(parts[1])
	}
	if len(key) <= 4 {
		return "****"
	}
	return "***..." + key[len(key)-4:]
}
