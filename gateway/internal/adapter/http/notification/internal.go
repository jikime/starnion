package notification

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/notification"
	"go.uber.org/zap"
)

// InternalHandler owns the agent-facing /internal/notify endpoint.
// It wraps a notification.Dispatcher directly (the usecase layer
// intentionally does not import the dispatcher because the usecase
// is pure CRUD over the notifications table) so the legacy handler
// package no longer needs a shim file just for one route.
//
// The router mounts this on the api group guarded by the
// X-Internal-Secret middleware.
type InternalHandler struct {
	dispatcher *notification.Dispatcher
	logger     *zap.Logger
}

// NewInternalHandler constructs an InternalHandler over the
// bootstrap-owned dispatcher singleton.
func NewInternalHandler(d *notification.Dispatcher, logger *zap.Logger) *InternalHandler {
	return &InternalHandler{dispatcher: d, logger: logger}
}

// Send implements POST /api/internal/notify — called by the agent
// scheduler to deliver notifications without direct DB access.
// The handler validates the request and hands off to the shared
// dispatcher, which writes the row and fires any configured
// Notifier (telegram, etc.).
func (h *InternalHandler) Send(c echo.Context) error {
	var req struct {
		UserID  string `json:"user_id"`
		Message string `json:"message"`
		Type    string `json:"type"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Message == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and message are required"})
	}
	if _, err := uuid.Parse(req.UserID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid user_id"})
	}
	if len(req.Message) > 4096 {
		req.Message = req.Message[:4096]
	}
	notifType := req.Type
	if notifType == "" {
		notifType = "scheduler"
	}
	if len(notifType) > 50 {
		notifType = notifType[:50]
	}
	// Dispatcher.Dispatch is best-effort: per-channel failures are
	// logged inside the dispatcher and never surface as an error.
	h.dispatcher.Dispatch(c.Request().Context(), req.UserID, notifType, req.Message)
	return c.JSON(http.StatusOK, map[string]string{"status": "sent"})
}
