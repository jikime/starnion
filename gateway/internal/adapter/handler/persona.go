package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type PersonaHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewPersonaHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *PersonaHandler {
	return &PersonaHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/personas
func (h *PersonaHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, name, description, provider, model, system_prompt,
		        bot_name, user_name, is_default, COALESCE(system_key, ''), created_at, updated_at
		 FROM personas WHERE user_id = $1
		 ORDER BY is_default DESC, created_at ASC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch personas"})
	}
	defer rows.Close()

	var personas []map[string]any
	for rows.Next() {
		var id, name, description, provider, model, systemPrompt, botName, userName, systemKey string
		var isDefault bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &name, &description, &provider, &model, &systemPrompt,
			&botName, &userName, &isDefault, &systemKey, &createdAt, &updatedAt); err != nil {
			continue
		}
		p := map[string]any{
			"id":           id,
			"name":         name,
			"description":  description,
			"provider":     provider,
			"model":        model,
			"systemPrompt": systemPrompt,
			"botName":      botName,
			"userName":     userName,
			"isDefault":    isDefault,
			"createdAt":    createdAt,
			"updatedAt":    updatedAt,
		}
		if systemKey != "" {
			p["systemKey"] = systemKey
		}
		personas = append(personas, p)
	}
	if err := rows.Err(); err != nil {
		h.logger.Warn("ListPersonas: rows iteration error", zap.Error(err))
	}
	if personas == nil {
		personas = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"personas": personas})
}

// POST /api/v1/personas
func (h *PersonaHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		SystemPrompt string `json:"systemPrompt"`
		BotName      string `json:"botName"`
		UserName     string `json:"userName"`
		IsDefault    bool   `json:"isDefault"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name is required"})
	}
	if len(req.Name) > 100 {
		req.Name = req.Name[:100]
	}
	if len(req.Description) > 500 {
		req.Description = req.Description[:500]
	}
	if len(req.BotName) > 100 {
		req.BotName = req.BotName[:100]
	}
	if len(req.UserName) > 100 {
		req.UserName = req.UserName[:100]
	}
	if len(req.SystemPrompt) > 8000 {
		req.SystemPrompt = req.SystemPrompt[:8000]
	}

	id := uuid.New()
	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO personas (id, user_id, name, description, provider, model, system_prompt, bot_name, user_name, is_default)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		id, userID, req.Name, req.Description, req.Provider, req.Model, req.SystemPrompt,
		req.BotName, req.UserName, req.IsDefault,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create persona"})
	}

	return c.JSON(http.StatusCreated, map[string]any{"id": id.String(), "name": req.Name})
}

// PUT /api/v1/personas/:id
func (h *PersonaHandler) Update(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	personaID := c.Param("id")
	if _, err := uuid.Parse(personaID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid persona id"})
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		SystemPrompt string `json:"systemPrompt"`
		BotName      string `json:"botName"`
		UserName     string `json:"userName"`
		IsDefault    *bool  `json:"isDefault"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if len(req.Name) > 100 {
		req.Name = req.Name[:100]
	}
	if len(req.Description) > 500 {
		req.Description = req.Description[:500]
	}
	if len(req.BotName) > 100 {
		req.BotName = req.BotName[:100]
	}
	if len(req.UserName) > 100 {
		req.UserName = req.UserName[:100]
	}
	if len(req.SystemPrompt) > 8000 {
		req.SystemPrompt = req.SystemPrompt[:8000]
	}

	ctx := c.Request().Context()

	// If setting this persona as default, use a transaction to safely swap.
	if req.IsDefault != nil && *req.IsDefault {
		tx, err := h.db.BeginTxx(ctx, nil)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to begin transaction"})
		}
		defer tx.Rollback() //nolint:errcheck

		// 1. Clear all defaults for this user.
		if _, err := tx.ExecContext(ctx,
			`UPDATE personas SET is_default = FALSE WHERE user_id = $1`,
			userID,
		); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update personas"})
		}

		// 2. Set this persona as default and update other fields.
		if _, err := tx.ExecContext(ctx,
			`UPDATE personas SET
				name          = COALESCE(NULLIF($1, ''), name),
				description   = COALESCE(NULLIF($2, ''), description),
				provider      = $3,
				model         = $4,
				system_prompt = $5,
				bot_name      = $6,
				user_name     = $7,
				is_default    = TRUE,
				updated_at    = NOW()
			 WHERE id = $8 AND user_id = $9`,
			req.Name, req.Description, req.Provider, req.Model, req.SystemPrompt,
			req.BotName, req.UserName, personaID, userID,
		); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update persona"})
		}

		if err := tx.Commit(); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to commit transaction"})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
	}

	// Non-default update (no transaction needed).
	_, err = h.db.ExecContext(ctx,
		`UPDATE personas SET
			name          = COALESCE(NULLIF($1, ''), name),
			description   = COALESCE(NULLIF($2, ''), description),
			provider      = $3,
			model         = $4,
			system_prompt = $5,
			bot_name      = $6,
			user_name     = $7,
			updated_at    = NOW()
		 WHERE id = $8 AND user_id = $9`,
		req.Name, req.Description, req.Provider, req.Model, req.SystemPrompt,
		req.BotName, req.UserName, personaID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update persona"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/personas/:id
func (h *PersonaHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	personaID := c.Param("id")
	if _, err := uuid.Parse(personaID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid persona id"})
	}
	result, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM personas WHERE id = $1 AND user_id = $2 AND is_default = FALSE`,
		personaID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete persona"})
	}
	// is_default = FALSE guard silently blocks deleting the default persona.
	// Inform the caller instead of returning a misleading 200.
	if n, _ := result.RowsAffected(); n == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "cannot delete default persona or persona not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
