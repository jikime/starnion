package entity

import "time"

// SavedSearch is one row in the `searches` table — a query/result pair
// the user chose to persist so they can look it up later from the UI.
type SavedSearch struct {
	ID        int64
	Query     string
	Result    string
	CreatedAt time.Time
}

// SearchHit is one row in the hybrid search response (FTS + vector
// search combined across planner diary and knowledge base).
type SearchHit struct {
	ID    string  `json:"id"`
	Type  string  `json:"type"` // "diary" | "knowledge"
	Title string  `json:"title"`
	Text  string  `json:"text"`
	Date  string  `json:"date"`
	Score float64 `json:"score"`
}
