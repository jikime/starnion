package entity

import "time"

// AnomalyReport is one finding in the /anomalies response. Fields are
// tagged so the HTTP handler can marshal the struct directly.
type AnomalyReport struct {
	Domain    string  `json:"domain"`
	Signal    string  `json:"signal"`
	Label     string  `json:"label"`
	Current   float64 `json:"current"`
	Baseline  float64 `json:"baseline"`
	StdDev    float64 `json:"std_dev"`
	ZScore    float64 `json:"z_score"`
	Severity  string  `json:"severity"`
	Direction string  `json:"direction"`
	Message   string  `json:"message"`
}

// DailySpend is one day-total bucket used by the daily anomaly detector.
type DailySpend struct {
	Day   time.Time
	Total float64
}

// WeeklyCategorySpend is one (category, week) bucket used by the
// per-category weekly anomaly detector.
type WeeklyCategorySpend struct {
	Category string
	Week     time.Time
	Total    float64
}

// MonthlySpend is one month-total bucket used by the projected-month
// anomaly detector.
type MonthlySpend struct {
	Month string // "YYYY-MM"
	Total float64
}

// ActiveGoal is one open planner goal used by the stalled-goal detector.
// DueDate may be nil if the goal has no deadline.
type ActiveGoal struct {
	Title     string
	DueDate   *time.Time
	UpdatedAt time.Time
}
