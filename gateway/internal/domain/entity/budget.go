package entity

// BudgetLimit is a per-category monthly spending cap the user has set.
// Period is currently always "monthly" but the column exists so a future
// PR can add weekly / quarterly periods without a schema migration.
type BudgetLimit struct {
	Category string
	Amount   int64
	Period   string
}

// BudgetThresholds holds the two percent thresholds the UI uses to
// colour budget progress bars (warning = yellow, danger = red).
type BudgetThresholds struct {
	Warning int // percent, e.g. 70
	Danger  int // percent, e.g. 90
}

// MonthSpend is one bar in the 6-month spend-history chart.
type MonthSpend struct {
	Month string // "2026-04"
	Spent int64
}
