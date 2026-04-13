package postgres

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type NotificationRepository struct {
	db *database.DB
}

func NewNotificationRepository(db *database.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) List(ctx context.Context, userID uuid.UUID, limit int, unreadOnly bool) ([]entity.Notification, error) {
	query := `SELECT id, type, message, read, created_at
	          FROM notifications WHERE user_id = $1`
	if unreadOnly {
		query += ` AND read = false`
	}
	query += ` ORDER BY created_at DESC LIMIT $2`

	rows, err := r.db.Pool().Query(ctx, query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("postgres notification list: %w", err)
	}
	defer rows.Close()
	var out []entity.Notification
	for rows.Next() {
		var n entity.Notification
		if err := rows.Scan(&n.ID, &n.Type, &n.Message, &n.Read, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("postgres notification scan: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *NotificationRepository) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("postgres notification count: %w", err)
	}
	return count, nil
}

func (r *NotificationRepository) MarkRead(ctx context.Context, userID uuid.UUID, id int64) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres notification mark read: %w", err)
	}
	return nil
}

func (r *NotificationRepository) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE notifications SET read = true WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("postgres notification mark all read: %w", err)
	}
	return nil
}

var _ repository.NotificationRepository = (*NotificationRepository)(nil)
