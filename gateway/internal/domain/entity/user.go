package entity

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID               uuid.UUID      `db:"id"`
	TelegramID       *int64         `db:"telegram_id"`
	TelegramUsername *string        `db:"telegram_username"`
	Email            *string        `db:"email"`
	PasswordHash     *string        `db:"password_hash"`
	DisplayName      *string        `db:"display_name"`
	AvatarURL        *string        `db:"avatar_url"`
	Preferences      map[string]any `db:"preferences"`
	IsActive         bool           `db:"is_active"`
	CreatedAt        time.Time      `db:"created_at"`
	UpdatedAt        time.Time      `db:"updated_at"`
}

type TelegramBotConfig struct {
	ID          uuid.UUID `db:"id"`
	UserID      uuid.UUID `db:"user_id"`
	BotToken    string    `db:"bot_token"`
	BotUsername *string   `db:"bot_username"`
	WebhookURL  *string   `db:"webhook_url"`
	IsActive    bool      `db:"is_active"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

type ChatSession struct {
	ID              uuid.UUID      `db:"id"`
	UserID          uuid.UUID      `db:"user_id"`
	Title           *string        `db:"title"`
	Model           string         `db:"model"`
	SessionFilePath *string        `db:"session_file_path"`
	Metadata        map[string]any `db:"metadata"`
	CreatedAt       time.Time      `db:"created_at"`
	UpdatedAt       time.Time      `db:"updated_at"`
}

type ChatMessage struct {
	ID         uuid.UUID      `db:"id"`
	SessionID  uuid.UUID      `db:"session_id"`
	UserID     uuid.UUID      `db:"user_id"`
	Role       string         `db:"role"`
	Content    string         `db:"content"`
	ToolName   *string        `db:"tool_name"`
	ToolInput  map[string]any `db:"tool_input"`
	ToolResult map[string]any `db:"tool_result"`
	Metadata   map[string]any `db:"metadata"`
	CreatedAt  time.Time      `db:"created_at"`
}
