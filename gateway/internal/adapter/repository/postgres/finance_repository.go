package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// FinanceRepository is the Postgres adapter for the finance aggregate.
type FinanceRepository struct {
	db *database.DB
}

func NewFinanceRepository(db *database.DB) *FinanceRepository {
	return &FinanceRepository{db: db}
}

func (r *FinanceRepository) MonthlyTotals(ctx context.Context, userID uuid.UUID, year, month int) (int64, int64, error) {
	var income, expense int64
	err := r.db.Pool().QueryRow(ctx,
		`SELECT
			COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0),
			COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)
		 FROM finances
		 WHERE user_id = $1
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))`,
		userID, year, month,
	).Scan(&income, &expense)
	if err != nil {
		return 0, 0, fmt.Errorf("postgres finance totals: %w", err)
	}
	return income, expense, nil
}

func (r *FinanceRepository) MonthlyChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthFlow, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT
			TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
			COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS income,
			COALESCE(ABS(SUM(amount) FILTER (WHERE amount < 0)), 0) AS expense
		 FROM finances
		 WHERE user_id = $1
		   AND DATE_TRUNC('month', created_at) BETWEEN
		       DATE_TRUNC('month', MAKE_DATE($2, $3, 1)) - INTERVAL '5 months'
		       AND DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY 1
		 ORDER BY 1`,
		userID, year, month,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres finance chart: %w", err)
	}
	defer rows.Close()
	var out []entity.MonthFlow
	for rows.Next() {
		var mf entity.MonthFlow
		if err := rows.Scan(&mf.Month, &mf.Income, &mf.Expense); err != nil {
			return nil, fmt.Errorf("postgres finance chart scan: %w", err)
		}
		out = append(out, mf)
	}
	return out, rows.Err()
}

func (r *FinanceRepository) ExpenseByCategory(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.CategoryAmount, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT category, ABS(SUM(amount)) AS amount
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY category
		 ORDER BY amount DESC`,
		userID, year, month,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres finance category: %w", err)
	}
	defer rows.Close()
	var out []entity.CategoryAmount
	for rows.Next() {
		var ca entity.CategoryAmount
		if err := rows.Scan(&ca.Category, &ca.Amount); err != nil {
			return nil, fmt.Errorf("postgres finance category scan: %w", err)
		}
		out = append(out, ca)
	}
	return out, rows.Err()
}

func (r *FinanceRepository) ListTransactions(ctx context.Context, userID uuid.UUID, filter entity.TransactionFilter) ([]entity.Transaction, int, error) {
	where := "WHERE user_id = $1"
	args := []any{userID}
	argIdx := 2

	if filter.Year > 0 && filter.Month > 0 {
		where += " AND EXTRACT(YEAR FROM created_at) = $" + strconv.Itoa(argIdx) +
			" AND EXTRACT(MONTH FROM created_at) = $" + strconv.Itoa(argIdx+1)
		args = append(args, filter.Year, filter.Month)
		argIdx += 2
	}
	if filter.Category != "" {
		where += " AND category = $" + strconv.Itoa(argIdx)
		args = append(args, filter.Category)
		argIdx++
	}
	switch filter.Type {
	case "income":
		where += " AND amount > 0"
	case "expense":
		where += " AND amount < 0"
	}

	var total int
	if err := r.db.Pool().QueryRow(ctx, "SELECT COUNT(*) FROM finances "+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("postgres finance count: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	page := filter.Page
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	query := "SELECT id, amount, category, description, created_at, location FROM finances " + where +
		" ORDER BY created_at DESC LIMIT $" + strconv.Itoa(argIdx) +
		" OFFSET $" + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("postgres finance list: %w", err)
	}
	defer rows.Close()

	var out []entity.Transaction
	for rows.Next() {
		tx, err := scanTransaction(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, tx)
	}
	return out, total, rows.Err()
}

func (r *FinanceRepository) MapTransactions(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.Transaction, error) {
	where := "WHERE user_id = $1 AND location IS NOT NULL"
	args := []any{userID}
	if year > 0 && month > 0 {
		where += " AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3"
		args = append(args, year, month)
	}
	rows, err := r.db.Pool().Query(ctx,
		"SELECT id, amount, category, description, created_at, location FROM finances "+where+
			" ORDER BY created_at DESC LIMIT 500",
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres finance map: %w", err)
	}
	defer rows.Close()
	var out []entity.Transaction
	for rows.Next() {
		tx, err := scanTransaction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, tx)
	}
	return out, rows.Err()
}

func (r *FinanceRepository) CreateTransaction(ctx context.Context, userID uuid.UUID, tx repository.TransactionCreate) (int64, error) {
	var locationArg any
	if len(tx.Location) > 0 {
		locationArg = string(tx.Location)
	}
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO finances (user_id, amount, category, description, created_at, location)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
		userID, tx.Amount, tx.Category, tx.Description, tx.CreatedAt, locationArg,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres finance insert: %w", err)
	}
	return id, nil
}

func (r *FinanceRepository) UpdateTransaction(ctx context.Context, userID uuid.UUID, txID string, upd repository.TransactionUpdate) error {
	set := ""
	args := []any{}
	argIdx := 1

	if upd.Amount != nil {
		set += "amount = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, *upd.Amount)
		argIdx++
	}
	if upd.Category != "" {
		set += "category = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, upd.Category)
		argIdx++
	}
	if upd.HasDescription {
		set += "description = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, upd.Description)
		argIdx++
	}
	if upd.CreatedAt != nil {
		set += "created_at = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, *upd.CreatedAt)
		argIdx++
	}
	if upd.ClearLocation {
		set += "location = NULL, "
	} else if upd.HasLocation && len(upd.Location) > 0 {
		set += "location = $" + strconv.Itoa(argIdx) + "::jsonb, "
		args = append(args, string(upd.Location))
		argIdx++
	}

	if set == "" {
		return nil
	}
	set = set[:len(set)-2]

	args = append(args, txID, userID)
	_, err := r.db.Pool().Exec(ctx,
		"UPDATE finances SET "+set+" WHERE id = $"+strconv.Itoa(argIdx)+" AND user_id = $"+strconv.Itoa(argIdx+1),
		args...,
	)
	if err != nil {
		return fmt.Errorf("postgres finance update: %w", err)
	}
	return nil
}

func (r *FinanceRepository) DeleteTransaction(ctx context.Context, userID uuid.UUID, txID string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM finances WHERE id = $1 AND user_id = $2`,
		txID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres finance delete: %w", err)
	}
	return nil
}

// scanTransaction reads one finance row in the order used by every
// SELECT in this file. Rows are passed in as the row-iterator interface
// instead of *sql.Rows so the helper can service QueryRow and Query
// paths if a future endpoint needs it.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanTransaction(row rowScanner) (entity.Transaction, error) {
	var (
		id          int64
		amount      int64
		category    string
		description *string
		createdAt   time.Time
		locationStr *string
	)
	if err := row.Scan(&id, &amount, &category, &description, &createdAt, &locationStr); err != nil {
		return entity.Transaction{}, fmt.Errorf("postgres finance scan: %w", err)
	}
	tx := entity.Transaction{
		ID:        id,
		Amount:    amount,
		Category:  category,
		CreatedAt: createdAt,
	}
	if description != nil {
		tx.Description = *description
	}
	if locationStr != nil {
		tx.Location = json.RawMessage(*locationStr)
	}
	return tx, nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.FinanceRepository = (*FinanceRepository)(nil)
