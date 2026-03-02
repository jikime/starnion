package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
)

// budgetUser represents a user who has budget preferences configured.
type budgetUser struct {
	telegramID  string
	chatID      int64
	budgets     map[string]int // category -> monthly budget amount
	preferences map[string]any // full preferences JSONB
}

// getBudgetUsers returns users who have budget preferences set.
func getBudgetUsers(ctx context.Context, db *sql.DB) ([]budgetUser, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT telegram_id, preferences
		FROM profiles
		WHERE preferences->'budget' IS NOT NULL
		  AND jsonb_typeof(preferences->'budget') = 'object'
		  AND (preferences->'budget')::text != '{}'
	`)
	if err != nil {
		return nil, fmt.Errorf("query budget users: %w", err)
	}
	defer rows.Close()

	var users []budgetUser
	for rows.Next() {
		var telegramID string
		var prefsJSON []byte
		if err := rows.Scan(&telegramID, &prefsJSON); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}

		chatID, err := strconv.ParseInt(telegramID, 10, 64)
		if err != nil {
			log.Warn().Str("telegram_id", telegramID).Msg("invalid telegram_id in budget query")
			continue
		}

		var prefs map[string]any
		if err := json.Unmarshal(prefsJSON, &prefs); err != nil {
			log.Warn().Str("telegram_id", telegramID).Msg("invalid preferences JSON")
			continue
		}

		budgetRaw, ok := prefs["budget"]
		if !ok {
			continue
		}
		budgetMap, ok := budgetRaw.(map[string]any)
		if !ok {
			continue
		}

		budgets := make(map[string]int)
		for cat, val := range budgetMap {
			switch v := val.(type) {
			case float64:
				budgets[cat] = int(v)
			case json.Number:
				n, _ := v.Int64()
				budgets[cat] = int(n)
			}
		}

		if len(budgets) == 0 {
			continue
		}

		users = append(users, budgetUser{
			telegramID:  telegramID,
			chatID:      chatID,
			budgets:     budgets,
			preferences: prefs,
		})
	}

	return users, rows.Err()
}

// getCategorySpending returns this month's spending by category for a user.
func getCategorySpending(ctx context.Context, db *sql.DB, telegramID string) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT category, COALESCE(SUM(amount), 0) AS total
		FROM finances
		WHERE user_id = $1
		  AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul')
		GROUP BY category
	`, telegramID)
	if err != nil {
		return nil, fmt.Errorf("query category spending: %w", err)
	}
	defer rows.Close()

	spending := make(map[string]int)
	for rows.Next() {
		var category string
		var total int
		if err := rows.Scan(&category, &total); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		spending[category] = total
	}

	return spending, rows.Err()
}

// getUsersWithRecordsToday returns users with finance records today (KST).
func getUsersWithRecordsToday(ctx context.Context, db *sql.DB) ([]activeUser, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT f.user_id
		FROM finances f
		WHERE f.created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Seoul')
		  AND f.created_at < ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')
	`)
	if err != nil {
		return nil, fmt.Errorf("query users with records today: %w", err)
	}
	defer rows.Close()

	return scanActiveUsers(rows)
}

// getInactiveUsers returns users with historical records but no activity in the last 3 days.
func getInactiveUsers(ctx context.Context, db *sql.DB) ([]activeUser, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT p.telegram_id
		FROM profiles p
		WHERE EXISTS (
			SELECT 1 FROM finances f WHERE f.user_id = p.telegram_id
		)
		AND NOT EXISTS (
			SELECT 1 FROM finances f
			WHERE f.user_id = p.telegram_id
			  AND f.created_at >= NOW() - INTERVAL '3 days'
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("query inactive users: %w", err)
	}
	defer rows.Close()

	return scanActiveUsers(rows)
}

// getUsersWithRecordsThisMonth returns users with finance records this month.
func getUsersWithRecordsThisMonth(ctx context.Context, db *sql.DB) ([]activeUser, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT f.user_id
		FROM finances f
		WHERE f.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Seoul')
	`)
	if err != nil {
		return nil, fmt.Errorf("query users with records this month: %w", err)
	}
	defer rows.Close()

	return scanActiveUsers(rows)
}

// getUserPreferences returns the preferences JSONB for a user.
func getUserPreferences(ctx context.Context, db *sql.DB, telegramID string) (map[string]any, error) {
	var prefsJSON sql.NullString
	err := db.QueryRowContext(ctx,
		`SELECT preferences FROM profiles WHERE telegram_id = $1`,
		telegramID,
	).Scan(&prefsJSON)
	if err != nil {
		return nil, fmt.Errorf("query preferences: %w", err)
	}

	if !prefsJSON.Valid || prefsJSON.String == "" {
		return map[string]any{}, nil
	}

	var prefs map[string]any
	if err := json.Unmarshal([]byte(prefsJSON.String), &prefs); err != nil {
		return map[string]any{}, nil
	}

	return prefs, nil
}

// isLastDayOfMonth checks if today (in the given timezone) is the last day of the month.
func isLastDayOfMonth(loc *time.Location) bool {
	now := time.Now().In(loc)
	tomorrow := now.AddDate(0, 0, 1)
	return now.Month() != tomorrow.Month()
}

// spendingStats holds today's total and 30-day average for anomaly detection.
type spendingStats struct {
	todayTotal   int
	dailyAvg     int
	daysWithData int
}

// getDailySpendingStats returns today's total spending and the 30-day daily average.
func getDailySpendingStats(ctx context.Context, db *sql.DB, telegramID string) (*spendingStats, error) {
	var stats spendingStats

	// Today's total spending.
	err := db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0)
		FROM finances
		WHERE user_id = $1
		  AND created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Seoul')
		  AND created_at < ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Seoul')
	`, telegramID).Scan(&stats.todayTotal)
	if err != nil {
		return nil, fmt.Errorf("query today spending: %w", err)
	}

	// 30-day daily average (excluding today).
	err = db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(daily_total)::int, 0), COUNT(*)
		FROM (
			SELECT DATE(created_at AT TIME ZONE 'Asia/Seoul') AS day,
			       SUM(amount) AS daily_total
			FROM finances
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '30 days'
			  AND created_at < (CURRENT_DATE AT TIME ZONE 'Asia/Seoul')
			GROUP BY day
		) daily_totals
	`, telegramID).Scan(&stats.dailyAvg, &stats.daysWithData)
	if err != nil {
		return nil, fmt.Errorf("query daily average: %w", err)
	}

	return &stats, nil
}

// getStoredPatterns reads the latest pattern analysis result from knowledge_base.
func getStoredPatterns(ctx context.Context, db *sql.DB, telegramID string) (string, error) {
	var value sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT value
		FROM knowledge_base
		WHERE user_id = $1 AND key = 'pattern:analysis_result'
		ORDER BY created_at DESC
		LIMIT 1
	`, telegramID).Scan(&value)
	if err == sql.ErrNoRows || !value.Valid {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("query patterns: %w", err)
	}
	return value.String, nil
}

// getUsersWithGoals returns users with active goals in knowledge_base.
func getUsersWithGoals(ctx context.Context, db *sql.DB) ([]activeUser, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT kb.user_id
		FROM knowledge_base kb
		WHERE kb.key LIKE 'goal:%'
		  AND kb.value::jsonb->>'status' = 'active'
	`)
	if err != nil {
		return nil, fmt.Errorf("query users with goals: %w", err)
	}
	defer rows.Close()

	return scanActiveUsers(rows)
}

// scanActiveUsers is a helper to scan telegram_id rows into activeUser slices.
func scanActiveUsers(rows *sql.Rows) ([]activeUser, error) {
	var users []activeUser
	for rows.Next() {
		var telegramID string
		if err := rows.Scan(&telegramID); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}

		chatID, err := strconv.ParseInt(telegramID, 10, 64)
		if err != nil {
			log.Warn().Str("telegram_id", telegramID).Msg("invalid telegram_id, skipping")
			continue
		}

		users = append(users, activeUser{
			telegramID: telegramID,
			chatID:     chatID,
		})
	}
	return users, rows.Err()
}
