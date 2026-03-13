package handler

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

// ProfileHandler handles GET/PATCH /api/v1/profile.
type ProfileHandler struct {
	db *sql.DB
}

func NewProfileHandler(db *sql.DB) *ProfileHandler {
	return &ProfileHandler{db: db}
}

// supportedLanguages는 허용된 언어 코드 목록입니다.
var supportedLanguages = map[string]bool{
	"ko": true,
	"en": true,
	"ja": true,
	"zh": true,
}

// Get returns the authenticated user's profile.
// GET /api/v1/profile?user_id=<uuid>
func (h *ProfileHandler) Get(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	var name, email sql.NullString
	var language sql.NullString
	err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT display_name, email, preferences->>'language' FROM users WHERE id = $1`,
		userID,
	).Scan(&name, &email, &language)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("profile: get failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	lang := "ko"
	if language.Valid && language.String != "" {
		lang = language.String
	}

	return c.JSON(http.StatusOK, map[string]string{
		"name":     name.String,
		"email":    email.String,
		"language": lang,
	})
}

// Update saves display_name, language preference, and optionally changes the password.
// PATCH /api/v1/profile?user_id=<uuid>
// Body: { "name": "...", "language": "ko", "current_password": "...", "new_password": "..." }
func (h *ProfileHandler) Update(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	var body struct {
		Name            string  `json:"name"`
		Language        *string `json:"language"`
		CurrentPassword string  `json:"current_password"`
		NewPassword     string  `json:"new_password"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := c.Request().Context()

	// Update display_name.
	if body.Name != "" {
		_, err := h.db.ExecContext(ctx,
			`UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2`,
			body.Name, userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("profile: update name failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
		}
	}

	// Update language preference if provided.
	if body.Language != nil {
		lang := *body.Language
		if !supportedLanguages[lang] {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "언어 코드가 올바르지 않아요. 지원 언어: ko, en, ja, zh",
			})
		}
		_, err := h.db.ExecContext(ctx,
			`UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{language}', to_jsonb($1::text), true), updated_at = NOW() WHERE id = $2`,
			lang, userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("profile: update language failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
		}
	}

	// Change password if requested.
	if body.NewPassword != "" {
		if body.CurrentPassword == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "current_password is required to change password"})
		}

		// Verify current password.
		var storedHash sql.NullString
		err := h.db.QueryRowContext(ctx,
			`SELECT password_hash FROM users WHERE id = $1`,
			userID,
		).Scan(&storedHash)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
		}
		if !storedHash.Valid || bcrypt.CompareHashAndPassword([]byte(storedHash.String), []byte(body.CurrentPassword)) != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "current password is incorrect"})
		}

		newHashBytes, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "hash failed"})
		}
		newHash := string(newHashBytes)
		_, err = h.db.ExecContext(ctx,
			`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
			newHash, userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("profile: update password failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "password update failed"})
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
