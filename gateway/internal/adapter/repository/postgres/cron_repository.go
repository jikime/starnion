package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type CronRepository struct {
	db *database.DB
}

func NewCronRepository(db *database.DB) *CronRepository {
	return &CronRepository{db: db}
}

// ── User preferences ──────────────────────────────────────────────

func (r *CronRepository) GetPreferences(ctx context.Context, userID uuid.UUID) (map[string]any, error) {
	var raw pgtype.Text
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("postgres cron prefs get: %w", err)
	}
	if !raw.Valid || raw.String == "" {
		return map[string]any{}, nil
	}
	var prefs map[string]any
	if err := json.Unmarshal([]byte(raw.String), &prefs); err != nil {
		return map[string]any{}, nil
	}
	if prefs == nil {
		prefs = map[string]any{}
	}
	return prefs, nil
}

func (r *CronRepository) UpdatePreferences(ctx context.Context, userID uuid.UUID, prefs map[string]any) error {
	payload, err := json.Marshal(prefs)
	if err != nil {
		return fmt.Errorf("postgres cron prefs marshal: %w", err)
	}
	_, err = r.db.Pool().Exec(ctx,
		`UPDATE users SET preferences = $1 WHERE id = $2`,
		string(payload), userID,
	)
	if err != nil {
		return fmt.Errorf("postgres cron prefs update: %w", err)
	}
	return nil
}

// ── User schedules ────────────────────────────────────────────────

func (r *CronRepository) ListSchedules(ctx context.Context, userID uuid.UUID) ([]entity.UserSchedule, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, key, value FROM knowledge_base
		 WHERE user_id = $1 AND key LIKE 'schedule:%'
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres cron list: %w", err)
	}
	defer rows.Close()
	var out []entity.UserSchedule
	for rows.Next() {
		var rowID int64
		var key, value string
		if err := rows.Scan(&rowID, &key, &value); err != nil {
			return nil, fmt.Errorf("postgres cron list scan: %w", err)
		}
		var data storedSchedule
		if err := json.Unmarshal([]byte(value), &data); err != nil {
			continue
		}
		out = append(out, entity.UserSchedule{
			ID:         strings.TrimPrefix(key, "schedule:"),
			KBRowID:    rowID,
			Title:      data.Title,
			Type:       data.Type,
			ReportType: data.ReportType,
			Schedule:   data.Schedule,
			Status:     data.Status,
			Message:    data.Message,
			TaskPrompt: data.TaskPrompt,
			LastOutput: data.LastOutput,
			DeliverTo:  data.DeliverTo,
			LastSent:   data.LastSent,
			CreatedAt:  data.CreatedAt,
		})
	}
	return out, rows.Err()
}

func (r *CronRepository) GetSchedule(ctx context.Context, userID uuid.UUID, schedID string) (string, bool, error) {
	var value string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, "schedule:"+schedID,
	).Scan(&value)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("postgres cron get: %w", err)
	}
	return value, true, nil
}

func (r *CronRepository) CreateSchedule(ctx context.Context, userID uuid.UUID, schedID, valueJSON string) (int64, error) {
	var rowID int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		userID, "schedule:"+schedID, valueJSON,
	).Scan(&rowID)
	if err != nil {
		return 0, fmt.Errorf("postgres cron create: %w", err)
	}
	return rowID, nil
}

func (r *CronRepository) CreateScheduleForUserID(ctx context.Context, userIDRaw, schedID, valueJSON string) (int64, error) {
	var rowID int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		userIDRaw, "schedule:"+schedID, valueJSON,
	).Scan(&rowID)
	if err != nil {
		return 0, fmt.Errorf("postgres cron internal create: %w", err)
	}
	return rowID, nil
}

func (r *CronRepository) UpdateSchedule(ctx context.Context, userID uuid.UUID, schedID, valueJSON string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		valueJSON, userID, "schedule:"+schedID,
	)
	if err != nil {
		return fmt.Errorf("postgres cron update: %w", err)
	}
	return nil
}

func (r *CronRepository) DeleteSchedule(ctx context.Context, userID uuid.UUID, schedID string) (int64, error) {
	res, err := r.db.Pool().Exec(ctx,
		`DELETE FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, "schedule:"+schedID,
	)
	if err != nil {
		return 0, fmt.Errorf("postgres cron delete: %w", err)
	}
	return res.RowsAffected(), nil
}

// storedSchedule mirrors the JSON blob persisted in knowledge_base.
// The usecase constructs + writes this shape via the repo's Create /
// Update methods (which accept a raw JSON string to keep the
// repository backend-agnostic).
type storedSchedule struct {
	Title      string           `json:"title"`
	Type       string           `json:"type"`
	ReportType string           `json:"report_type"`
	Schedule   entity.SchedTime `json:"schedule"`
	Status     string           `json:"status"`
	Message    string           `json:"message"`
	TaskPrompt string           `json:"task_prompt,omitempty"`
	LastOutput string           `json:"last_output,omitempty"`
	DeliverTo  string           `json:"deliver_to,omitempty"`
	LastSent   string           `json:"last_sent"`
	CreatedAt  string           `json:"created_at"`
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.CronRepository = (*CronRepository)(nil)
