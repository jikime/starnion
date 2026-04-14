// Package integrations hosts the HTTP adapter for the third-party
// API key + Google OAuth domain. Twelfth handler sub-package to
// migrate out of internal/adapter/handler.
package integrations

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/infrastructure/googleoauth"
	integrationsusecase "github.com/newstarnion/gateway/internal/usecase/integrations"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *integrationsusecase.UseCase
	cfg    *config.Config
	logger *zap.Logger
}

func NewHandler(uc *integrationsusecase.UseCase, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, cfg: cfg, logger: logger}
}

// Register mounts the JWT-protected routes. The Google OAuth
// callback is public (Google cannot forward JWT cookies) and is
// registered via RegisterPublic.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/integrations/status", h.status)
	protected.GET("/integrations/google/auth-url", h.googleAuthURL)
	protected.GET("/integrations/google/status", h.googleStatus)
	protected.DELETE("/integrations/google", h.googleDisconnect)
	// Specific sub-routes must come before the /:name wildcard
	protected.GET("/integrations/naver_map/client-config", h.naverMapClientConfig)
	protected.GET("/integrations/:name", h.get)
	protected.POST("/integrations/:name", h.upsert)
	protected.PUT("/integrations/:name", h.upsert)
	protected.DELETE("/integrations/:name", h.delete)
}

// RegisterPublic mounts the Google OAuth callback on the public
// api group — Google redirects straight into the browser, so no
// JWT is attached.
func (h *Handler) RegisterPublic(api *echo.Group) {
	api.GET("/integrations/google/callback", h.googleCallback)
	api.POST("/integrations/google/callback", h.googleCallback)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── Generic integration CRUD ──────────────────────────────────────

func (h *Handler) get(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	view, err := h.uc.GetKey(c.Request().Context(), userID, c.Param("name"))
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("integrations get failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch integration"})
	}
	if !view.Enabled {
		return c.JSON(http.StatusOK, map[string]any{
			"integration": view.Provider,
			"enabled":     false,
			"masked_key":  nil,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"integration": view.Provider,
		"enabled":     true,
		"masked_key":  view.MaskedKey,
	})
}

func (h *Handler) status(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListStatus(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("integrations status failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch integrations"})
	}
	out := map[string]any{}
	for k, v := range rows {
		out[k] = map[string]any{
			"enabled":    v.Enabled,
			"masked_key": v.MaskedKey,
		}
	}
	return c.JSON(http.StatusOK, map[string]any{"integrations": out})
}

func (h *Handler) upsert(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	view, err := h.uc.UpsertKey(c.Request().Context(), userID, c.Param("name"), req.APIKey)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("integrations upsert failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save integration"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"status":      "saved",
		"integration": view.Provider,
		"enabled":     true,
		"masked_key":  view.MaskedKey,
	})
}

func (h *Handler) delete(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteKey(c.Request().Context(), userID, c.Param("name")); err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("integrations delete failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete integration"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// ── Naver Map ─────────────────────────────────────────────────────

func (h *Handler) naverMapClientConfig(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	cfg, err := h.uc.GetNaverMapClientConfig(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("naver map config failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch config"})
	}
	if !cfg.Configured {
		return c.JSON(http.StatusOK, map[string]any{
			"configured":        false,
			"search_configured": false,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"configured":        true,
		"client_id":         cfg.ClientID,
		"search_configured": cfg.SearchConfigured,
	})
}

// ── Google OAuth ──────────────────────────────────────────────────

func (h *Handler) googleAuthURL(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	clientID := h.uc.GoogleClientID(c.Request().Context(), userID)
	if clientID == "" {
		return c.JSON(http.StatusOK, map[string]any{
			"url":     nil,
			"enabled": false,
			"message": "Google OAuth not configured (set GOOGLE_CLIENT_ID or configure via Google Workspace skill)",
		})
	}
	state := h.uc.StateSign(userID.String())
	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {h.cfg.GoogleRedirectURL},
		"response_type": {"code"},
		"scope":         {googleoauth.Scopes},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
		"state":         {state},
	}
	authURL := googleoauth.AuthURL + "?" + params.Encode()
	return c.JSON(http.StatusOK, map[string]any{
		"url":     authURL,
		"enabled": true,
	})
}

func (h *Handler) googleCallback(c echo.Context) error {
	code := c.QueryParam("code")
	state := c.QueryParam("state")
	// Support POST with JSON body (from web proxy route).
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

	stateUserID, ok := h.uc.StateVerify(state)
	if !ok {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid state parameter"})
	}
	// StateVerify returns the user id as the string that was signed.
	// Parse into a uuid so the usecase's repo methods type-check.
	userID, parseErr := uuid.Parse(stateUserID)
	if parseErr != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid state payload"})
	}

	if _, err := h.uc.GoogleExchange(c.Request().Context(), userID, code); err != nil {
		h.logger.Error("google token exchange failed", zap.Error(err))
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to exchange code"})
	}

	// Redirect back to UI success page or render a self-closing
	// popup message. Only absolute-path redirects are allowed so
	// this endpoint cannot be weaponised as an open redirect.
	redirectUI := c.QueryParam("redirect")
	if redirectUI != "" {
		if !strings.HasPrefix(redirectUI, "/") {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid redirect"})
		}
		return c.Redirect(http.StatusFound, redirectUI+"?google=connected")
	}
	webOrigin := "*"
	if len(h.cfg.AllowedOrigins) > 0 {
		webOrigin = h.cfg.AllowedOrigins[0]
	}
	return c.HTML(http.StatusOK, googleOAuthSuccessHTML(webOrigin))
}

func (h *Handler) googleStatus(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	tokens, found, err := h.uc.GoogleStatus(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("google status failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load status"})
	}
	if !found {
		return c.JSON(http.StatusOK, map[string]any{"connected": false})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"connected":  true,
		"expires_at": tokens.ExpiresAt,
		"expired":    time.Now().After(tokens.ExpiresAt),
		"scopes":     tokens.Scopes,
	})
}

// googleOAuthSuccessHTML returns the popup HTML for a successful
// Google OAuth flow. targetOrigin is set to the configured web
// origin to prevent postMessage leakage to other windows.
func googleOAuthSuccessHTML(targetOrigin string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Google 연결 완료</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'google-oauth-success' }, %q);
    window.close();
  } else {
    document.body.innerText = 'Google 계정이 연결되었습니다. 이 창을 닫아 주세요.';
  }
</script>
</body>
</html>`, targetOrigin)
}

func (h *Handler) googleDisconnect(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.GoogleDisconnect(c.Request().Context(), userID); err != nil {
		h.logger.Warn("google disconnect failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to remove tokens"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// ── Helpers ───────────────────────────────────────────────────────

// GoogleOAuthAdapter wraps googleoauth.Client to satisfy the
// integrations usecase's GoogleOAuthClient port (conversion
// between googleoauth.Tokens and integrationsusecase.GoogleTokens).
type GoogleOAuthAdapter struct {
	client *googleoauth.Client
}

func NewGoogleOAuthAdapter(client *googleoauth.Client) *GoogleOAuthAdapter {
	return &GoogleOAuthAdapter{client: client}
}

func (a *GoogleOAuthAdapter) Exchange(ctx context.Context, clientID, clientSecret, redirectURL, code string) (integrationsusecase.GoogleTokens, error) {
	t, err := a.client.Exchange(ctx, clientID, clientSecret, redirectURL, code)
	if err != nil {
		return integrationsusecase.GoogleTokens{}, err
	}
	return integrationsusecase.GoogleTokens{
		AccessToken:  t.AccessToken,
		RefreshToken: t.RefreshToken,
		ExpiresAt:    t.ExpiresAt,
		Scope:        t.Scope,
	}, nil
}

func (a *GoogleOAuthAdapter) RefreshAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (integrationsusecase.GoogleTokens, error) {
	t, err := a.client.RefreshAccessToken(ctx, clientID, clientSecret, refreshToken)
	if err != nil {
		return integrationsusecase.GoogleTokens{}, err
	}
	return integrationsusecase.GoogleTokens{
		AccessToken:  t.AccessToken,
		RefreshToken: t.RefreshToken,
		ExpiresAt:    t.ExpiresAt,
		Scope:        t.Scope,
	}, nil
}

func (a *GoogleOAuthAdapter) Revoke(token string) error {
	return a.client.Revoke(token)
}
