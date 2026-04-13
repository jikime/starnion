package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// NotificationRepository is the persistence port for the notification
// aggregate. The usecase layer depends on this interface so the
// in-memory test fake can replace Postgres for unit tests.
type NotificationRepository interface {
	// List returns the user's most-recent notifications, optionally
	// filtered to unread-only, limited to `limit` rows.
	List(ctx context.Context, userID uuid.UUID, limit int, unreadOnly bool) ([]entity.Notification, error)

	// CountUnread returns the number of unread notifications for the user.
	CountUnread(ctx context.Context, userID uuid.UUID) (int, error)

	// MarkRead marks one notification as read. The user filter prevents
	// one user from clearing another's notifications.
	MarkRead(ctx context.Context, userID uuid.UUID, id int64) error

	// MarkAllRead flips `read = true` for every notification the user owns.
	MarkAllRead(ctx context.Context, userID uuid.UUID) error
}
