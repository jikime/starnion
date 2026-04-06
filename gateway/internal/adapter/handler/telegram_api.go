package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/crypto"
	"go.uber.org/zap"
)

// telegramDisplayTitle returns a human-readable title for a Telegram conversation.
// Prefers real @username over numeric IDs, then firstName, then fallback.
func telegramDisplayTitle(firstName, username string, telegramUserID int64) string {
	// Skip username if it looks like a pure number (Telegram numeric ID stored as username).
	isNumericUsername := true
	for _, c := range username {
		if c < '0' || c > '9' {
			isNumericUsername = false
			break
		}
	}
	if username != "" && !isNumericUsername {
		return "@" + username
	}
	if firstName != "" {
		return firstName
	}
	if username != "" {
		return "@" + username
	}
	return fmt.Sprintf("Telegram %d", telegramUserID)
}

// findOrCreateUserByTelegram looks up the user by telegram_id column,
// or creates a new starnion user linked to the Telegram ID.
func (h *TelegramHandler) findOrCreateUserByTelegram(ctx context.Context, telegramUserID, chatID int64, firstName, username string) (*userBotInfo, error) {
	var userID uuid.UUID
	var botToken string

	// Try: existing user with matching telegram_id
	err := h.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
		telegramUserID,
	).Scan(&userID)

	if err != nil {
		// No user — create one
		displayName := firstName
		if username != "" {
			displayName = username
		}
		if len(displayName) > 100 {
			displayName = displayName[:100]
		}
		safeUsername := username
		if len(safeUsername) > 100 {
			safeUsername = safeUsername[:100]
		}
		email := fmt.Sprintf("telegram_%d@starnion.local", telegramUserID)
		userID = uuid.New()
		err = h.db.QueryRowContext(ctx, `
			INSERT INTO users (id, email, display_name, password_hash, telegram_id, telegram_username)
			VALUES ($1, $2, $3, '', $4, $5)
			ON CONFLICT (email) DO UPDATE SET
				telegram_id = EXCLUDED.telegram_id,
				telegram_username = EXCLUDED.telegram_username
			RETURNING id
		`, userID, email, displayName, telegramUserID, safeUsername).Scan(&userID)
		if err != nil {
			return nil, fmt.Errorf("create telegram user: %w", err)
		}
	}

	// Resolve bot token from channel_settings
	var encBotToken string
	if csErr := h.db.QueryRowContext(ctx,
		`SELECT bot_token FROM channel_settings WHERE user_id = $1 AND channel = 'telegram' AND bot_token != '' LIMIT 1`,
		userID,
	).Scan(&encBotToken); csErr == nil && encBotToken != "" {
		decrypted, decErr := crypto.Decrypt(encBotToken, h.config.EncryptionKey)
		if decErr == nil && !strings.HasPrefix(decrypted, "enc:") && decrypted != "" {
			botToken = decrypted
		} else if !strings.HasPrefix(encBotToken, "enc:") {
			botToken = encBotToken // plaintext token stored before encryption was enabled
		}
		// else: encrypted token but decryption failed → botToken stays "" → falls through to config default
	}

	// Fall back to gateway-level default token
	if botToken == "" {
		botToken = h.config.TelegramBotToken
	}

	// botToken may be empty here — the caller (HandleUpdate) can supply the
	// poller's token as a fallback via the pollerBotToken variadic argument.

	// Get or create a conversation for this Telegram chat.
	// Use platform='telegram' + thread_id=chatID for deterministic lookup.
	// Multiple conversations per thread_id are allowed (/new creates new ones);
	// ORDER BY created_at DESC picks the most recently created conversation.
	var sessionID uuid.UUID
	channelKey := fmt.Sprintf("%d", chatID)
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM conversations
		 WHERE user_id = $1 AND platform = 'telegram' AND thread_id = $2
		 ORDER BY created_at DESC LIMIT 1`,
		userID, channelKey,
	).Scan(&sessionID)
	if err != nil {
		sessionID = uuid.New()
		convTitle := telegramDisplayTitle(firstName, username, telegramUserID)
		_, err = h.db.ExecContext(ctx,
			`INSERT INTO conversations (id, user_id, title, platform, thread_id)
			 VALUES ($1, $2, $3, 'telegram', $4)`,
			sessionID, userID, convTitle, channelKey,
		)
		if err != nil {
			return nil, fmt.Errorf("create telegram conversation: %w", err)
		}
	} else {
		// Update title in case username changed since last conversation.
		convTitle := telegramDisplayTitle(firstName, username, telegramUserID)
		if _, err := h.db.ExecContext(ctx,
			`UPDATE conversations SET title = $1 WHERE id = $2`,
			convTitle, sessionID,
		); err != nil {
			h.logger.Warn("failed to update telegram conversation title", zap.Error(err))
		}
	}

	return &userBotInfo{
		userID:    userID,
		botToken:  botToken,
		sessionID: sessionID,
	}, nil
}

type TelegramConfigRequest struct {
	BotToken   string  `json:"bot_token" validate:"required"`
	WebhookURL *string `json:"webhook_url"`
}

func (h *TelegramHandler) GetConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var cfg struct {
		BotToken    string  `json:"bot_token"`
		BotUsername *string `json:"bot_username"`
		IsActive    bool    `json:"is_active"`
	}

	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT bot_token, bot_username, enabled FROM channel_settings WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	).Scan(&cfg.BotToken, &cfg.BotUsername, &cfg.IsActive)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "no telegram config found"})
	}

	// Decrypt before masking
	plainToken, _ := crypto.Decrypt(cfg.BotToken, h.config.EncryptionKey)
	if plainToken != "" {
		cfg.BotToken = plainToken
	}
	// Mask token for security
	if len(cfg.BotToken) > 10 {
		cfg.BotToken = cfg.BotToken[:10] + "..."
	}

	return c.JSON(http.StatusOK, cfg)
}

func (h *TelegramHandler) UpdateConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req TelegramConfigRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	encToken, err := crypto.Encrypt(req.BotToken, h.config.EncryptionKey)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save config"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO channel_settings (user_id, channel, bot_token, enabled)
		 VALUES ($1, 'telegram', $2, true)
		 ON CONFLICT (user_id, channel) DO UPDATE SET
		   bot_token  = EXCLUDED.bot_token,
		   updated_at = NOW()`,
		userID, encToken,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update config"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *TelegramHandler) DeleteConfig(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE channel_settings SET bot_token = '', enabled = false WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete config"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

type TelegramLinkRequest struct {
	TelegramUserID int64 `json:"telegram_user_id"`
}

// LinkTelegram links the given telegram_user_id to the authenticated web account.
// If a ghost telegram-only account exists for that ID, its data is migrated.
func (h *TelegramHandler) LinkTelegram(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req TelegramLinkRequest
	if err := c.Bind(&req); err != nil || req.TelegramUserID == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_user_id is required"})
	}

	ctx := c.Request().Context()

	// Check: is this telegram_id already linked to another account?
	var existingID string
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE telegram_id = $1 AND id != $2 LIMIT 1`,
		req.TelegramUserID, userID,
	).Scan(&existingID)

	if err == nil {
		// A different user already owns this telegram_id — migrate their data
		ghostID := existingID

		// Migrate finance_records
		h.db.ExecContext(ctx, `UPDATE finance_records SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate planner data
		h.db.ExecContext(ctx, `UPDATE planner_tasks SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		h.db.ExecContext(ctx, `UPDATE planner_roles SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		h.db.ExecContext(ctx, `UPDATE planner_goals SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		h.db.ExecContext(ctx, `UPDATE planner_diary SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate chat_sessions (and cascade to chat_messages via FK)
		h.db.ExecContext(ctx, `UPDATE chat_sessions SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Migrate conversations (and cascade to messages via FK)
		h.db.ExecContext(ctx, `UPDATE conversations SET user_id = $1 WHERE user_id = $2`, userID, ghostID)
		// Delete ghost user
		h.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, ghostID)

		h.logger.Info("Migrated ghost telegram user to web account",
			zap.String("ghost_id", ghostID),
			zap.String("target_id", userID.String()),
		)
	}

	// Link telegram_id to the current web account
	_, err = h.db.ExecContext(ctx,
		`UPDATE users SET telegram_id = $1, telegram_username = $2 WHERE id = $3`,
		req.TelegramUserID, fmt.Sprintf("%d", req.TelegramUserID), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to link telegram account"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"status":           "linked",
		"telegram_user_id": req.TelegramUserID,
	})
}

// LinkTelegramByCode links a web account to a Telegram account using the
// short-lived code generated by the /start bot command.
// POST /api/v1/telegram/link-code {"code": "A3F9C2"}
func (h *TelegramHandler) LinkTelegramByCode(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := c.Bind(&req); err != nil || req.Code == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	// Accept with or without prefix: "A3F9C2" → "NION-A3F9C2"
	if !strings.HasPrefix(req.Code, "NION-") {
		req.Code = "NION-" + req.Code
	}

	ctx := c.Request().Context()

	// Find the ghost user that holds this code (not yet expired).
	var ghostID uuid.UUID
	var telegramID int64
	err = h.db.QueryRowContext(ctx, `
		SELECT u.id, u.telegram_id
		FROM users u
		WHERE u.preferences->'telegram_link'->>'code' = $1
		  AND (u.preferences->'telegram_link'->>'expires_at')::timestamptz > NOW()
		  AND u.telegram_id IS NOT NULL
		LIMIT 1
	`, req.Code).Scan(&ghostID, &telegramID)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}

	// If the ghost IS the current user (already a web account), just clear the code.
	if ghostID == userID {
		h.db.ExecContext(ctx, `
			UPDATE users SET preferences = preferences - 'telegram_link' WHERE id = $1`, userID)
		return c.JSON(http.StatusOK, map[string]any{"status": "already_linked", "telegram_id": telegramID})
	}

	// Migrate ghost user's data to the current web account.
	migrateTables := []string{
		`UPDATE finance_records SET user_id = $1 WHERE user_id = $2`,
		`UPDATE planner_tasks SET user_id = $1 WHERE user_id = $2`,
		`UPDATE planner_roles SET user_id = $1 WHERE user_id = $2`,
		`UPDATE planner_goals SET user_id = $1 WHERE user_id = $2`,
		`UPDATE planner_diary SET user_id = $1 WHERE user_id = $2`,
		`UPDATE conversations SET user_id = $1 WHERE user_id = $2`,
		`UPDATE knowledge_base SET user_id = $1 WHERE user_id = $2`,
	}
	for _, q := range migrateTables {
		h.db.ExecContext(ctx, q, userID, ghostID)
	}
	h.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, ghostID)

	// Set telegram_id on the web account and clear the link code.
	_, err = h.db.ExecContext(ctx, `
		UPDATE users
		SET telegram_id = $1,
		    telegram_username = $2,
		    preferences = preferences - 'telegram_link'
		WHERE id = $3`,
		telegramID, fmt.Sprintf("%d", telegramID), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to link account"})
	}

	h.logger.Info("Telegram account linked via code",
		zap.String("user_id", userID.String()),
		zap.Int64("telegram_id", telegramID),
	)

	return c.JSON(http.StatusOK, map[string]any{
		"status":      "linked",
		"telegram_id": telegramID,
	})
}
