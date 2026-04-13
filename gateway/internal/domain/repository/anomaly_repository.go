package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// AnomalyRepository is the read-only persistence port the anomaly
// detection usecase relies on. All four queries aggregate the
// `finances` table (for the spending detectors) or `planner_goals`
// (for the stalled-goal detector). There are no writes — anomalies
// are computed on the fly per request.
type AnomalyRepository interface {
	DailySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.DailySpend, error)
	WeeklyCategorySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.WeeklyCategorySpend, error)
	MonthlySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.MonthlySpend, error)
	ActiveGoals(ctx context.Context, userID uuid.UUID) ([]entity.ActiveGoal, error)
}
