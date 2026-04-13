// Package conversation hosts the HTTP adapter for the conversation
// domain. Third handler sub-package to migrate out of
// internal/adapter/handler, after /http/budget and /http/user.
package conversation

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	conversationusecase "github.com/newstarnion/gateway/internal/usecase/conversation"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *conversationusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *conversationusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/conversations", h.list)
	protected.POST("/conversations", h.create)
	protected.GET("/conversations/:id", h.get)
	protected.PATCH("/conversations/:id", h.patch)
	protected.DELETE("/conversations/:id", h.delete)
	protected.GET("/conversations/:id/messages", h.listMessages)
	protected.DELETE("/conversations/:id/messages/:msgId", h.deleteMessage)
}

func (h *Handler) errorToHTTP(err error) (int, string) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "not found"
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
	var before time.Time
	if v := c.QueryParam("before"); v != "" {
		t, parseErr := time.Parse(time.RFC3339Nano, v)
		if parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid cursor"})
		}
		before = t
	}
	result, err := h.uc.List(c.Request().Context(), userID, before)
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	convs := make([]map[string]any, 0, len(result.Conversations))
	for _, cv := range result.Conversations {
		convs = append(convs, convToMap(cv))
	}
	return c.JSON(http.StatusOK, map[string]any{
		"conversations": convs,
		"has_more":      result.HasMore,
		"next_cursor":   result.NextCursor,
	})
}

func (h *Handler) create(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct {
		Title     string `json:"title"`
		PersonaID string `json:"persona_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.Create(c.Request().Context(), userID, conversationusecase.CreateCommand{
		Title:     req.Title,
		PersonaID: req.PersonaID,
	})
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusCreated, map[string]any{
		"id":         id.String(),
		"title":      req.Title,
		"persona_id": req.PersonaID,
	})
}

func (h *Handler) get(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	convID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	cv, err := h.uc.Get(c.Request().Context(), userID, convID)
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, convToMap(*cv))
}

func (h *Handler) patch(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	convID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	var req struct {
		Title     *string `json:"title"`
		PersonaID *string `json:"persona_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.Patch(c.Request().Context(), userID, convID, conversationusecase.PatchCommand{
		Title:     req.Title,
		PersonaID: req.PersonaID,
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
	convID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	if err := h.uc.Delete(c.Request().Context(), userID, convID); err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) listMessages(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	convID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	limit := 30
	if lstr := c.QueryParam("limit"); lstr != "" {
		if l, e := strconv.Atoi(lstr); e == nil {
			limit = l
		}
	}
	var since time.Time
	if v := c.QueryParam("since"); v != "" {
		t, parseErr := time.Parse(time.RFC3339Nano, v)
		if parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid since"})
		}
		since = t
	}
	var before uuid.UUID
	if v := c.QueryParam("before"); v != "" {
		u, parseErr := uuid.Parse(v)
		if parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid cursor"})
		}
		before = u
	}
	res, err := h.uc.ListMessages(c.Request().Context(), userID, convID, limit, since, before)
	if err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	msgs := make([]map[string]any, 0, len(res.Messages))
	for _, m := range res.Messages {
		msgs = append(msgs, msgToMap(m))
	}
	return c.JSON(http.StatusOK, map[string]any{
		"messages":    msgs,
		"has_more":    res.HasMore,
		"next_cursor": res.NextCursor,
	})
}

func (h *Handler) deleteMessage(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	convID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	msgID, err := uuid.Parse(c.Param("msgId"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid message id"})
	}
	if err := h.uc.DeleteMessage(c.Request().Context(), userID, convID, msgID); err != nil {
		code, msg := h.errorToHTTP(err)
		return c.JSON(code, map[string]string{"error": msg})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func convToMap(c entity.Conversation) map[string]any {
	return map[string]any{
		"id":           c.ID.String(),
		"title":        c.Title,
		"platform":     c.Platform,
		"thread_id":    c.ThreadID,
		"persona_id":   c.PersonaID,
		"persona_name": c.PersonaName,
		"created_at":   c.CreatedAt,
		"updated_at":   c.UpdatedAt,
	}
}

func msgToMap(m entity.Message) map[string]any {
	out := map[string]any{
		"id":         m.ID.String(),
		"role":       m.Role,
		"content":    m.Content,
		"created_at": m.CreatedAt,
	}
	if len(m.Attachments) > 0 {
		out["attachments"] = m.Attachments
	}
	if m.Role == "assistant" {
		if m.BotName != "" {
			out["bot_name"] = m.BotName
		}
		if m.ModelUsed != "" {
			out["model_used"] = m.ModelUsed
		}
		out["input_tokens"] = m.InputTokens
		out["output_tokens"] = m.OutputTokens
		if m.ContextTokens > 0 {
			out["context_tokens"] = m.ContextTokens
		}
		if m.ContextWindow > 0 {
			out["context_window"] = m.ContextWindow
		}
		if len(m.ToolEvents) > 0 {
			out["tool_events"] = string(m.ToolEvents)
		}
	}
	return out
}
