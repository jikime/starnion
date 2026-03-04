package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// GoogleCallbackHandler handles the OAuth2 callback from Google.
type GoogleCallbackHandler struct {
	db *sql.DB
}

// NewGoogleCallbackHandler creates a new Google OAuth callback handler.
func NewGoogleCallbackHandler(db *sql.DB) *GoogleCallbackHandler {
	return &GoogleCallbackHandler{db: db}
}

// tokenResponse represents the Google OAuth2 token exchange response.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

// Callback handles GET /auth/google/callback.
// It exchanges the authorization code for tokens and stores them in the database.
func (h *GoogleCallbackHandler) Callback(c echo.Context) error {
	code := c.QueryParam("code")
	state := c.QueryParam("state") // state = user_id  OR  "web:{user_id}"
	errParam := c.QueryParam("error")

	// Detect web-originated OAuth flow.
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

	// Exchange code for tokens.
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_REDIRECT_URI")

	if clientID == "" || clientSecret == "" {
		log.Error().Msg("Google OAuth credentials not configured")
		return c.HTML(http.StatusInternalServerError, "<h2>서버 설정 오류</h2>")
	}

	tokenReq := fmt.Sprintf(
		"code=%s&client_id=%s&client_secret=%s&redirect_uri=%s&grant_type=authorization_code",
		code, clientID, clientSecret, redirectURI,
	)

	resp, err := http.Post(
		"https://oauth2.googleapis.com/token",
		"application/x-www-form-urlencoded",
		strings.NewReader(tokenReq),
	)
	if err != nil {
		log.Error().Err(err).Msg("Failed to exchange Google OAuth code")
		return c.HTML(http.StatusInternalServerError, "<h2>토큰 교환 실패</h2>")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var tokens tokenResponse
	if err := json.Unmarshal(body, &tokens); err != nil {
		log.Error().Err(err).Str("body", string(body)).Msg("Failed to parse token response")
		return c.HTML(http.StatusInternalServerError, "<h2>토큰 파싱 실패</h2>")
	}

	if tokens.AccessToken == "" {
		log.Error().Str("body", string(body)).Msg("No access token in response")
		return c.HTML(http.StatusInternalServerError, "<h2>액세스 토큰이 없어요</h2>")
	}

	// Store tokens in database.
	expiresAt := time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	_, err = h.db.ExecContext(ctx,
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
	if err != nil {
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
