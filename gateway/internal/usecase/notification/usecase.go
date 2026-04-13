// Package notification hosts the in-app notification use cases:
// listing with unread count, marking individual or all notifications
// as read. The external delivery pipeline (Telegram, …) is handled by
// `internal/notification`; this package only touches the DB-backed
// notification list.
package notification

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// ListResult is the DTO for GET /api/v1/notifications. UnreadCount is
// always the total across the user's inbox, not just the returned page.
type ListResult struct {
	Notifications []entity.Notification
	UnreadCount   int
}

type UseCase struct {
	repo repository.NotificationRepository
}

func NewUseCase(repo repository.NotificationRepository) *UseCase {
	return &UseCase{repo: repo}
}

// List returns the user's most-recent notifications plus the full
// unread count. `limit` is clamped to [1, maxListLimit].
func (u *UseCase) List(ctx context.Context, userID uuid.UUID, limit int, unreadOnly bool) (ListResult, error) {
	if limit <= 0 || limit > maxListLimit {
		limit = defaultListLimit
	}
	items, err := u.repo.List(ctx, userID, limit, unreadOnly)
	if err != nil {
		return ListResult{}, err
	}
	count, err := u.repo.CountUnread(ctx, userID)
	if err != nil {
		return ListResult{}, err
	}
	return ListResult{Notifications: items, UnreadCount: count}, nil
}

// MarkRead flips one notification to read.
func (u *UseCase) MarkRead(ctx context.Context, userID uuid.UUID, id int64) error {
	return u.repo.MarkRead(ctx, userID, id)
}

// MarkAllRead flips every notification owned by the user to read.
func (u *UseCase) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	return u.repo.MarkAllRead(ctx, userID)
}
