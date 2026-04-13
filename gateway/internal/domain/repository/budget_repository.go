package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// BudgetRepository is the persistence port for the budget aggregate.
// It exposes the smallest set of operations the usecase layer needs —
// spending aggregation joins the finances table and the monthly chart
// query are kept here because they are pure DB shape concerns that
// would otherwise leak into the usecase.
type BudgetRepository interface {
	// ListLimits returns every budget limit the user has configured for
	// the given period (e.g. "monthly").
	ListLimits(ctx context.Context, userID uuid.UUID, period string) ([]entity.BudgetLimit, error)

	// UpsertLimit writes or overwrites the limit for a single category.
	UpsertLimit(ctx context.Context, userID uuid.UUID, category string, amount int64, period string) error

	// DeleteLimit removes the limit for a single category (equivalent to
	// setting amount=0 in the UI).
	DeleteLimit(ctx context.Context, userID uuid.UUID, category string, period string) error

	// SpendingByCategory returns the absolute expense total per category
	// for the given year/month. Income rows (amount >= 0) are excluded.
	SpendingByCategory(ctx context.Context, userID uuid.UUID, year, month int) (map[string]int64, error)

	// MonthlySpendChart returns the last 6 months of total spending ending
	// at the selected month, ordered ascending by month.
	MonthlySpendChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthSpend, error)

	// GetThresholds reads warning/danger percent thresholds from the
	// user's preferences JSONB document. Returns sensible defaults
	// (70/90) when the document is missing or empty.
	GetThresholds(ctx context.Context, userID uuid.UUID) (entity.BudgetThresholds, error)

	// SetThresholds writes warning/danger thresholds back to the user's
	// preferences JSONB.
	SetThresholds(ctx context.Context, userID uuid.UUID, thresholds entity.BudgetThresholds) error
}
