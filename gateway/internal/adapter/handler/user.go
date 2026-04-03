package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

func mustMarshalJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

type UserHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewUserHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *UserHandler {
	return &UserHandler{db: db, config: cfg, logger: logger}
}

func getUserIDFromContext(c echo.Context) (uuid.UUID, error) {
	user := c.Get("user").(*jwt.Token)
	claims := user.Claims.(*JWTClaims)
	return uuid.Parse(claims.UserID)
}

func (h *UserHandler) GetMe(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var result struct {
		ID               string  `db:"id" json:"id"`
		Email            *string `db:"email" json:"email"`
		DisplayName      *string `db:"display_name" json:"name"`
		AvatarURL        *string `db:"avatar_url" json:"avatar_url"`
		TelegramID       *int64  `db:"telegram_id" json:"telegram_id"`
		TelegramUsername *string `db:"telegram_username" json:"telegram_username"`
		Language         string  `db:"language" json:"language"`
		Timezone         string  `db:"timezone" json:"timezone"`
	}

	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, email, display_name, avatar_url, telegram_id, telegram_username,
		        COALESCE(preferences->>'language', 'ko') AS language,
		        COALESCE(preferences->>'timezone', 'Asia/Seoul') AS timezone
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&result.ID, &result.Email, &result.DisplayName, &result.AvatarURL,
		&result.TelegramID, &result.TelegramUsername, &result.Language, &result.Timezone)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
	}

	return c.JSON(http.StatusOK, result)
}

type UpdateUserRequest struct {
	DisplayName *string `json:"display_name"`
	Name        *string `json:"name"`      // alias used by the settings page
	AvatarURL   *string `json:"avatar_url"`
	Language    *string `json:"language"`
	Timezone    *string `json:"timezone"`
}

func (h *UserHandler) UpdateMe(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req UpdateUserRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Support both "name" and "display_name" fields from the settings page
	displayName := req.DisplayName
	if displayName == nil {
		displayName = req.Name
	}
	if displayName != nil && len(*displayName) > 100 {
		trimmed := (*displayName)[:100]
		displayName = &trimmed
	}

	// Validate avatar_url: must be a relative path or start with https://.
	// Reject javascript: and other schemes that could cause XSS when rendered as img src or href.
	if req.AvatarURL != nil && *req.AvatarURL != "" {
		u := *req.AvatarURL
		if len(u) > 512 {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "avatar_url too long (max 512 characters)"})
		}
		if !strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "https://") {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "avatar_url must start with / or https://"})
		}
	}

	// Build a JSONB patch for preferences fields (language, timezone)
	prefPatch := map[string]string{}
	if req.Language != nil {
		prefPatch["language"] = *req.Language
	}
	if req.Timezone != nil {
		prefPatch["timezone"] = *req.Timezone
	}

	if len(prefPatch) > 0 {
		_, err = h.db.ExecContext(c.Request().Context(),
			`UPDATE users
			 SET display_name = COALESCE($1, display_name),
			     avatar_url   = COALESCE($2, avatar_url),
			     preferences  = preferences || $3::jsonb,
			     updated_at   = NOW()
			 WHERE id = $4`,
			displayName, req.AvatarURL, mustMarshalJSON(prefPatch), userID,
		)
	} else {
		_, err = h.db.ExecContext(c.Request().Context(),
			`UPDATE users
			 SET display_name = COALESCE($1, display_name),
			     avatar_url   = COALESCE($2, avatar_url),
			     updated_at   = NOW()
			 WHERE id = $3`,
			displayName, req.AvatarURL, userID,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update user"})
	}

	return h.GetMe(c)
}

func (h *UserHandler) GetPreferences(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var prefsJSON []byte
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT preferences FROM users WHERE id = $1`,
		userID,
	).Scan(&prefsJSON)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
	}

	return c.JSONBlob(http.StatusOK, prefsJSON)
}

func (h *UserHandler) UpdatePreferences(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var prefs map[string]any
	if err := c.Bind(&prefs); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2`,
		prefs, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update preferences"})
	}

	return c.JSON(http.StatusOK, prefs)
}

// GetProfilePersona returns the user's active persona setting.
// GET /api/v1/profile/persona
func (h *UserHandler) GetProfilePersona(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Read from preferences JSONB — key "active_persona_id"
	var prefsJSON []byte
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT preferences FROM users WHERE id = $1`,
		userID,
	).Scan(&prefsJSON)

	// Also return the first default persona as fallback.
	var defaultPersonaID, defaultPersonaName string
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, name FROM personas WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
		userID,
	).Scan(&defaultPersonaID, &defaultPersonaName)

	return c.JSON(http.StatusOK, map[string]any{
		"persona":            defaultPersonaName,
		"persona_id":         defaultPersonaID,
		"active_persona_id":  defaultPersonaID,
	})
}

// UpdateProfilePersona sets the user's active persona.
// PATCH /api/v1/profile/persona
func (h *UserHandler) UpdateProfilePersona(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Persona   string `json:"persona"`
		PersonaID string `json:"persona_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Verify persona_id is a valid UUID and belongs to the current user.
	// Prevents setting a persona UUID owned by a different user.
	if req.PersonaID != "" {
		if _, parseErr := uuid.Parse(req.PersonaID); parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid persona_id"})
		}
		var exists bool
		if err := h.db.QueryRowContext(c.Request().Context(),
			`SELECT EXISTS(SELECT 1 FROM personas WHERE id = $1 AND user_id = $2)`,
			req.PersonaID, userID,
		).Scan(&exists); err != nil || !exists {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "persona not found"})
		}
	}

	// Store active persona ID in user preferences.
	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE users SET preferences = jsonb_set(COALESCE(preferences,'{}'), '{active_persona_id}', to_jsonb($1::text)), updated_at = NOW() WHERE id = $2`,
		req.PersonaID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update persona"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}
