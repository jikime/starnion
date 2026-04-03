package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"github.com/newstarnion/gateway/internal/notification"
	"go.uber.org/zap"
)

type NotificationHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewNotificationHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *NotificationHandler {
	return &NotificationHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/notifications?limit=20&unread_only=false
func (h *NotificationHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	limit := 20
	if l := c.QueryParam("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	unreadOnly := c.QueryParam("unread_only") == "true"

	query := `SELECT id, type, message, read, created_at
	          FROM notifications WHERE user_id = $1`
	if unreadOnly {
		query += ` AND read = false`
	}
	query += ` ORDER BY created_at DESC LIMIT $2`

	rows, err := h.db.QueryContext(c.Request().Context(), query, userID, limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch notifications"})
	}
	defer rows.Close()

	var notifications []map[string]any
	for rows.Next() {
		var id int64
		var nType, message string
		var read bool
		var createdAt time.Time
		if err := rows.Scan(&id, &nType, &message, &read, &createdAt); err != nil {
			continue
		}
		notifications = append(notifications, map[string]any{
			"id":         id,
			"type":       nType,
			"message":    message,
			"read":       read,
			"created_at": createdAt,
		})
	}
	if notifications == nil {
		notifications = []map[string]any{}
	}

	// Count unread separately.
	var unreadCount int
	h.db.QueryRowContext(c.Request().Context(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`,
		userID,
	).Scan(&unreadCount)

	return c.JSON(http.StatusOK, map[string]any{
		"notifications": notifications,
		"unread_count":  unreadCount,
	})
}

// PATCH /api/v1/notifications/read  — body: {id: N} or {all: true}
func (h *NotificationHandler) MarkRead(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var body struct {
		ID  *int64 `json:"id"`
		All bool   `json:"all"`
	}
	_ = c.Bind(&body)

	ctx := c.Request().Context()
	if body.All || body.ID == nil {
		_, err = h.db.ExecContext(ctx,
			`UPDATE notifications SET read = true WHERE user_id = $1`,
			userID,
		)
	} else {
		_, err = h.db.ExecContext(ctx,
			`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
			*body.ID, userID,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to mark as read"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/v1/internal/notify
// Called by the agent scheduler to deliver notifications without direct DB access.
// Auth: X-Internal-Secret header (same secret as /internal/logs).
// Body: {"user_id": "<uuid>", "message": "...", "type": "scheduler"}
func (h *NotificationHandler) InternalSend(c echo.Context) error {
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
	// Build a one-shot dispatcher using the gateway's encryption key so the
	// TelegramNotifier can decrypt bot tokens stored in channel_settings.
	d := notification.NewDispatcher(h.db, h.logger,
		notification.NewTelegramNotifier(h.db, h.config.EncryptionKey, h.logger),
	)
	if err := d.Dispatch(c.Request().Context(), req.UserID, notifType, req.Message); err != nil {
		h.logger.Warn("internal notify: dispatch error", zap.String("user_id", req.UserID), zap.Error(err))
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "sent"})
}

// PUT /api/v1/notifications/read-all
func (h *NotificationHandler) MarkAllRead(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE notifications SET read = true WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to mark all as read"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "all read"})
}
