package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// TransactionCreate is the write shape the usecase passes to the
// repository when recording a new finance entry. Location is optional.
type TransactionCreate struct {
	Amount      int64
	Category    string
	Description string
	CreatedAt   time.Time
	Location    json.RawMessage // may be nil
}

// TransactionUpdate represents a partial update. The legacy HTTP handler
// treats empty strings as "leave alone" and `description` as always
// overwritable (so the user can clear it), and that semantic is preserved
// here — hence the mix of pointers and explicit flags. See
// finance.UseCase.Update for the exact field-by-field rules.
type TransactionUpdate struct {
	Amount         *int64
	Category       string
	Description    string
	HasDescription bool
	CreatedAt      *time.Time

	// Location is only applied when HasLocation is true. ClearLocation
	// forces NULL regardless of Location — matches the old `clear_location`
	// JSON flag the UI already sends.
	Location      json.RawMessage
	HasLocation   bool
	ClearLocation bool
}

// FinanceRepository is the persistence port for the finance aggregate.
// It exposes only the queries the usecase layer needs; SQL assembly is
// an implementation detail of the postgres adapter.
type FinanceRepository interface {
	// MonthlyTotals returns (income, expense) for the given month.
	// Expense is returned as a **negative** int64 to match the column
	// sign — the usecase flips it to positive where appropriate.
	MonthlyTotals(ctx context.Context, userID uuid.UUID, year, month int) (income, expense int64, err error)

	// MonthlyChart returns six months of income/expense totals ending at
	// the selected month.
	MonthlyChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthFlow, error)

	// ExpenseByCategory returns per-category absolute expense totals for
	// the selected month, ordered largest→smallest.
	ExpenseByCategory(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.CategoryAmount, error)

	// ListTransactions returns paginated transactions along with the
	// total row count for the applied filter.
	ListTransactions(ctx context.Context, userID uuid.UUID, filter entity.TransactionFilter) ([]entity.Transaction, int, error)

	// MapTransactions returns at most 500 transactions that have a
	// non-null location, for rendering on the finance map.
	MapTransactions(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.Transaction, error)

	// CreateTransaction inserts a row and returns its id.
	CreateTransaction(ctx context.Context, userID uuid.UUID, tx TransactionCreate) (int64, error)

	// UpdateTransaction applies a partial update to a single row.
	UpdateTransaction(ctx context.Context, userID uuid.UUID, txID string, upd TransactionUpdate) error

	// DeleteTransaction removes a row owned by the user.
	DeleteTransaction(ctx context.Context, userID uuid.UUID, txID string) error
}
