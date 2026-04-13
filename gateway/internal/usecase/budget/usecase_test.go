package budget

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// fakeBudgetRepo is an in-memory stand-in for the budget repository.
// Each test wires only the fields it cares about; unused hooks return
// zero values.
type fakeBudgetRepo struct {
	spending   map[string]int64
	spendErr   error
	limits     []entity.BudgetLimit
	limitsErr  error
	thresholds entity.BudgetThresholds
	threshErr  error
	chart      []entity.MonthSpend
	chartErr   error

	upsertReceived  map[string]int64
	deleteReceived  map[string]bool
	thresholdWrites []entity.BudgetThresholds
}

func newFakeBudgetRepo() *fakeBudgetRepo {
	return &fakeBudgetRepo{
		upsertReceived: map[string]int64{},
		deleteReceived: map[string]bool{},
	}
}

func (f *fakeBudgetRepo) ListLimits(ctx context.Context, userID uuid.UUID, period string) ([]entity.BudgetLimit, error) {
	return f.limits, f.limitsErr
}

func (f *fakeBudgetRepo) UpsertLimit(ctx context.Context, userID uuid.UUID, category string, amount int64, period string) error {
	f.upsertReceived[category] = amount
	return nil
}

func (f *fakeBudgetRepo) DeleteLimit(ctx context.Context, userID uuid.UUID, category string, period string) error {
	f.deleteReceived[category] = true
	return nil
}

func (f *fakeBudgetRepo) SpendingByCategory(ctx context.Context, userID uuid.UUID, year, month int) (map[string]int64, error) {
	return f.spending, f.spendErr
}

func (f *fakeBudgetRepo) MonthlySpendChart(ctx context.Context, userID uuid.UUID, year, month int) ([]entity.MonthSpend, error) {
	return f.chart, f.chartErr
}

func (f *fakeBudgetRepo) GetThresholds(ctx context.Context, userID uuid.UUID) (entity.BudgetThresholds, error) {
	return f.thresholds, f.threshErr
}

func (f *fakeBudgetRepo) SetThresholds(ctx context.Context, userID uuid.UUID, thresholds entity.BudgetThresholds) error {
	f.thresholdWrites = append(f.thresholdWrites, thresholds)
	return nil
}

func TestGetSummary_PropagatesRepoError(t *testing.T) {
	sentinel := errors.New("db down")
	repo := newFakeBudgetRepo()
	repo.spendErr = sentinel
	uc := NewUseCase(repo)
	_, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel, got %v", err)
	}
}

// The "전체" pseudo-category exists only for legacy clients and must
// never appear in the response rows — the usecase drops it from both
// the spend map and the limit list before aggregating.
func TestGetSummary_DropsTotalPseudoCategory(t *testing.T) {
	repo := newFakeBudgetRepo()
	repo.spending = map[string]int64{
		"식비":        30_000,
		"교통":        10_000,
		TotalCategory: 9_999_999,
	}
	repo.limits = []entity.BudgetLimit{
		{Category: "식비", Amount: 50_000},
		{Category: TotalCategory, Amount: 9_999_999},
	}
	repo.thresholds = entity.BudgetThresholds{Warning: 70, Danger: 90}
	uc := NewUseCase(repo)
	s, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, row := range s.Budgets {
		if row.Category == TotalCategory {
			t.Errorf("response must not contain %q pseudo-category", TotalCategory)
		}
	}
	if s.TotalBudget != 50_000 {
		t.Errorf("TotalBudget should exclude pseudo-category, got %d", s.TotalBudget)
	}
	if s.TotalSpent != 40_000 {
		t.Errorf("TotalSpent should exclude pseudo-category, got %d", s.TotalSpent)
	}
}

func TestGetSummary_UnionOfSpendAndLimits(t *testing.T) {
	repo := newFakeBudgetRepo()
	// "식비" appears only in spending, "교통" only in limits, "커피" in both.
	repo.spending = map[string]int64{
		"식비": 10_000,
		"커피": 20_000,
	}
	repo.limits = []entity.BudgetLimit{
		{Category: "교통", Amount: 30_000},
		{Category: "커피", Amount: 50_000},
	}
	uc := NewUseCase(repo)
	s, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byCat := map[string]CategorySummary{}
	for _, r := range s.Budgets {
		byCat[r.Category] = r
	}
	// 식비: spent only, budget 0
	if byCat["식비"].Spent != 10_000 || byCat["식비"].Budget != 0 {
		t.Errorf("식비 row wrong: %+v", byCat["식비"])
	}
	// 교통: budget only, spent 0
	if byCat["교통"].Budget != 30_000 || byCat["교통"].Spent != 0 {
		t.Errorf("교통 row wrong: %+v", byCat["교통"])
	}
	// 커피: both
	if byCat["커피"].Budget != 50_000 || byCat["커피"].Spent != 20_000 {
		t.Errorf("커피 row wrong: %+v", byCat["커피"])
	}
	// 커피 percent = 20000/50000 * 100 = 40
	if byCat["커피"].Percent < 39.9 || byCat["커피"].Percent > 40.1 {
		t.Errorf("expected 커피 percent ~40, got %.2f", byCat["커피"].Percent)
	}
}

func TestGetSummary_NilSlicesBecomeEmpty(t *testing.T) {
	repo := newFakeBudgetRepo()
	repo.spending = nil
	repo.limits = nil
	repo.chart = nil
	uc := NewUseCase(repo)
	s, err := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Budgets == nil || s.MonthlySpendChart == nil {
		t.Errorf("response slices must not be nil")
	}
}

func TestGetSummary_PercentZeroDivisionGuard(t *testing.T) {
	repo := newFakeBudgetRepo()
	repo.spending = map[string]int64{"식비": 1_000}
	// no limits set → budget = 0 → percent must not be NaN/Inf
	uc := NewUseCase(repo)
	s, _ := uc.GetSummary(context.Background(), uuid.New(), 2026, 4)
	for _, r := range s.Budgets {
		if r.Percent != 0 {
			t.Errorf("percent must be 0 when budget is 0, got %v for %s", r.Percent, r.Category)
		}
	}
}

func TestUpdateLimits_PositiveUpserts_ZeroDeletes(t *testing.T) {
	repo := newFakeBudgetRepo()
	uc := NewUseCase(repo)
	err := uc.UpdateLimits(context.Background(), uuid.New(), UpdateCommand{
		Limits: map[string]int64{
			"식비": 50_000,
			"커피": 20_000,
			"교통": 0, // zero → should delete
		},
		WarningThreshold: 80,
		DangerThreshold:  95,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.upsertReceived["식비"] != 50_000 || repo.upsertReceived["커피"] != 20_000 {
		t.Errorf("expected positive limits upserted, got %v", repo.upsertReceived)
	}
	if !repo.deleteReceived["교통"] {
		t.Errorf("zero limit should trigger DeleteLimit, got %v", repo.deleteReceived)
	}
	if len(repo.thresholdWrites) != 1 {
		t.Fatalf("expected 1 threshold write, got %d", len(repo.thresholdWrites))
	}
	got := repo.thresholdWrites[0]
	if got.Warning != 80 || got.Danger != 95 {
		t.Errorf("threshold mismatch: %+v", got)
	}
}

func TestUpdateLimits_DefaultThresholdsWhenZero(t *testing.T) {
	repo := newFakeBudgetRepo()
	uc := NewUseCase(repo)
	_ = uc.UpdateLimits(context.Background(), uuid.New(), UpdateCommand{
		Limits:           map[string]int64{},
		WarningThreshold: 0, // should default to 70
		DangerThreshold:  0, // should default to 90
	})
	if len(repo.thresholdWrites) != 1 {
		t.Fatalf("expected 1 threshold write")
	}
	got := repo.thresholdWrites[0]
	if got.Warning != 70 || got.Danger != 90 {
		t.Errorf("expected default thresholds 70/90, got %+v", got)
	}
}

func TestUpdateLimits_OversizeCategoryNameSkipped(t *testing.T) {
	repo := newFakeBudgetRepo()
	uc := NewUseCase(repo)
	longCat := make([]byte, 200)
	for i := range longCat {
		longCat[i] = 'a'
	}
	_ = uc.UpdateLimits(context.Background(), uuid.New(), UpdateCommand{
		Limits: map[string]int64{
			string(longCat): 10_000, // 200 chars > 100 limit → skipped
			"식비":          20_000,
		},
	})
	if _, ok := repo.upsertReceived[string(longCat)]; ok {
		t.Errorf("oversize category must be skipped")
	}
	if repo.upsertReceived["식비"] != 20_000 {
		t.Errorf("normal category should be upserted")
	}
}
