package handler

import (
	"database/sql"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// StatisticsHandler exposes analytics endpoints.
type StatisticsHandler struct {
	db *sql.DB
}

func NewStatisticsHandler(db *sql.DB) *StatisticsHandler {
	return &StatisticsHandler{db: db}
}

// GET /api/v1/statistics?user_id=...&months=6
func (h *StatisticsHandler) GetStatistics(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	months := 6
	if m := c.QueryParam("months"); m != "" {
		switch m {
		case "1":
			months = 1
		case "3":
			months = 3
		case "12":
			months = 12
		default:
			months = 6
		}
	}

	ctx := c.Request().Context()

	// ── 1. Monthly income/expense trend ──────────────────────────────────────
	type monthlyTrendRow struct {
		Month   string `json:"month"`
		Income  int    `json:"income"`
		Expense int    `json:"expense"`
	}
	trendRows, err := h.db.QueryContext(ctx, `
		WITH months AS (
			SELECT generate_series(
				date_trunc('month', NOW()) - (($2 - 1) || ' months')::interval,
				date_trunc('month', NOW()),
				'1 month'::interval
			) AS m
		)
		SELECT
			to_char(months.m, 'YYYY-MM') AS month,
			COALESCE(SUM(CASE WHEN f.amount > 0 THEN f.amount ELSE 0 END), 0) AS income,
			COALESCE(SUM(CASE WHEN f.amount < 0 THEN ABS(f.amount) ELSE 0 END), 0) AS expense
		FROM months
		LEFT JOIN finances f
			ON f.user_id = $1
			AND date_trunc('month', f.created_at) = months.m
		GROUP BY months.m
		ORDER BY months.m
	`, userID, months)
	if err != nil {
		log.Error().Err(err).Msg("statistics: trend query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer trendRows.Close()
	var monthlyTrend []monthlyTrendRow
	for trendRows.Next() {
		var r monthlyTrendRow
		if err := trendRows.Scan(&r.Month, &r.Income, &r.Expense); err == nil {
			monthlyTrend = append(monthlyTrend, r)
		}
	}
	if monthlyTrend == nil {
		monthlyTrend = []monthlyTrendRow{}
	}

	// ── 2. Category breakdown for selected period ─────────────────────────────
	type categoryRow struct {
		Category string  `json:"category"`
		Amount   int     `json:"amount"`
		Percent  float64 `json:"percent"`
		Count    int     `json:"count"`
	}
	catRows, err := h.db.QueryContext(ctx, `
		WITH totals AS (
			SELECT COALESCE(SUM(ABS(amount)), 0) AS grand_total
			FROM finances
			WHERE user_id = $1
			  AND amount < 0
			  AND created_at >= date_trunc('month', NOW()) - (($2 - 1) || ' months')::interval
		)
		SELECT
			f.category,
			COALESCE(SUM(ABS(f.amount)), 0) AS amount,
			CASE WHEN t.grand_total > 0
				THEN ROUND(SUM(ABS(f.amount))::numeric / t.grand_total * 100, 1)
				ELSE 0
			END AS percent,
			COUNT(*) AS cnt
		FROM finances f, totals t
		WHERE f.user_id = $1
		  AND f.amount < 0
		  AND f.created_at >= date_trunc('month', NOW()) - (($2 - 1) || ' months')::interval
		GROUP BY f.category, t.grand_total
		ORDER BY amount DESC
	`, userID, months)
	if err != nil {
		log.Error().Err(err).Msg("statistics: category query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer catRows.Close()
	var categoryBreakdown []categoryRow
	for catRows.Next() {
		var r categoryRow
		if err := catRows.Scan(&r.Category, &r.Amount, &r.Percent, &r.Count); err == nil {
			categoryBreakdown = append(categoryBreakdown, r)
		}
	}
	if categoryBreakdown == nil {
		categoryBreakdown = []categoryRow{}
	}

	// ── 3. Weekday spending (0=Sun … 6=Sat) ──────────────────────────────────
	type weekdayRow struct {
		Weekday int     `json:"weekday"`
		Total   int     `json:"total"`
		Avg     float64 `json:"avg"`
		Count   int     `json:"count"`
	}
	wdRows, err := h.db.QueryContext(ctx, `
		SELECT
			EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS weekday,
			COALESCE(SUM(ABS(amount)), 0) AS total,
			ROUND(AVG(ABS(amount))::numeric, 0) AS avg,
			COUNT(*) AS cnt
		FROM finances
		WHERE user_id = $1
		  AND amount < 0
		  AND created_at >= NOW() - ($2 * INTERVAL '30 days')
		GROUP BY weekday
		ORDER BY weekday
	`, userID, months)
	if err != nil {
		log.Error().Err(err).Msg("statistics: weekday query failed")
	}
	var weekdaySpending []weekdayRow
	if wdRows != nil {
		defer wdRows.Close()
		for wdRows.Next() {
			var r weekdayRow
			if err := wdRows.Scan(&r.Weekday, &r.Total, &r.Avg, &r.Count); err == nil {
				weekdaySpending = append(weekdaySpending, r)
			}
		}
	}
	if weekdaySpending == nil {
		weekdaySpending = []weekdayRow{}
	}

	// ── 4. Daily heatmap (last 90 days) ──────────────────────────────────────
	type heatmapRow struct {
		Date  string `json:"date"`
		Total int    `json:"total"`
	}
	hmRows, err := h.db.QueryContext(ctx, `
		SELECT
			DATE(created_at AT TIME ZONE 'Asia/Seoul')::text AS day,
			COALESCE(SUM(ABS(amount)), 0) AS total
		FROM finances
		WHERE user_id = $1
		  AND amount < 0
		  AND created_at >= NOW() - INTERVAL '90 days'
		GROUP BY day
		ORDER BY day
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("statistics: heatmap query failed")
	}
	var heatmap []heatmapRow
	if hmRows != nil {
		defer hmRows.Close()
		for hmRows.Next() {
			var r heatmapRow
			if err := hmRows.Scan(&r.Date, &r.Total); err == nil {
				heatmap = append(heatmap, r)
			}
		}
	}
	if heatmap == nil {
		heatmap = []heatmapRow{}
	}

	// ── 5. Summary stats ──────────────────────────────────────────────────────
	type summaryStats struct {
		TotalExpense    int     `json:"total_expense"`
		AvgDaily        float64 `json:"avg_daily"`
		TxCount         int     `json:"tx_count"`
		TopCategory     string  `json:"top_category"`
		TopCategoryAmt  int     `json:"top_category_amt"`
		ThisMonthExpense int    `json:"this_month_expense"`
		LastMonthExpense int    `json:"last_month_expense"`
		MoM             float64 `json:"mom"` // month-over-month %
	}
	var summary summaryStats
	h.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(ABS(amount)), 0),
			CASE WHEN $2 * 30 > 0 THEN ROUND(SUM(ABS(amount))::numeric / ($2 * 30), 0) ELSE 0 END,
			COUNT(*)
		FROM finances
		WHERE user_id = $1
		  AND amount < 0
		  AND created_at >= date_trunc('month', NOW()) - (($2 - 1) || ' months')::interval
	`, userID, months).Scan(&summary.TotalExpense, &summary.AvgDaily, &summary.TxCount)

	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount)), 0)
		FROM finances WHERE user_id = $1 AND amount < 0
		  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
		  AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
	`, userID).Scan(&summary.ThisMonthExpense)

	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount)), 0)
		FROM finances WHERE user_id = $1 AND amount < 0
		  AND date_trunc('month', created_at) = date_trunc('month', NOW()) - INTERVAL '1 month'
	`, userID).Scan(&summary.LastMonthExpense)

	if summary.LastMonthExpense > 0 {
		summary.MoM = float64(summary.ThisMonthExpense-summary.LastMonthExpense) /
			float64(summary.LastMonthExpense) * 100
	}
	if len(categoryBreakdown) > 0 {
		summary.TopCategory = categoryBreakdown[0].Category
		summary.TopCategoryAmt = categoryBreakdown[0].Amount
	}

	// ── 6. Conversation stats ─────────────────────────────────────────────────
	type convStats struct {
		TotalMessages  int `json:"total_messages"`
		ThisMonth      int `json:"this_month"`
		UserMessages   int `json:"user_messages"`
		Conversations  int `json:"conversations"`
	}
	var conv convStats
	h.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE m.created_at >= date_trunc('month', NOW())),
			COUNT(*) FILTER (WHERE m.role = 'user'),
			COUNT(DISTINCT m.conversation_id)
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
	`, userID).Scan(&conv.TotalMessages, &conv.ThisMonth, &conv.UserMessages, &conv.Conversations)

	return c.JSON(http.StatusOK, map[string]any{
		"summary":            summary,
		"monthly_trend":      monthlyTrend,
		"category_breakdown": categoryBreakdown,
		"weekday_spending":   weekdaySpending,
		"heatmap":            heatmap,
		"conversation":       conv,
	})
}

// GET /api/v1/statistics/insights?user_id=...
// Generates simple rule-based insights from spending patterns.
func (h *StatisticsHandler) GetInsights(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	ctx := c.Request().Context()
	var insights []string

	// Insight 1: Category MoM change
	rows, err := h.db.QueryContext(ctx, `
		SELECT category,
			SUM(ABS(amount)) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW())) AS this_m,
			SUM(ABS(amount)) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()) - INTERVAL '1 month') AS last_m
		FROM finances
		WHERE user_id = $1 AND amount < 0
		  AND created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
		GROUP BY category
		HAVING SUM(ABS(amount)) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()) - INTERVAL '1 month') > 0
		ORDER BY (
			SUM(ABS(amount)) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()))::float /
			NULLIF(SUM(ABS(amount)) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()) - INTERVAL '1 month'), 0)
		) DESC
		LIMIT 3
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var thisM, lastM sql.NullInt64
			if err := rows.Scan(&cat, &thisM, &lastM); err == nil && lastM.Valid && lastM.Int64 > 0 && thisM.Valid {
				pct := float64(thisM.Int64-lastM.Int64) / float64(lastM.Int64) * 100
				if pct > 20 {
					insights = append(insights, cat+" 지출이 전월 대비 "+formatPct(pct)+" 증가했어요")
				} else if pct < -20 {
					insights = append(insights, cat+" 지출이 전월 대비 "+formatPct(-pct)+" 감소했어요 👍")
				}
			}
		}
	}

	// Insight 2: Top weekday
	var topDay int
	var topDayTotal int
	h.db.QueryRowContext(ctx, `
		SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Seoul')::int, SUM(ABS(amount))
		FROM finances
		WHERE user_id = $1 AND amount < 0
		  AND created_at >= NOW() - INTERVAL '30 days'
		GROUP BY 1 ORDER BY 2 DESC LIMIT 1
	`, userID).Scan(&topDay, &topDayTotal)
	if topDayTotal > 0 {
		days := []string{"일", "월", "화", "수", "목", "금", "토"}
		if topDay >= 0 && topDay < 7 {
			insights = append(insights, days[topDay]+"요일 지출이 가장 많아요 (이번달 "+formatWon(topDayTotal)+")")
		}
	}

	// Insight 3: Budget exceeded category
	var overCat string
	var overAmt, overBudget int
	err = h.db.QueryRowContext(ctx, `
		WITH spent AS (
			SELECT category, SUM(ABS(amount)) AS total
			FROM finances
			WHERE user_id = $1 AND amount < 0
			  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
			  AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
			GROUP BY category
		),
		budget AS (
			SELECT key AS category, value::int AS limit
			FROM profiles, jsonb_each_text(COALESCE(preferences->'budget', '{}'::jsonb))
			WHERE uuid_id = $1
		)
		SELECT s.category, s.total, b.limit
		FROM spent s JOIN budget b ON s.category = b.category
		WHERE s.total > b.limit
		ORDER BY (s.total - b.limit) DESC LIMIT 1
	`, userID).Scan(&overCat, &overAmt, &overBudget)
	if err == nil && overCat != "" {
		insights = append(insights, overCat+" 예산 "+formatWon(overBudget)+"을 "+formatWon(overAmt-overBudget)+" 초과했어요 ⚠️")
	}

	// Insight 4: Subscription total
	var subTotal int
	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		WHERE user_id = $1 AND category = '구독' AND amount < 0
		  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
		  AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
	`, userID).Scan(&subTotal)
	if subTotal > 0 {
		insights = append(insights, "이번달 구독 서비스에 "+formatWon(subTotal)+"을 지출하고 있어요")
	}

	if len(insights) == 0 {
		insights = []string{"아직 충분한 지출 데이터가 없어요. 더 기록하면 인사이트를 드릴게요!"}
	}

	return c.JSON(http.StatusOK, map[string]any{"insights": insights})
}

func formatPct(f float64) string {
	if f >= 100 {
		return fmt.Sprintf("%.0f%%", f)
	}
	return fmt.Sprintf("%.1f%%", f)
}

func formatWon(n int) string {
	if n >= 10000 {
		return fmt.Sprintf("%.0f만원", float64(n)/10000)
	}
	return fmt.Sprintf("%d원", n)
}
