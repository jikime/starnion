package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// NotificationsHandler handles notification-related HTTP requests.
type NotificationsHandler struct {
	db *sql.DB
}

// NewNotificationsHandler creates a new NotificationsHandler.
func NewNotificationsHandler(db *sql.DB) *NotificationsHandler {
	return &NotificationsHandler{db: db}
}

type notificationItem struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	Read      bool   `json:"read"`
	CreatedAt string `json:"created_at"`
}

// List returns the latest notifications for a user.
// GET /api/v1/notifications?user_id=<uuid>&limit=20&unread_only=false
func (h *NotificationsHandler) List(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	limit := 20
	if l := c.QueryParam("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	unreadOnly := c.QueryParam("unread_only") == "true"

	query := `
		SELECT id, type, message, read, created_at
		FROM notifications
		WHERE user_id = $1`
	args := []any{userID}

	if unreadOnly {
		query += " AND read = false"
	}
	query += " ORDER BY created_at DESC LIMIT $2"
	args = append(args, limit)

	rows, err := h.db.QueryContext(c.Request().Context(), query, args...)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("notifications: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []notificationItem{}
	for rows.Next() {
		var n notificationItem
		var createdAt sql.NullString
		if err := rows.Scan(&n.ID, &n.Type, &n.Message, &n.Read, &createdAt); err != nil {
			continue
		}
		n.CreatedAt = createdAt.String
		items = append(items, n)
	}

	unreadCount := 0
	for _, n := range items {
		if !n.Read {
			unreadCount++
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"notifications": items,
		"unread_count":  unreadCount,
	})
}

// UnreadCount returns only the unread notification count.
// GET /api/v1/notifications/unread-count?user_id=<uuid>
func (h *NotificationsHandler) UnreadCount(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	var count int
	err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`,
		userID,
	).Scan(&count)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	return c.JSON(http.StatusOK, map[string]int{"unread_count": count})
}

// MarkRead marks one or all notifications as read.
// PATCH /api/v1/notifications/read?user_id=<uuid>
// Body: {"id": 123}  or  {"all": true}
func (h *NotificationsHandler) MarkRead(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	var body struct {
		ID  *int64 `json:"id"`
		All bool   `json:"all"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	var execErr error
	if body.All {
		_, execErr = h.db.ExecContext(c.Request().Context(),
			`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
			userID,
		)
	} else if body.ID != nil {
		_, execErr = h.db.ExecContext(c.Request().Context(),
			`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
			*body.ID, userID,
		)
	} else {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "provide id or all:true"})
	}

	if execErr != nil {
		log.Error().Err(execErr).Str("user_id", userID).Msg("notifications: mark read failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]bool{"ok": true})
}
