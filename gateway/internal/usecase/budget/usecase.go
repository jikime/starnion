// Package budget hosts the budget summary + update use cases. Business
// rules that used to live in handler/budget.go (default thresholds,
// percent calculation, exclusion of the "전체" pseudo-category) now live
// here so they can be unit-tested against a fake BudgetRepository.
package budget

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// TotalCategory is the UI pseudo-category used to represent "the sum of
// every real category" in some older clients. The aggregation step
// drops it on the way out so it does not double-count.
const TotalCategory = "전체"

// PeriodMonthly is the only supported budget period today.
const PeriodMonthly = "monthly"

// CategorySummary is one row in the BudgetSummary response. It mirrors
// the JSON shape the frontend already consumes (category/budget/spent/
// percent) so the handler can marshal it directly without DTO mapping.
type CategorySummary struct {
	Category string  `json:"category"`
	Budget   int64   `json:"budget"`
	Spent    int64   `json:"spent"`
	Percent  float64 `json:"percent"`
}

// BudgetSummary is the full response DTO for GET /api/v1/budget.
type BudgetSummary struct {
	Budgets           []CategorySummary   `json:"budgets"`
	TotalBudget       int64               `json:"total_budget"`
	TotalSpent        int64               `json:"total_spent"`
	TotalRemaining    int64               `json:"total_remaining"`
	TotalPercent      float64             `json:"total_percent"`
	WarningThreshold  int                 `json:"warning_threshold"`
	DangerThreshold   int                 `json:"danger_threshold"`
	MonthlySpendChart []entity.MonthSpend `json:"monthly_spend_chart"`
}

// UpdateCommand is the input DTO for PUT /api/v1/budget.
type UpdateCommand struct {
	// Per-category budget limits. Zero means "delete this category's limit".
	Limits           map[string]int64
	WarningThreshold int
	DangerThreshold  int
}

// UseCase bundles budget operations behind a small interface the handler
// consumes. Construction requires a BudgetRepository only — the usecase
// layer has zero knowledge of SQL, HTTP, or echo.
type UseCase struct {
	repo repository.BudgetRepository
}

func NewUseCase(repo repository.BudgetRepository) *UseCase {
	return &UseCase{repo: repo}
}

// GetSummary assembles the budget view for a given month. It merges
// the user's limit configuration with actual spending, applies the
// total pseudo-category exclusion, and builds aggregate totals.
func (u *UseCase) GetSummary(ctx context.Context, userID uuid.UUID, year, month int) (BudgetSummary, error) {
	spendMap, err := u.repo.SpendingByCategory(ctx, userID, year, month)
	if err != nil {
		return BudgetSummary{}, err
	}
	limits, err := u.repo.ListLimits(ctx, userID, PeriodMonthly)
	if err != nil {
		return BudgetSummary{}, err
	}
	thresholds, err := u.repo.GetThresholds(ctx, userID)
	if err != nil {
		return BudgetSummary{}, err
	}
	chart, err := u.repo.MonthlySpendChart(ctx, userID, year, month)
	if err != nil {
		return BudgetSummary{}, err
	}

	// Drop the "전체" pseudo-category from both sides so the total row
	// is re-computed below and never listed alongside real categories.
	delete(spendMap, TotalCategory)
	limitMap := make(map[string]int64, len(limits))
	for _, l := range limits {
		if l.Category == TotalCategory {
			continue
		}
		limitMap[l.Category] = l.Amount
	}

	// Union of categories that appear in either the spend map or the
	// limit map.
	seen := make(map[string]struct{}, len(spendMap)+len(limitMap))
	var rows []CategorySummary
	for cat, spent := range spendMap {
		seen[cat] = struct{}{}
		budget := limitMap[cat]
		rows = append(rows, CategorySummary{
			Category: cat,
			Budget:   budget,
			Spent:    spent,
			Percent:  percent(spent, budget),
		})
	}
	for cat, budget := range limitMap {
		if _, ok := seen[cat]; ok {
			continue
		}
		rows = append(rows, CategorySummary{
			Category: cat,
			Budget:   budget,
			Spent:    0,
			Percent:  0,
		})
	}
	if rows == nil {
		rows = []CategorySummary{}
	}
	if chart == nil {
		chart = []entity.MonthSpend{}
	}

	var totalBudget, totalSpent int64
	for _, r := range rows {
		totalBudget += r.Budget
		totalSpent += r.Spent
	}

	return BudgetSummary{
		Budgets:           rows,
		TotalBudget:       totalBudget,
		TotalSpent:        totalSpent,
		TotalRemaining:    totalBudget - totalSpent,
		TotalPercent:      percent(totalSpent, totalBudget),
		WarningThreshold:  thresholds.Warning,
		DangerThreshold:   thresholds.Danger,
		MonthlySpendChart: chart,
	}, nil
}

// UpdateLimits upserts every non-zero category limit, deletes zeroed-out
// categories, and persists the threshold preferences.
func (u *UseCase) UpdateLimits(ctx context.Context, userID uuid.UUID, cmd UpdateCommand) error {
	for cat, amount := range cmd.Limits {
		if len(cat) > 100 {
			continue
		}
		var err error
		if amount > 0 {
			err = u.repo.UpsertLimit(ctx, userID, cat, amount, PeriodMonthly)
		} else {
			err = u.repo.DeleteLimit(ctx, userID, cat, PeriodMonthly)
		}
		if err != nil {
			return err
		}
	}

	thresholds := entity.BudgetThresholds{
		Warning: cmd.WarningThreshold,
		Danger:  cmd.DangerThreshold,
	}
	if thresholds.Warning <= 0 {
		thresholds.Warning = 70
	}
	if thresholds.Danger <= 0 {
		thresholds.Danger = 90
	}
	return u.repo.SetThresholds(ctx, userID, thresholds)
}

func percent(num, denom int64) float64 {
	if denom <= 0 {
		return 0
	}
	return float64(num) / float64(denom) * 100
}
