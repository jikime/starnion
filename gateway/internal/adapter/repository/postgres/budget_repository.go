package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type BudgetRepository struct {
	db *database.DB
}

func NewBudgetRepository(db *database.DB) *BudgetRepository {
	return &BudgetRepository{db: db}
}

func (r *BudgetRepository) ListLimits(ctx context.Context, userID uuid.UUID, period string) ([]entity.BudgetLimit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT category, amount, period FROM budgets WHERE user_id = $1 AND period = $2`,
		userID, period,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres budget list: %w", err)
	}
	defer rows.Close()
	var out []entity.BudgetLimit
	for rows.Next() {
		var b entity.BudgetLimit
		if err := rows.Scan(&b.Category, &b.Amount, &b.Period); err != nil {
			return nil, fmt.Errorf("postgres budget scan: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *BudgetRepository) UpsertLimit(ctx context.Context, userID uuid.UUID, category string, amount int64, period string) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO budgets (user_id, category, amount, period)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, category, period) DO UPDATE
		   SET amount = EXCLUDED.amount, updated_at = NOW()`,
		userID, category, amount, period,
	)
	if err != nil {
		return fmt.Errorf("postgres budget upsert: %w", err)
	}
	return nil
}

func (r *BudgetRepository) DeleteLimit(ctx context.Context, userID uuid.UUID, category string, period string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM budgets WHERE user_id = $1 AND category = $2 AND period = $3`,
		userID, category, period,
	)
	if err != nil {
		return fmt.Errorf("postgres budget delete: %w", err)
	}
	return nil
}

func (r *BudgetRepository) SpendingByCategory(ctx context.Context, userID uuid.UUID, year, month int) (map[string]int64, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT category, ABS(SUM(amount))
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY category`,
		userID, year, month,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres budget spending: %w", err)
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var cat string
		var total int64
		if err := rows.Scan(&cat, &total); err != nil {
			return nil, fmt.Errorf("postgres budget spending scan: %w", err)
		}
		out[cat] = total
	}
	return out, rows.Err()
}

func (r *BudgetRepository) MonthlySpendChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthSpend, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		        ABS(SUM(amount)) AS spent
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) BETWEEN
		       DATE_TRUNC('month', MAKE_DATE($2, $3, 1)) - INTERVAL '5 months'
		       AND DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY 1 ORDER BY 1`,
		userID, year, month,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres budget chart: %w", err)
	}
	defer rows.Close()
	var out []entity.MonthSpend
	for rows.Next() {
		var ms entity.MonthSpend
		if err := rows.Scan(&ms.Month, &ms.Spent); err != nil {
			return nil, fmt.Errorf("postgres budget chart scan: %w", err)
		}
		out = append(out, ms)
	}
	return out, rows.Err()
}

func (r *BudgetRepository) GetThresholds(ctx context.Context, userID uuid.UUID) (entity.BudgetThresholds, error) {
	defaults := entity.BudgetThresholds{Warning: 70, Danger: 90}
	var prefsJSON []byte
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences, '{}'::jsonb) FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON)
	if err != nil {
		return defaults, nil
	}
	var prefs map[string]json.RawMessage
	if json.Unmarshal(prefsJSON, &prefs) != nil {
		return defaults, nil
	}
	budgetRaw, ok := prefs["budget"]
	if !ok {
		return defaults, nil
	}
	var bp struct {
		Warning int `json:"warning_threshold"`
		Danger  int `json:"danger_threshold"`
	}
	if json.Unmarshal(budgetRaw, &bp) != nil {
		return defaults, nil
	}
	if bp.Warning > 0 {
		defaults.Warning = bp.Warning
	}
	if bp.Danger > 0 {
		defaults.Danger = bp.Danger
	}
	return defaults, nil
}

func (r *BudgetRepository) SetThresholds(ctx context.Context, userID uuid.UUID, thresholds entity.BudgetThresholds) error {
	payload, err := json.Marshal(map[string]int{
		"warning_threshold": thresholds.Warning,
		"danger_threshold":  thresholds.Danger,
	})
	if err != nil {
		return err
	}
	_, err = r.db.Pool().Exec(ctx,
		`UPDATE users
		 SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{budget}', $1::jsonb),
		     updated_at  = NOW()
		 WHERE id = $2`,
		string(payload), userID,
	)
	if err != nil {
		return fmt.Errorf("postgres budget set thresholds: %w", err)
	}
	return nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.BudgetRepository = (*BudgetRepository)(nil)
