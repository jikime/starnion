package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

// generateLinkCode creates a 6-char hex code, persists it in the ghost user's
// preferences JSONB (expires in 10 minutes), and returns the code.
func (h *TelegramHandler) generateLinkCode(ctx context.Context, userID uuid.UUID) (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := "NION-" + strings.ToUpper(hex.EncodeToString(b)) // e.g. "NION-A3F9C218"
	expiresAt := time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)

	_, err := h.db.ExecContext(ctx, `
		UPDATE users
		SET preferences = jsonb_set(
			COALESCE(preferences, '{}')::jsonb,
			'{telegram_link}',
			$2::jsonb
		)
		WHERE id = $1`,
		userID,
		fmt.Sprintf(`{"code":"%s","expires_at":"%s"}`, code, expiresAt),
	)
	return code, err
}

// handleStartCommand handles the /start Telegram command.
// It generates a link code so the user can connect their web account.
func (h *TelegramHandler) handleStartCommand(ctx context.Context, info *userBotInfo, chatID int64) {
	tg := telegram.NewClient(info.botToken)

	code, err := h.generateLinkCode(ctx, info.userID)
	if err != nil {
		h.logger.Error("generateLinkCode failed", zap.Error(err))
		tg.SendMessage(chatID, "⚠️ Failed to generate link code. Please try again.")
		return
	}

	msg := fmt.Sprintf(
		"👋 Welcome to Starnion!\n\n"+
			"To connect this Telegram account with your web account, "+
			"go to Channels → Telegram in the web app and enter this code:\n\n"+
			"🔑 *%s*\n\n"+
			"_(valid for 10 minutes)_",
		code,
	)
	tg.SendMessage(chatID, msg)
}

// handleNewCommand resets the Telegram conversation so the next message starts fresh.
func (h *TelegramHandler) handleNewCommand(ctx context.Context, info *userBotInfo, tg *telegram.Client, chatID int64, firstName, username string) {
	newSessionID := uuid.New()
	channelKey := fmt.Sprintf("%d", chatID)
	convTitle := telegramDisplayTitle(firstName, username, chatID)

	_, err := h.db.ExecContext(ctx,
		`INSERT INTO conversations (id, user_id, title, platform, thread_id)
		 VALUES ($1, $2, $3, 'telegram', $4)`,
		newSessionID, info.userID, convTitle, channelKey,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to start a new conversation.")
		return
	}
	info.sessionID = newSessionID
	tg.SendMessage(chatID, "✅ New conversation started.")
}

// handleStatusCommand shows current persona and model.
func (h *TelegramHandler) handleStatusCommand(ctx context.Context, info *userBotInfo, tg *telegram.Client, chatID int64) {
	var personaName, model string
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(name,'Default'), COALESCE(model,'claude-sonnet-4-5')
		 FROM personas WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
		info.userID,
	).Scan(&personaName, &model)
	if personaName == "" {
		personaName = "Default"
	}
	if model == "" {
		model = "claude-sonnet-4-5"
	}
	msg := fmt.Sprintf("📊 Status\nPersona: %s\nModel: %s\nSession: active", personaName, model)
	tg.SendMessage(chatID, msg)
}

// handlePersonaCommand handles the /persona Telegram command.
// /persona        → list all personas, highlight the current default.
// /persona <N>    → switch to persona by list number.
// /persona <name> → switch to persona by name (case-insensitive).
func (h *TelegramHandler) handlePersonaCommand(ctx context.Context, info *userBotInfo, chatID int64, arg string) {
	tg := telegram.NewClient(info.botToken)

	type personaRow struct {
		id        string
		name      string
		isDefault bool
	}

	rows, err := h.db.QueryContext(ctx,
		`SELECT id, name, is_default FROM personas WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
		info.userID,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to fetch personas.")
		return
	}
	defer rows.Close()

	var personas []personaRow
	for rows.Next() {
		var p personaRow
		if err := rows.Scan(&p.id, &p.name, &p.isDefault); err != nil {
			continue
		}
		personas = append(personas, p)
	}
	if len(personas) == 0 {
		tg.SendMessage(chatID, "No personas found. Add one in Settings → Persona.")
		return
	}

	// No argument → show list.
	if arg == "" {
		var sb strings.Builder
		sb.WriteString("📋 *Persona List*\n\n")
		for i, p := range personas {
			if p.isDefault {
				sb.WriteString(fmt.Sprintf("*%d. %s* ✅ (current)\n", i+1, p.name))
			} else {
				sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, p.name))
			}
		}
		sb.WriteString("\nSwitch: `/persona <number>` or `/persona <name>`")
		tg.SendMessage(chatID, sb.String())
		return
	}

	// Resolve target persona by number or name.
	var targetID string
	var targetName string

	// Try numeric index first.
	var n int
	if _, scanErr := fmt.Sscanf(arg, "%d", &n); scanErr == nil && n >= 1 && n <= len(personas) {
		targetID = personas[n-1].id
		targetName = personas[n-1].name
	} else {
		// Case-insensitive name match.
		argLower := strings.ToLower(arg)
		for _, p := range personas {
			if strings.ToLower(p.name) == argLower {
				targetID = p.id
				targetName = p.name
				break
			}
		}
		// Prefix match fallback.
		if targetID == "" {
			for _, p := range personas {
				if strings.HasPrefix(strings.ToLower(p.name), argLower) {
					targetID = p.id
					targetName = p.name
					break
				}
			}
		}
	}

	if targetID == "" {
		tg.SendMessage(chatID, fmt.Sprintf("❌ Persona \"%s\" not found.\nUse `/persona` to see the list.", arg))
		return
	}

	// Already active.
	for _, p := range personas {
		if p.id == targetID && p.isDefault {
			tg.SendMessage(chatID, fmt.Sprintf("✅ *%s* is already the active persona.", targetName))
			return
		}
	}

	// Atomic persona switch: set is_default = TRUE for the target row, FALSE for all
	// others in a single UPDATE to avoid a race between the two-step approach.
	_, err = h.db.ExecContext(ctx,
		`UPDATE personas SET is_default = (id = $1) WHERE user_id = $2`,
		targetID, info.userID,
	)
	if err != nil {
		tg.SendMessage(chatID, "⚠️ Failed to switch persona.")
		return
	}

	tg.SendMessage(chatID, fmt.Sprintf("✅ Switched to *%s*.", targetName))
}
