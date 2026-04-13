package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// CronRepository is the persistence port for the cron domain. User
// schedules are stored as JSON rows in knowledge_base with
// `schedule:<uuid>` keys; the system job toggles live in the users
// preferences JSONB under `scheduler.enabled_jobs` /
// `scheduler.disabled_jobs`.
type CronRepository interface {
	// ── User preferences (system-job toggles) ─────────────────────
	GetPreferences(ctx context.Context, userID uuid.UUID) (map[string]any, error)
	UpdatePreferences(ctx context.Context, userID uuid.UUID, prefs map[string]any) error

	// ── User schedules (JSON rows in knowledge_base) ──────────────
	ListSchedules(ctx context.Context, userID uuid.UUID) ([]entity.UserSchedule, error)

	// GetSchedule returns the raw JSON value for a schedule row.
	// Returns ("", false, nil) when no row matches.
	GetSchedule(ctx context.Context, userID uuid.UUID, schedID string) (string, bool, error)

	// CreateSchedule inserts a new schedule row under `schedule:<schedID>`.
	// Returns the row id from the RETURNING clause.
	CreateSchedule(ctx context.Context, userID uuid.UUID, schedID, valueJSON string) (int64, error)

	// CreateScheduleForUserID is the internal variant used by the
	// agent's cron_create tool — the usecase parses a raw user id
	// string (no uuid.UUID typing to accommodate agent payloads).
	CreateScheduleForUserID(ctx context.Context, userID, schedID, valueJSON string) (int64, error)

	UpdateSchedule(ctx context.Context, userID uuid.UUID, schedID, valueJSON string) error
	DeleteSchedule(ctx context.Context, userID uuid.UUID, schedID string) (int64, error)
}
