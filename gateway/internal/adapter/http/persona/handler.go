// Package persona hosts the HTTP adapter for the persona domain.
// Fifth handler sub-package to migrate out of internal/adapter/handler.
// Includes the /profile/persona active-selector routes that used to
// live on handler/user.go.
package persona

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	personausecase "github.com/newstarnion/gateway/internal/usecase/persona"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *personausecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *personausecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/personas", h.list)
	protected.POST("/personas", h.create)
	protected.PUT("/personas/:id", h.update)
	protected.DELETE("/personas/:id", h.delete)

	protected.GET("/profile/persona", h.getActive)
	protected.PATCH("/profile/persona", h.setActive)
}

func (h *Handler) errorToHTTP(err error) (int, string) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "persona not found"
	case errors.Is(err, domain.ErrInvalidArgument):
		return http.StatusBadRequest, err.Error()
	default:
		return http.StatusInternalServerError, "internal error"
	}
}

func (h *Handler) list(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	rows, err := h.uc.List(c.Request().Context(), userID)
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	out := make([]map[string]any, 0, len(rows))
	for _, p := range rows {
		out = append(out, personaToMap(p))
	}
	return c.JSON(http.StatusOK, map[string]any{"personas": out})
}

func (h *Handler) create(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
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
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.Create(c.Request().Context(), userID, personausecase.CreateCommand{
		Name:         req.Name,
		Description:  req.Description,
		Provider:     req.Provider,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		BotName:      req.BotName,
		UserName:     req.UserName,
		IsDefault:    req.IsDefault,
	})
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id.String(), "name": req.Name})
}

func (h *Handler) update(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	personaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
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
	if err := h.uc.Update(c.Request().Context(), userID, personaID, personausecase.UpdateCommand{
		Name:         req.Name,
		Description:  req.Description,
		Provider:     req.Provider,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		BotName:      req.BotName,
		UserName:     req.UserName,
		IsDefault:    req.IsDefault,
	}); err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) delete(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	personaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid persona id"})
	}
	if err := h.uc.Delete(c.Request().Context(), userID, personaID); err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) getActive(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	active, err := h.uc.GetActive(c.Request().Context(), userID)
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"persona":           active.Name,
		"persona_id":        active.ID,
		"active_persona_id": active.ID,
	})
}

func (h *Handler) setActive(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
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
	if err := h.uc.SetActive(c.Request().Context(), userID, req.PersonaID); err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func personaToMap(p entity.Persona) map[string]any {
	m := map[string]any{
		"id":           p.ID.String(),
		"name":         p.Name,
		"description":  p.Description,
		"provider":     p.Provider,
		"model":        p.Model,
		"systemPrompt": p.SystemPrompt,
		"botName":      p.BotName,
		"userName":     p.UserName,
		"isDefault":    p.IsDefault,
		"createdAt":    p.CreatedAt,
		"updatedAt":    p.UpdatedAt,
	}
	if p.SystemKey != "" {
		m["systemKey"] = p.SystemKey
	}
	return m
}
