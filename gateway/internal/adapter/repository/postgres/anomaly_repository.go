package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type AnomalyRepository struct {
	db *database.DB
}

func NewAnomalyRepository(db *database.DB) *AnomalyRepository {
	return &AnomalyRepository{db: db}
}

func (r *AnomalyRepository) DailySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.DailySpend, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT DATE(created_at) AS day, ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY day ORDER BY day`, userID, since)
	if err != nil {
		return nil, fmt.Errorf("postgres anomaly daily: %w", err)
	}
	defer rows.Close()
	var out []entity.DailySpend
	for rows.Next() {
		var p entity.DailySpend
		if err := rows.Scan(&p.Day, &p.Total); err != nil {
			return nil, fmt.Errorf("postgres anomaly daily scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *AnomalyRepository) WeeklyCategorySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.WeeklyCategorySpend, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT category,
		       DATE_TRUNC('week', created_at) AS week,
		       ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category, week
		ORDER BY category, week`, userID, since)
	if err != nil {
		return nil, fmt.Errorf("postgres anomaly weekly: %w", err)
	}
	defer rows.Close()
	var out []entity.WeeklyCategorySpend
	for rows.Next() {
		var p entity.WeeklyCategorySpend
		if err := rows.Scan(&p.Category, &p.Week, &p.Total); err != nil {
			return nil, fmt.Errorf("postgres anomaly weekly scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *AnomalyRepository) MonthlySpendingSince(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.MonthlySpend, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		       ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY month ORDER BY month`, userID, since)
	if err != nil {
		return nil, fmt.Errorf("postgres anomaly monthly: %w", err)
	}
	defer rows.Close()
	var out []entity.MonthlySpend
	for rows.Next() {
		var p entity.MonthlySpend
		if err := rows.Scan(&p.Month, &p.Total); err != nil {
			return nil, fmt.Errorf("postgres anomaly monthly scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *AnomalyRepository) ActiveGoals(ctx context.Context, userID uuid.UUID) ([]entity.ActiveGoal, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT title, due_date, updated_at
		FROM planner_goals
		WHERE user_id = $1 AND status = 'active'`, userID)
	if err != nil {
		return nil, fmt.Errorf("postgres anomaly goals: %w", err)
	}
	defer rows.Close()
	var out []entity.ActiveGoal
	for rows.Next() {
		var g entity.ActiveGoal
		if err := rows.Scan(&g.Title, &g.DueDate, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres anomaly goals scan: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.AnomalyRepository = (*AnomalyRepository)(nil)
