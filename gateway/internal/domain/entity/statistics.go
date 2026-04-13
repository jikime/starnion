package entity

import "time"

// ── /statistics DTOs ────────────────────────────────────────────────

// MonthlyTrend is one bar in the monthly income-vs-expense trend chart.
type MonthlyTrend struct {
	Month   string // "YYYY-MM"
	Income  int64
	Expense int64
}

// CategoryBreakdown is one slice of the top-N expense categories.
type CategoryBreakdown struct {
	Category string
	Amount   int64
	Count    int
}

// WeekdaySpending is one row of the weekday-of-week aggregation.
type WeekdaySpending struct {
	Weekday int // 0=Sunday .. 6=Saturday (Postgres DOW)
	Total   int64
	Avg     int64
	Count   int
}

// HeatmapCell is one day in the 90-day spending heatmap.
type HeatmapCell struct {
	Date  time.Time
	Total int64
}

// StatisticsSummary is the aggregate totals block of /statistics.
type StatisticsSummary struct {
	TotalExpense     int64
	TxCount          int
	TopCategory      string
	TopCategoryAmt   int64
	ThisMonthExpense int64
	LastMonthExpense int64
}

// ConversationStats is the messages-per-period block of /statistics.
type ConversationStats struct {
	TotalMessages     int
	ThisMonthMessages int
	UserMessages      int
	ConvCount         int
}

// ── /analytics DTOs ─────────────────────────────────────────────────

// PlatformMessages is the split of counts per platform returned by the
// multi-goroutine analytics query.
type PlatformMessages struct {
	Total     int
	User      int
	AI        int
	ThisMonth int
	LastMonth int
}

// ConversationTotals is the "total + active" snapshot for /analytics.
type ConversationTotals struct {
	Total  int
	Active int
}

// DailyMessageCount is one bar in the /analytics daily_trend chart.
type DailyMessageCount struct {
	Date  time.Time
	Count int
}

// HourlyMessageCount is one bar in the /analytics hourly_dist chart.
type HourlyMessageCount struct {
	Hour  int
	Count int
}

// WeeklyMessageCount is one bar in the /analytics weekly_trend chart.
type WeeklyMessageCount struct {
	Week  string // "MM/DD"
	Count int
}

// ── /usage DTOs ─────────────────────────────────────────────────────

// UsageSummary is the /usage totals block.
type UsageSummary struct {
	TotalRequests     int
	SuccessRequests   int
	TotalInputTokens  int64
	TotalOutputTokens int64
	TotalCachedTokens int64
	TotalCostUSD      float64
}

// UsageDay is one row in the /usage daily breakdown.
type UsageDay struct {
	Date         string
	Requests     int64
	InputTokens  int64
	OutputTokens int64
	CachedTokens int64
	CostUSD      float64
	SuccessCount int64
	ErrorCount   int64
}

// UsageModel is one row in the /usage model breakdown.
type UsageModel struct {
	Model    string
	Provider string
	Count    int64
	CostUSD  float64
	Tokens   int64
}

// UsageLog is one row in the /usage recent logs list.
type UsageLog struct {
	ID           int64
	Model        string
	Provider     string
	InputTokens  int
	OutputTokens int
	CachedTokens int
	CostUSD      float64
	Status       string
	CallType     string
	CreatedAt    string
}
