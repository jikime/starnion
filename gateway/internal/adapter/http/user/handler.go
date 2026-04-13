// Package user hosts the HTTP adapter for the user-profile domain.
// This is the second handler sub-package to graduate out of the
// monolithic internal/adapter/handler directory (after /http/budget).
// Persona-related endpoints still live in handler/user_persona.go
// because they cross into the persona domain — they will migrate when
// that domain gets its own Clean-Architecture slice.
package user

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	userusecase "github.com/newstarnion/gateway/internal/usecase/user"
	"go.uber.org/zap"
)

// Handler is the HTTP adapter over the user usecase.
type Handler struct {
	uc     *userusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *userusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

// Register mounts user-profile routes under the JWT-protected group.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/me", h.getMe)
	protected.PUT("/me", h.updateMe)
	protected.GET("/me/preferences", h.getPreferences)
	protected.PUT("/me/preferences", h.updatePreferences)
	// /profile is a legacy alias for /me used by the web settings page.
	protected.GET("/profile", h.getMe)
	protected.PUT("/profile", h.updateMe)
	protected.PATCH("/profile", h.updateMe)
}

// userProfileDTO is the JSON response shape for GetMe / UpdateMe. It is
// derived from entity.User with language/timezone flattened out of the
// preferences JSONB for client convenience.
type userProfileDTO struct {
	ID               string  `json:"id"`
	Email            *string `json:"email"`
	DisplayName      *string `json:"name"`
	AvatarURL        *string `json:"avatar_url"`
	TelegramID       *int64  `json:"telegram_id"`
	TelegramUsername *string `json:"telegram_username"`
	Language         string  `json:"language"`
	Timezone         string  `json:"timezone"`
}

func toUserProfileDTO(u *entity.User) userProfileDTO {
	dto := userProfileDTO{
		ID:               u.ID.String(),
		Email:            u.Email,
		DisplayName:      u.DisplayName,
		AvatarURL:        u.AvatarURL,
		TelegramID:       u.TelegramID,
		TelegramUsername: u.TelegramUsername,
		Language:         "ko",
		Timezone:         "Asia/Seoul",
	}
	if lang, ok := u.Preferences["language"].(string); ok && lang != "" {
		dto.Language = lang
	}
	if tz, ok := u.Preferences["timezone"].(string); ok && tz != "" {
		dto.Timezone = tz
	}
	return dto
}

func userErrorToHTTP(err error) (int, string) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "user not found"
	case errors.Is(err, domain.ErrInvalidArgument):
		return http.StatusBadRequest, err.Error()
	default:
		return http.StatusInternalServerError, "internal error"
	}
}

func (h *Handler) getMe(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	u, err := h.uc.GetProfile(c.Request().Context(), userID)
	if err != nil {
		code, msg := userErrorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, toUserProfileDTO(u))
}

type updateUserRequest struct {
	DisplayName *string `json:"display_name"`
	Name        *string `json:"name"` // alias used by the settings page
	AvatarURL   *string `json:"avatar_url"`
	Language    *string `json:"language"`
	Timezone    *string `json:"timezone"`
}

func (h *Handler) updateMe(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req updateUserRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	displayName := req.DisplayName
	if displayName == nil {
		displayName = req.Name
	}

	cmd := userusecase.UpdateProfileCommand{
		DisplayName: displayName,
		AvatarURL:   req.AvatarURL,
		Language:    req.Language,
		Timezone:    req.Timezone,
	}
	u, err := h.uc.UpdateProfile(c.Request().Context(), userID, cmd)
	if err != nil {
		code, msg := userErrorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, toUserProfileDTO(u))
}

func (h *Handler) getPreferences(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	raw, err := h.uc.GetPreferences(c.Request().Context(), userID)
	if err != nil {
		code, msg := userErrorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSONBlob(http.StatusOK, raw)
}

func (h *Handler) updatePreferences(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var prefs map[string]any
	if err := c.Bind(&prefs); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	saved, err := h.uc.ReplacePreferences(c.Request().Context(), userID, prefs)
	if err != nil {
		code, msg := userErrorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, saved)
}
