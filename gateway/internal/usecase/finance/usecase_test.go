package finance

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// fakeFinanceRepo implements repository.FinanceRepository for unit
// tests. The "received" fields capture the last call's arguments so
// tests can assert the usecase forwarded normalised values.
type fakeFinanceRepo struct {
	income, expense int64
	monthlyErr      error

	chart     []entity.MonthFlow
	breakdown []entity.CategoryAmount

	listFilter entity.TransactionFilter
	listRows   []entity.Transaction
	listTotal  int

	createReceived repository.TransactionCreate
	createID       int64

	updateReceived repository.TransactionUpdate
	updateTxID     string
}

func (f *fakeFinanceRepo) MonthlyTotals(ctx context.Context, userID uuid.UUID, year, month int) (int64, int64, error) {
	return f.income, f.expense, f.monthlyErr
}

func (f *fakeFinanceRepo) MonthlyChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthFlow, error) {
	return f.chart, nil
}

func (f *fakeFinanceRepo) ExpenseByCategory(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.CategoryAmount, error) {
	return f.breakdown, nil
}

func (f *fakeFinanceRepo) ListTransactions(ctx context.Context, userID uuid.UUID, filter entity.TransactionFilter) ([]entity.Transaction, int, error) {
	f.listFilter = filter
	return f.listRows, f.listTotal, nil
}

func (f *fakeFinanceRepo) MapTransactions(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.Transaction, error) {
	return nil, nil
}

func (f *fakeFinanceRepo) CreateTransaction(ctx context.Context, userID uuid.UUID, tx repository.TransactionCreate) (int64, error) {
	f.createReceived = tx
	if f.createID == 0 {
		f.createID = 42
	}
	return f.createID, nil
}

func (f *fakeFinanceRepo) UpdateTransaction(ctx context.Context, userID uuid.UUID, txID string, upd repository.TransactionUpdate) error {
	f.updateTxID = txID
	f.updateReceived = upd
	return nil
}

func (f *fakeFinanceRepo) DeleteTransaction(ctx context.Context, userID uuid.UUID, txID string) error {
	return nil
}

func TestGetSummary_FlipsExpenseSignAndComputesSavings(t *testing.T) {
	repo := &fakeFinanceRepo{
		income:  100_000,
		expense: -40_000, // column sign
	}
	uc := NewUseCase(repo)
	s, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Expense != 40_000 {
		t.Errorf("expected Expense flipped to +40000, got %d", s.Expense)
	}
	if s.Net != 60_000 {
		t.Errorf("expected Net=60000 (income + signed expense), got %d", s.Net)
	}
	// savings_rate = net / income * 100 = 60%
	if s.SavingsRate < 59.9 || s.SavingsRate > 60.1 {
		t.Errorf("expected SavingsRate ~60, got %.2f", s.SavingsRate)
	}
}

func TestGetSummary_ZeroIncomeKeepsSavingsAtZero(t *testing.T) {
	repo := &fakeFinanceRepo{income: 0, expense: -10_000}
	uc := NewUseCase(repo)
	s, _ := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if s.SavingsRate != 0 {
		t.Errorf("expected SavingsRate=0 when income=0 (division guard), got %.2f", s.SavingsRate)
	}
}

func TestGetSummary_NilSlicesBecomeEmpty(t *testing.T) {
	repo := &fakeFinanceRepo{chart: nil, breakdown: nil}
	uc := NewUseCase(repo)
	s, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.MonthlyChart == nil || s.CategoryBreakdown == nil {
		t.Errorf("expected empty slices (not nil) in JSON response")
	}
}

func TestListTransactions_CoercesPaginationBounds(t *testing.T) {
	cases := []struct {
		name       string
		page       int
		limit      int
		wantPage   int
		wantLimit  int
		wantReason string
	}{
		{"zero page → 1", 0, 50, 1, 50, "page defaults to 1"},
		{"negative page → 1", -4, 50, 1, 50, "negative page clamped"},
		{"zero limit → 20", 2, 0, 2, 20, "limit defaults to 20"},
		{"oversize limit → 20", 2, 500, 2, 20, "oversized limit reset"},
		{"valid values preserved", 3, 75, 3, 75, "in-range values kept"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeFinanceRepo{}
			uc := NewUseCase(repo)
			_, _, err := uc.ListTransactions(context.Background(), uuid.New(), entity.TransactionFilter{
				Page:  tc.page,
				Limit: tc.limit,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if repo.listFilter.Page != tc.wantPage {
				t.Errorf("%s: page=%d, want %d", tc.wantReason, repo.listFilter.Page, tc.wantPage)
			}
			if repo.listFilter.Limit != tc.wantLimit {
				t.Errorf("%s: limit=%d, want %d", tc.wantReason, repo.listFilter.Limit, tc.wantLimit)
			}
		})
	}
}

func TestCreateTransaction_TrimsLongFields(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	_, err := uc.CreateTransaction(context.Background(), uuid.New(), CreateCommand{
		Amount:      1000,
		Category:    strings.Repeat("c", maxCategoryLen+50),
		Description: strings.Repeat("d", maxDescriptionLen+50),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.createReceived.Category) != maxCategoryLen {
		t.Errorf("expected category trimmed to %d, got %d", maxCategoryLen, len(repo.createReceived.Category))
	}
	if len(repo.createReceived.Description) != maxDescriptionLen {
		t.Errorf("expected description trimmed to %d, got %d", maxDescriptionLen, len(repo.createReceived.Description))
	}
}

func TestCreateTransaction_ParsesCreatedAtText(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	_, err := uc.CreateTransaction(context.Background(), uuid.New(), CreateCommand{
		Amount:        5000,
		CreatedAtText: "2026-04-13",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want, _ := time.Parse("2006-01-02", "2026-04-13")
	if !repo.createReceived.CreatedAt.Equal(want) {
		t.Errorf("expected CreatedAt=%v, got %v", want, repo.createReceived.CreatedAt)
	}
}

func TestCreateTransaction_InvalidDateFallsBackToNow(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	before := time.Now().Add(-time.Second)
	_, err := uc.CreateTransaction(context.Background(), uuid.New(), CreateCommand{
		Amount:        5000,
		CreatedAtText: "not-a-date",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := repo.createReceived.CreatedAt
	if got.Before(before) || got.After(time.Now().Add(time.Second)) {
		t.Errorf("expected CreatedAt≈now when text is unparseable, got %v", got)
	}
}

func TestUpdateTransaction_OmittedFieldsStayNil(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	err := uc.UpdateTransaction(context.Background(), uuid.New(), "tx-1", UpdateCommand{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	upd := repo.updateReceived
	if upd.Amount != nil {
		t.Errorf("expected Amount to stay nil when zero")
	}
	if upd.Category != "" {
		t.Errorf("expected Category to stay empty when omitted")
	}
	if upd.CreatedAt != nil {
		t.Errorf("expected CreatedAt to stay nil when text is empty")
	}
}

func TestUpdateTransaction_HasDescriptionFlagSurvives(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	err := uc.UpdateTransaction(context.Background(), uuid.New(), "tx-1", UpdateCommand{
		HasDescription: true,
		Description:    "", // explicit clear
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.updateReceived.HasDescription {
		t.Errorf("HasDescription flag must propagate so the repo can write empty")
	}
}

func TestUpdateTransaction_LocationPassthrough(t *testing.T) {
	repo := &fakeFinanceRepo{}
	uc := NewUseCase(repo)
	loc := json.RawMessage(`{"lat":1,"lng":2}`)
	err := uc.UpdateTransaction(context.Background(), uuid.New(), "tx-1", UpdateCommand{
		HasLocation: true,
		Location:    loc,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.updateReceived.HasLocation {
		t.Errorf("HasLocation must be set")
	}
	if string(repo.updateReceived.Location) != string(loc) {
		t.Errorf("expected Location passthrough, got %s", string(repo.updateReceived.Location))
	}
}
