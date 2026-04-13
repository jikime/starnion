// Package finance hosts the finance transaction + summary use cases.
// Validation rules (category <= 100 chars, description <= 500) and
// pagination clamping live here instead of the HTTP handler so they can
// be unit-tested against a fake FinanceRepository.
package finance

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	maxCategoryLen    = 100
	maxDescriptionLen = 500
)

// UseCase bundles finance operations behind a small interface the HTTP
// handler consumes.
type UseCase struct {
	repo repository.FinanceRepository
}

func NewUseCase(repo repository.FinanceRepository) *UseCase {
	return &UseCase{repo: repo}
}

// Summary is the response DTO for GET /api/v1/finance/summary. Fields
// map 1:1 to the JSON the frontend already consumes so the handler can
// marshal it directly.
type Summary struct {
	Income            int64                   `json:"income"`
	Expense           int64                   `json:"expense"`
	Net               int64                   `json:"net"`
	SavingsRate       float64                 `json:"savings_rate"`
	MonthlyChart      []entity.MonthFlow      `json:"monthly_chart"`
	CategoryBreakdown []entity.CategoryAmount `json:"category_breakdown"`
}

// GetSummary assembles totals + chart + category breakdown for a month.
func (u *UseCase) GetSummary(ctx context.Context, userID uuid.UUID, year, month int) (Summary, error) {
	income, expenseSigned, err := u.repo.MonthlyTotals(ctx, userID, year, month)
	if err != nil {
		return Summary{}, err
	}
	net := income + expenseSigned // expense is negative in the column

	var savingsRate float64
	if income > 0 {
		savingsRate = float64(net) / float64(income) * 100
	}

	chart, err := u.repo.MonthlyChart(ctx, userID, year, month)
	if err != nil {
		return Summary{}, err
	}
	if chart == nil {
		chart = []entity.MonthFlow{}
	}

	breakdown, err := u.repo.ExpenseByCategory(ctx, userID, year, month)
	if err != nil {
		return Summary{}, err
	}
	if breakdown == nil {
		breakdown = []entity.CategoryAmount{}
	}

	return Summary{
		Income:            income,
		Expense:           -expenseSigned, // positive for the response
		Net:               net,
		SavingsRate:       savingsRate,
		MonthlyChart:      chart,
		CategoryBreakdown: breakdown,
	}, nil
}

// ListTransactions returns paginated rows + the total row count.
func (u *UseCase) ListTransactions(ctx context.Context, userID uuid.UUID, filter entity.TransactionFilter) ([]entity.Transaction, int, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 || filter.Limit > 100 {
		filter.Limit = 20
	}
	rows, total, err := u.repo.ListTransactions(ctx, userID, filter)
	if err != nil {
		return nil, 0, err
	}
	if rows == nil {
		rows = []entity.Transaction{}
	}
	return rows, total, nil
}

// MapTransactions returns transactions with non-null location for the
// selected month (or the whole history when year/month are zero).
func (u *UseCase) MapTransactions(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.Transaction, error) {
	rows, err := u.repo.MapTransactions(ctx, userID, year, month)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []entity.Transaction{}
	}
	return rows, nil
}

// CreateCommand is the input DTO for POST /api/v1/finance/transactions.
// The handler parses the request body into this struct; CreatedAtText is
// a "YYYY-MM-DD" string — if empty or unparseable the usecase falls back
// to time.Now() so the new row always has a timestamp.
type CreateCommand struct {
	Amount        int64
	Category      string
	Description   string
	CreatedAtText string
	Location      json.RawMessage
}

// CreateTransaction validates and inserts a new row.
func (u *UseCase) CreateTransaction(ctx context.Context, userID uuid.UUID, cmd CreateCommand) (entity.Transaction, error) {
	category := trim(cmd.Category, maxCategoryLen)
	description := trim(cmd.Description, maxDescriptionLen)

	createdAt := time.Now()
	if cmd.CreatedAtText != "" {
		if t, err := time.Parse("2006-01-02", cmd.CreatedAtText); err == nil {
			createdAt = t
		}
	}

	id, err := u.repo.CreateTransaction(ctx, userID, repository.TransactionCreate{
		Amount:      cmd.Amount,
		Category:    category,
		Description: description,
		CreatedAt:   createdAt,
		Location:    cmd.Location,
	})
	if err != nil {
		return entity.Transaction{}, err
	}
	return entity.Transaction{
		ID:          id,
		Amount:      cmd.Amount,
		Category:    category,
		Description: description,
		CreatedAt:   createdAt,
		Location:    cmd.Location,
	}, nil
}

// UpdateCommand mirrors the legacy HTTP body: zero values mean "leave
// alone", empty strings mean "leave alone" (except description, which is
// always rewritten so the user can clear it), and CreatedAtText is
// parsed as YYYY-MM-DD.
type UpdateCommand struct {
	Amount         int64
	Category       string
	Description    string
	HasDescription bool
	CreatedAtText  string
	Location       json.RawMessage
	HasLocation    bool
	ClearLocation  bool
}

// UpdateTransaction validates and dispatches a partial update.
func (u *UseCase) UpdateTransaction(ctx context.Context, userID uuid.UUID, txID string, cmd UpdateCommand) error {
	upd := repository.TransactionUpdate{
		HasDescription: cmd.HasDescription,
		Description:    trim(cmd.Description, maxDescriptionLen),
		HasLocation:    cmd.HasLocation,
		Location:       cmd.Location,
		ClearLocation:  cmd.ClearLocation,
	}
	if cmd.Amount != 0 {
		amt := cmd.Amount
		upd.Amount = &amt
	}
	if cmd.Category != "" {
		upd.Category = trim(cmd.Category, maxCategoryLen)
	}
	if cmd.CreatedAtText != "" {
		if t, err := time.Parse("2006-01-02", cmd.CreatedAtText); err == nil {
			upd.CreatedAt = &t
		}
	}
	return u.repo.UpdateTransaction(ctx, userID, txID, upd)
}

// DeleteTransaction removes a row owned by the user.
func (u *UseCase) DeleteTransaction(ctx context.Context, userID uuid.UUID, txID string) error {
	return u.repo.DeleteTransaction(ctx, userID, txID)
}

func trim(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}
