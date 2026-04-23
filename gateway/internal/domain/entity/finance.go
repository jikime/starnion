package entity

import (
	"encoding/json"
	"time"
)

// Transaction is one row in the finances table. Amount is stored as a
// signed integer (negative = expense, positive = income) because that is
// how the existing SUM queries discriminate the two flows. Location is a
// raw JSONB document so the usecase doesn't have to commit to a specific
// geo schema.
type Transaction struct {
	ID          int64
	Amount      int64
	Category    string
	Description string
	CreatedAt   time.Time
	Location    json.RawMessage // nil when the row has no location
}

// MonthFlow is one bar in the 6-month income/expense chart returned by
// the /finance/summary endpoint.
type MonthFlow struct {
	Month   string `json:"month"`   // "YYYY-MM"
	Income  int64  `json:"income"`
	Expense int64  `json:"expense"` // returned as positive
}

// CategoryAmount is one slice of the expense-breakdown donut chart.
type CategoryAmount struct {
	Category string `json:"category"`
	Amount   int64  `json:"amount"`
}

// TransactionFilter bundles the optional query-string filters the HTTP
// list endpoint accepts. Zero values mean "no filter".
type TransactionFilter struct {
	Year     int
	Month    int
	Category string
	Type     string // "income" | "expense" | ""
	Page     int
	Limit    int
}
