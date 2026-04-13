// Package notification hosts the HTTP adapter for the in-app
// notification inbox. Fourth handler sub-package to migrate out of
// internal/adapter/handler.
//
// The internal /notify endpoint (called by the agent scheduler) lives
// in the legacy handler package for now because it holds a reference
// to `internal/notification.Dispatcher` — moving it here would require
// injecting the dispatcher deeper, which is scheduled as a follow-up.
package notification

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain/entity"
	notificationusecase "github.com/newstarnion/gateway/internal/usecase/notification"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *notificationusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *notificationusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/notifications", h.list)
	protected.PATCH("/notifications/read", h.markRead)
	protected.PUT("/notifications/read-all", h.markAllRead)
}

func (h *Handler) list(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	limit := 20
	if l := c.QueryParam("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	unreadOnly := c.QueryParam("unread_only") == "true"

	res, err := h.uc.List(c.Request().Context(), userID, limit, unreadOnly)
	if err != nil {
		h.logger.Warn("notification list failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch notifications"})
	}

	items := make([]map[string]any, 0, len(res.Notifications))
	for _, n := range res.Notifications {
		items = append(items, notificationToMap(n))
	}
	return c.JSON(http.StatusOK, map[string]any{
		"notifications": items,
		"unread_count":  res.UnreadCount,
	})
}

func (h *Handler) markRead(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var body struct {
		ID  *int64 `json:"id"`
		All bool   `json:"all"`
	}
	_ = c.Bind(&body)

	var opErr error
	if body.All || body.ID == nil {
		opErr = h.uc.MarkAllRead(c.Request().Context(), userID)
	} else {
		opErr = h.uc.MarkRead(c.Request().Context(), userID, *body.ID)
	}
	if opErr != nil {
		h.logger.Warn("notification mark read failed", zap.Error(opErr))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to mark as read"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) markAllRead(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	if err := h.uc.MarkAllRead(c.Request().Context(), userID); err != nil {
		h.logger.Warn("notification mark all read failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to mark all as read"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "all read"})
}

func notificationToMap(n entity.Notification) map[string]any {
	return map[string]any{
		"id":         n.ID,
		"type":       n.Type,
		"message":    n.Message,
		"read":       n.Read,
		"created_at": n.CreatedAt.Format(time.RFC3339Nano),
	}
}
