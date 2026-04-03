package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

type UserRepository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*entity.User, error)
	FindByTelegramID(ctx context.Context, telegramID int64) (*entity.User, error)
	FindByEmail(ctx context.Context, email string) (*entity.User, error)
	Create(ctx context.Context, user *entity.User) (*entity.User, error)
	Update(ctx context.Context, user *entity.User) (*entity.User, error)
	UpdatePreferences(ctx context.Context, id uuid.UUID, preferences map[string]any) error
}

type TelegramBotConfigRepository interface {
	FindByUserID(ctx context.Context, userID uuid.UUID) (*entity.TelegramBotConfig, error)
	Upsert(ctx context.Context, config *entity.TelegramBotConfig) (*entity.TelegramBotConfig, error)
	Delete(ctx context.Context, userID uuid.UUID) error
}

type ChatSessionRepository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*entity.ChatSession, error)
	ListByUserID(ctx context.Context, userID uuid.UUID, limit, offset int) ([]*entity.ChatSession, int, error)
	Create(ctx context.Context, session *entity.ChatSession) (*entity.ChatSession, error)
	Update(ctx context.Context, session *entity.ChatSession) (*entity.ChatSession, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type ChatMessageRepository interface {
	ListBySessionID(ctx context.Context, sessionID uuid.UUID, limit, offset int) ([]*entity.ChatMessage, int, error)
	Create(ctx context.Context, message *entity.ChatMessage) (*entity.ChatMessage, error)
}
