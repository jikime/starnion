// Package skills hosts the HTTP adapter for the skills catalogue +
// credential-management domain. Thirteenth handler sub-package to
// migrate out of internal/adapter/handler.
package skills

import (
	"errors"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/infrastructure/googleoauth"
	skillsusecase "github.com/newstarnion/gateway/internal/usecase/skills"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *skillsusecase.UseCase
	cfg    *config.Config
	logger *zap.Logger
}

func NewHandler(uc *skillsusecase.UseCase, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, cfg: cfg, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/skills", h.listSkills)
	protected.POST("/skills/:id/toggle", h.toggleSkill)
	protected.PUT("/skills/:id/api-key", h.saveAPIKey)
	protected.DELETE("/skills/:id/api-key", h.deleteAPIKey)
	protected.GET("/skills/:id/oauth-url", h.oauthURL)
	protected.DELETE("/skills/:id/oauth-disconnect", h.oauthDisconnect)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

func (h *Handler) listSkills(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	lang := c.QueryParam("lang")
	entries, err := h.uc.ListCatalogue(c.Request().Context(), userID, lang)
	if err != nil {
		h.logger.Warn("skills list failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch skills"})
	}
	out := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		entry := map[string]any{
			"id":               e.Meta.ID,
			"display_name":     e.DisplayName,
			"description":      e.Description,
			"category":         e.Meta.Category,
			"emoji":            e.Meta.Emoji,
			"enabled":          e.Enabled,
			"requires_api_key": e.Meta.RequiresAPIKey,
			"api_key_provider": e.Meta.APIKeyProvider,
			"api_key_type":     e.Meta.APIKeyType,
			"api_key_label":    e.Meta.APIKeyLabel,
			"api_key_label_1":  e.Meta.APIKeyLabel1,
			"api_key_label_2":  e.Meta.APIKeyLabel2,
			"uses_provider":    e.Meta.UsesProvider,
			"has_api_key":      e.HasAPIKey,
			"masked_key":       nil,
			"oauth_connected":  e.OAuthConnected,
			"oauth_expires_at": e.OAuthExpiresAt,
		}
		if e.HasAPIKey {
			entry["masked_key"] = e.MaskedKey
		}
		out = append(out, entry)
	}
	return c.JSON(http.StatusOK, map[string]any{"skills": out})
}

func (h *Handler) toggleSkill(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	skillID := c.Param("id")
	enabled, err := h.uc.ToggleSkill(c.Request().Context(), userID, skillID)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("skills toggle failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update skill"})
	}
	return c.JSON(http.StatusOK, map[string]any{"skill_id": skillID, "enabled": enabled})
}

func (h *Handler) saveAPIKey(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	skillID := c.Param("id")
	var req struct {
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	result, err := h.uc.SaveAPIKey(c.Request().Context(), userID, skillID, req.APIKey)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill not found or missing api_key_provider"})
		}
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("skills save api key failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save API key"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"skill_id":    skillID,
		"provider":    result.Provider,
		"has_api_key": true,
		"masked_key":  result.MaskedKey,
	})
}

func (h *Handler) deleteAPIKey(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	skillID := c.Param("id")
	if err := h.uc.DeleteAPIKey(c.Request().Context(), userID, skillID); err != nil {
		if errors.Is(err, domain.ErrNotFound) || errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("skills delete api key failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete API key"})
	}
	return c.JSON(http.StatusOK, map[string]any{"skill_id": skillID, "has_api_key": false})
}

func (h *Handler) oauthURL(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	skillID := c.Param("id")
	result, err := h.uc.BuildOAuthURL(c.Request().Context(), userID, skillID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "skill not found"})
		}
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Warn("skills oauth url failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to build oauth url"})
	}
	redirectURL := h.cfg.GoogleRedirectURL
	if redirectURL == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "GOOGLE_REDIRECT_URL not configured on server"})
	}
	params := url.Values{
		"client_id":     {result.ClientID},
		"redirect_uri":  {redirectURL},
		"response_type": {"code"},
		// Skill-level flow asks for broader scopes than the
		// generic /integrations/google/auth-url endpoint — match
		// the legacy handler so the UI keeps working unchanged.
		"scope": {"openid email profile " +
			"https://www.googleapis.com/auth/calendar " +
			"https://www.googleapis.com/auth/drive " +
			"https://www.googleapis.com/auth/documents " +
			"https://www.googleapis.com/auth/tasks " +
			"https://mail.google.com/"},
		"access_type": {"offline"},
		"prompt":      {"consent"},
		"state":       {result.State},
	}
	authURL := googleoauth.AuthURL + "?" + params.Encode()
	return c.JSON(http.StatusOK, map[string]any{
		"url":     authURL,
		"enabled": true,
	})
}

func (h *Handler) oauthDisconnect(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DisconnectOAuth(c.Request().Context(), userID); err != nil {
		h.logger.Warn("skills oauth disconnect failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to disconnect"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}
