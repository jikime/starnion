package scheduler

import (
	"encoding/json"
	"strings"
	"time"
)

// patternAnalysis represents the stored pattern analysis result from knowledge_base.
type patternAnalysis struct {
	Patterns []pattern `json:"patterns"`
}

// pattern represents a single detected spending/behavior pattern.
type pattern struct {
	Type        string         `json:"type"`
	Description string         `json:"description"`
	Trigger     patternTrigger `json:"trigger"`
	Category    string         `json:"category,omitempty"`
	Confidence  float64        `json:"confidence"`
}

// patternTrigger defines when a pattern-based notification should fire.
type patternTrigger struct {
	DayOfWeek      string `json:"day_of_week,omitempty"`
	DayOfMonthFrom int    `json:"day_of_month_from,omitempty"`
	DayOfMonthTo   int    `json:"day_of_month_to,omitempty"`
	Always         bool   `json:"always,omitempty"`
}

// parseDayOfWeek converts a lowercase English day name to time.Weekday.
func parseDayOfWeek(day string) (time.Weekday, bool) {
	switch strings.ToLower(day) {
	case "sunday":
		return time.Sunday, true
	case "monday":
		return time.Monday, true
	case "tuesday":
		return time.Tuesday, true
	case "wednesday":
		return time.Wednesday, true
	case "thursday":
		return time.Thursday, true
	case "friday":
		return time.Friday, true
	case "saturday":
		return time.Saturday, true
	default:
		return 0, false
	}
}

// shouldTrigger checks if a pattern's trigger condition matches the given time.
func (t patternTrigger) shouldTrigger(now time.Time) bool {
	if t.Always {
		return true
	}

	if t.DayOfWeek != "" {
		wd, ok := parseDayOfWeek(t.DayOfWeek)
		if ok && now.Weekday() == wd {
			return true
		}
	}

	if t.DayOfMonthFrom > 0 && t.DayOfMonthTo > 0 {
		day := now.Day()
		if day >= t.DayOfMonthFrom && day <= t.DayOfMonthTo {
			return true
		}
	}

	return false
}

// parsePatterns parses the pattern analysis JSON string from knowledge_base.
func parsePatterns(value string) (*patternAnalysis, error) {
	var analysis patternAnalysis
	if err := json.Unmarshal([]byte(value), &analysis); err != nil {
		return nil, err
	}
	return &analysis, nil
}

// triggeredPatterns returns patterns whose trigger conditions match the given time
// and whose confidence meets the minimum threshold.
func triggeredPatterns(analysis *patternAnalysis, now time.Time) []pattern {
	var result []pattern
	for _, p := range analysis.Patterns {
		if p.Confidence >= 0.6 && p.Trigger.shouldTrigger(now) {
			result = append(result, p)
		}
	}
	return result
}
