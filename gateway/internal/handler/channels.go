package handler

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/jikime/jiki/gateway/internal/telegram"
	"github.com/labstack/echo/v4"
)

// BotLifecycle is the subset of telegram.BotManager used by ChannelHandler.
// Defined as an interface so it can be mocked in tests.
type BotLifecycle interface {
	StartBot(ctx interface{ Done() <-chan struct{} }, userID, token string) error
	StopBot(userID string)
}

// ChannelHandler provides REST endpoints for per-user channel configuration.
type ChannelHandler struct {
	db  *sql.DB
	mgr *telegram.BotManager
}

// NewChannelHandler creates a new ChannelHandler.
func NewChannelHandler(db *sql.DB, mgr *telegram.BotManager) *ChannelHandler {
	return &ChannelHandler{db: db, mgr: mgr}
}

// ── Types ──────────────────────────────────────────────────────────────────

type telegramStatusResponse struct {
	Configured  bool     `json:"configured"`
	Enabled     bool     `json:"enabled"`
	BotUsername string   `json:"botUsername,omitempty"`
	Accounts    []string `json:"accounts"`
	Status      string   `json:"status"`
	DMPolicy    string   `json:"dmPolicy"`
	GroupPolicy string   `json:"groupPolicy"`
}

// ── Helpers ────────────────────────────────────────────────────────────────

// userIDFromRequest extracts the user_id query param (set by the Next.js proxy).
func userIDFromRequest(c echo.Context) string {
	return c.QueryParam("user_id")
}

// ── GetTelegram ────────────────────────────────────────────────────────────

// GetTelegram returns the calling user's Telegram channel settings.
// GET /api/v1/channels/telegram?user_id=<uuid>
func (h *ChannelHandler) GetTelegram(c echo.Context) error {
	userID := userIDFromRequest(c)
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	if h.db == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
	}

	var (
		botToken    string
		enabled     bool
		dmPolicy    = "allow"
		groupPolicy = "allow"
	)

	row := h.db.QueryRowContext(c.Request().Context(), `
		SELECT bot_token, enabled, dm_policy, group_policy
		FROM user_channel_settings
		WHERE user_id = $1 AND channel = 'telegram'
	`, userID)
	if err := row.Scan(&botToken, &enabled, &dmPolicy, &groupPolicy); err != nil && err != sql.ErrNoRows {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	configured := botToken != ""
	status := "not-configured"
	if configured {
		if enabled {
			status = "running"
		} else {
			status = "configured"
		}
	}

	// Collect linked Telegram accounts.
	accounts := []string{}
	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT COALESCE(display_name, platform_id)
		FROM platform_identities
		WHERE platform = 'telegram' AND user_id = $1
		LIMIT 20
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				accounts = append(accounts, name)
			}
		}
	}

	return c.JSON(http.StatusOK, telegramStatusResponse{
		Configured:  configured,
		Enabled:     enabled,
		Accounts:    accounts,
		Status:      status,
		DMPolicy:    dmPolicy,
		GroupPolicy: groupPolicy,
	})
}

// ── UpdateTelegram ─────────────────────────────────────────────────────────

// UpdateTelegram handles bot token registration, enable/disable, and policy updates.
// POST /api/v1/channels/telegram?user_id=<uuid>
// Body: { "action": "set-token"|"set-enabled"|"set-policy", ... }
func (h *ChannelHandler) UpdateTelegram(c echo.Context) error {
	userID := userIDFromRequest(c)
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	if h.db == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
	}

	var req struct {
		Action      string `json:"action"`
		BotToken    string `json:"botToken"`
		Enabled     *bool  `json:"enabled"`
		DMPolicy    string `json:"dmPolicy"`
		GroupPolicy string `json:"groupPolicy"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	now := time.Now()

	switch req.Action {
	case "set-token":
		if req.BotToken == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "botToken is required"})
		}
		if _, err := h.db.ExecContext(c.Request().Context(), `
			INSERT INTO user_channel_settings (user_id, channel, bot_token, enabled, updated_at)
			VALUES ($1, 'telegram', $2, FALSE, $3)
			ON CONFLICT (user_id, channel)
			DO UPDATE SET bot_token = $2, updated_at = $3
		`, userID, req.BotToken, now); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		// Stop any running bot to force token refresh.
		if h.mgr != nil {
			h.mgr.StopBot(userID)
		}

	case "set-enabled":
		if req.Enabled == nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "enabled is required"})
		}
		// Fetch current token.
		var token string
		row := h.db.QueryRowContext(c.Request().Context(), `
			SELECT bot_token FROM user_channel_settings
			WHERE user_id = $1 AND channel = 'telegram'
		`, userID)
		if err := row.Scan(&token); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "봇 토큰을 먼저 설정해 주세요"})
		}
		if token == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "봇 토큰을 먼저 설정해 주세요"})
		}
		if _, err := h.db.ExecContext(c.Request().Context(), `
			UPDATE user_channel_settings
			SET enabled = $2, updated_at = $3
			WHERE user_id = $1 AND channel = 'telegram'
		`, userID, *req.Enabled, now); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		if h.mgr != nil {
			if *req.Enabled {
				if err := h.mgr.StartBot(c.Request().Context(), userID, token); err != nil {
					return c.JSON(http.StatusBadRequest, map[string]string{"error": "봇 시작 실패: " + err.Error()})
				}
			} else {
				h.mgr.StopBot(userID)
			}
		}

	case "set-policy":
		validDM := map[string]bool{"allow": true, "pairing": true, "deny": true}
		validGroup := map[string]bool{"allow": true, "mention": true, "deny": true}

		if req.DMPolicy != "" && !validDM[req.DMPolicy] {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid dmPolicy"})
		}
		if req.GroupPolicy != "" && !validGroup[req.GroupPolicy] {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid groupPolicy"})
		}

		// Upsert row with selective policy update.
		if _, err := h.db.ExecContext(c.Request().Context(), `
			INSERT INTO user_channel_settings (user_id, channel, dm_policy, group_policy, updated_at)
			VALUES ($1, 'telegram',
				COALESCE(NULLIF($2,''), 'allow'),
				COALESCE(NULLIF($3,''), 'allow'),
				$4)
			ON CONFLICT (user_id, channel) DO UPDATE
			SET dm_policy    = CASE WHEN $2 != '' THEN $2 ELSE user_channel_settings.dm_policy END,
			    group_policy = CASE WHEN $3 != '' THEN $3 ELSE user_channel_settings.group_policy END,
			    updated_at   = $4
		`, userID, req.DMPolicy, req.GroupPolicy, now); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}

	default:
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "unsupported action: " + req.Action})
	}

	return c.JSON(http.StatusOK, map[string]string{"ok": "true"})
}

// ── Pairing endpoints ──────────────────────────────────────────────────────

type pairingRequest struct {
	ID          string  `json:"id"`
	TelegramID  string  `json:"telegramId"`
	DisplayName string  `json:"displayName"`
	MessageText string  `json:"messageText"`
	RequestedAt string  `json:"requestedAt"`
}

// ListPairing returns pending pairing requests for the caller's bot.
// GET /api/v1/channels/telegram/pairing?user_id=<uuid>
func (h *ChannelHandler) ListPairing(c echo.Context) error {
	userID := userIDFromRequest(c)
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	if h.db == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT id, telegram_id, display_name, message_text, requested_at
		FROM telegram_pairing_requests
		WHERE owner_user_id = $1 AND status = 'pending'
		ORDER BY requested_at ASC
	`, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	defer rows.Close()

	requests := []pairingRequest{}
	for rows.Next() {
		var r pairingRequest
		var requestedAt time.Time
		if err := rows.Scan(&r.ID, &r.TelegramID, &r.DisplayName, &r.MessageText, &requestedAt); err == nil {
			r.RequestedAt = requestedAt.Format(time.RFC3339)
			requests = append(requests, r)
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"requests": requests})
}

// ApprovePairing approves a pending pairing request.
// POST /api/v1/channels/telegram/pairing/:id/approve?user_id=<uuid>
func (h *ChannelHandler) ApprovePairing(c echo.Context) error {
	return h.resolvePairing(c, "approved")
}

// DenyPairing denies a pending pairing request.
// POST /api/v1/channels/telegram/pairing/:id/deny?user_id=<uuid>
func (h *ChannelHandler) DenyPairing(c echo.Context) error {
	return h.resolvePairing(c, "denied")
}

func (h *ChannelHandler) resolvePairing(c echo.Context, status string) error {
	userID := userIDFromRequest(c)
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	reqID := c.Param("id")
	if h.db == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
	}

	// Fetch telegram_id for this request (owned by the caller).
	var telegramID string
	err := h.db.QueryRowContext(c.Request().Context(), `
		SELECT telegram_id FROM telegram_pairing_requests
		WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'
	`, reqID, userID).Scan(&telegramID)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "request not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	now := time.Now()

	// Update request status.
	if _, err := h.db.ExecContext(c.Request().Context(), `
		UPDATE telegram_pairing_requests
		SET status = $1, resolved_at = $2
		WHERE id = $3 AND owner_user_id = $4
	`, status, now, reqID, userID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	// If approved, insert into approved_contacts.
	if status == "approved" {
		var displayName string
		h.db.QueryRowContext(c.Request().Context(), `
			SELECT display_name FROM telegram_pairing_requests WHERE id = $1
		`, reqID).Scan(&displayName)

		if _, err := h.db.ExecContext(c.Request().Context(), `
			INSERT INTO telegram_approved_contacts (owner_user_id, telegram_id, display_name)
			VALUES ($1, $2, $3)
			ON CONFLICT (owner_user_id, telegram_id) DO UPDATE
			SET display_name = $3, approved_at = NOW()
		`, userID, telegramID, displayName); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"ok": "true", "status": status})
}
