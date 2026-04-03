package notification

import (
	"context"
	"fmt"
	"strconv"

	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	tg "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

// TelegramNotifier sends notifications via the user's registered Telegram bot.
//
// Prerequisites for delivery:
//   - platform_identities row: user_id + platform='telegram' → platform_id (chat_id)
//   - telegram_bot_configs row: user_id + is_active=true + bot_token
//
// If either is missing the notification is silently skipped (user not linked).
type TelegramNotifier struct {
	db            *database.DB
	encryptionKey string // used to decrypt bot_token stored in channel_settings
	logger        *zap.Logger
}

// NewTelegramNotifier creates a TelegramNotifier.
// encryptionKey must match the gateway's ENCRYPTION_KEY so encrypted bot tokens
// stored in channel_settings can be decrypted before use.
func NewTelegramNotifier(db *database.DB, encryptionKey string, logger *zap.Logger) *TelegramNotifier {
	return &TelegramNotifier{db: db, encryptionKey: encryptionKey, logger: logger}
}

func (n *TelegramNotifier) Platform() string { return "telegram" }

func (n *TelegramNotifier) Send(ctx context.Context, userID, _ /*notifType*/, message string) error {
	// 1. Resolve Telegram chat_id from platform_identities.
	var platformID string
	if err := n.db.QueryRowContext(ctx,
		`SELECT platform_id FROM platform_identities
		 WHERE user_id = $1::uuid AND platform = 'telegram'
		 LIMIT 1`,
		userID,
	).Scan(&platformID); err != nil {
		// User has not linked Telegram — skip silently.
		return nil
	}

	chatID, err := strconv.ParseInt(platformID, 10, 64)
	if err != nil {
		return fmt.Errorf("telegram notifier: invalid chat_id %q: %w", platformID, err)
	}

	// 2. Resolve bot token from channel_settings.
	// Tokens are stored encrypted by the gateway; decrypt before use.
	// Falls back to the raw value for legacy unencrypted rows.
	var rawToken string
	if err := n.db.QueryRowContext(ctx,
		`SELECT bot_token FROM channel_settings
		 WHERE user_id = $1::uuid AND channel = 'telegram' AND enabled = true AND bot_token <> ''
		 LIMIT 1`,
		userID,
	).Scan(&rawToken); err != nil {
		// No active bot configured — skip silently.
		return nil
	}
	botToken := rawToken
	if n.encryptionKey != "" {
		if plain, err := crypto.Decrypt(rawToken, n.encryptionKey); err == nil && plain != "" {
			botToken = plain
		}
		// fallback: rawToken used as-is for unencrypted legacy entries
	}

	// 3. Send the message.
	client := tg.NewClient(botToken)
	if err := client.SendMessage(chatID, message); err != nil {
		return fmt.Errorf("telegram notifier: send to chat %d: %w", chatID, err)
	}

	n.logger.Info("notification: telegram sent",
		zap.String("user_id", userID),
		zap.Int64("chat_id", chatID))
	return nil
}
