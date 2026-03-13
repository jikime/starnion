package handler

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// AnalyticsHandler exposes communication analytics endpoints.
type AnalyticsHandler struct {
	db *sql.DB
}

func NewAnalyticsHandler(db *sql.DB) *AnalyticsHandler {
	return &AnalyticsHandler{db: db}
}

// GET /api/v1/analytics?user_id=...
func (h *AnalyticsHandler) GetAnalytics(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	// ── 1. Summary ────────────────────────────────────────────────────────────
	type summaryStats struct {
		TotalMessages       int     `json:"total_messages"`
		ThisMonth           int     `json:"this_month"`
		UserMessages        int     `json:"user_messages"`
		AIMessages          int     `json:"ai_messages"`
		TotalConversations  int     `json:"total_conversations"`
		ActiveConversations int     `json:"active_conversations"`
		TelegramMessages    int     `json:"telegram_messages"`
		WebchatMessages     int     `json:"webchat_messages"`
		AvgPerDay           float64 `json:"avg_per_day"`
		MoM                 float64 `json:"mom"`
	}
	var summary summaryStats
	h.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE m.created_at >= date_trunc('month', NOW())),
			COUNT(*) FILTER (WHERE m.role = 'user'),
			COUNT(*) FILTER (WHERE m.role = 'assistant'),
			COUNT(DISTINCT m.conversation_id),
			COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.created_at >= date_trunc('month', NOW())),
			COUNT(*) FILTER (WHERE c.platform = 'telegram'),
			COUNT(*) FILTER (WHERE c.platform != 'telegram'),
			CASE WHEN 30 > 0 THEN ROUND(COUNT(*)::numeric / 30, 1) ELSE 0 END
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
	`, userID).Scan(
		&summary.TotalMessages, &summary.ThisMonth,
		&summary.UserMessages, &summary.AIMessages,
		&summary.TotalConversations, &summary.ActiveConversations,
		&summary.TelegramMessages, &summary.WebchatMessages,
		&summary.AvgPerDay,
	)

	// MoM: this month vs last month
	var thisM, lastM int
	h.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE m.created_at >= date_trunc('month', NOW())),
			COUNT(*) FILTER (WHERE date_trunc('month', m.created_at) = date_trunc('month', NOW()) - INTERVAL '1 month')
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
	`, userID).Scan(&thisM, &lastM)
	if lastM > 0 {
		summary.MoM = float64(thisM-lastM) / float64(lastM) * 100
	}

	// ── 2. Daily message trend (last 30 days) ─────────────────────────────────
	type dailyRow struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	dailyRows, err := h.db.QueryContext(ctx, `
		WITH days AS (
			SELECT generate_series(
				(NOW() - INTERVAL '29 days')::date,
				NOW()::date,
				'1 day'::interval
			)::date AS d
		)
		SELECT
			days.d::text AS date,
			COUNT(m.id) AS cnt
		FROM days
		LEFT JOIN messages m
			ON DATE(m.created_at AT TIME ZONE 'Asia/Seoul') = days.d
			AND m.conversation_id IN (
				SELECT id FROM conversations WHERE user_id = $1
			)
		GROUP BY days.d
		ORDER BY days.d
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("analytics: daily query failed")
	}
	var dailyTrend []dailyRow
	if dailyRows != nil {
		defer dailyRows.Close()
		for dailyRows.Next() {
			var r dailyRow
			if err := dailyRows.Scan(&r.Date, &r.Count); err == nil {
				dailyTrend = append(dailyTrend, r)
			}
		}
	}
	if dailyTrend == nil {
		dailyTrend = []dailyRow{}
	}

	// ── 3. Hourly distribution ────────────────────────────────────────────────
	type hourlyRow struct {
		Hour  int `json:"hour"`
		Count int `json:"count"`
	}
	hourlyRows, err := h.db.QueryContext(ctx, `
		SELECT
			EXTRACT(HOUR FROM m.created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
			COUNT(*) AS cnt
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
		  AND m.created_at >= NOW() - INTERVAL '30 days'
		GROUP BY hour
		ORDER BY hour
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("analytics: hourly query failed")
	}
	// Build full 24-hour array
	hourMap := map[int]int{}
	if hourlyRows != nil {
		defer hourlyRows.Close()
		for hourlyRows.Next() {
			var r hourlyRow
			if err := hourlyRows.Scan(&r.Hour, &r.Count); err == nil {
				hourMap[r.Hour] = r.Count
			}
		}
	}
	hourlyDist := make([]hourlyRow, 24)
	for i := 0; i < 24; i++ {
		hourlyDist[i] = hourlyRow{Hour: i, Count: hourMap[i]}
	}

	// ── 4. Platform breakdown ─────────────────────────────────────────────────
	type platformRow struct {
		Platform      string `json:"platform"`
		Messages      int    `json:"messages"`
		Conversations int    `json:"conversations"`
	}
	platRows, err := h.db.QueryContext(ctx, `
		SELECT
			c.platform,
			COUNT(m.id) AS messages,
			COUNT(DISTINCT c.id) AS conversations
		FROM conversations c
		LEFT JOIN messages m ON m.conversation_id = c.id
		WHERE c.user_id = $1
		GROUP BY c.platform
		ORDER BY messages DESC
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("analytics: platform query failed")
	}
	var platforms []platformRow
	if platRows != nil {
		defer platRows.Close()
		for platRows.Next() {
			var r platformRow
			if err := platRows.Scan(&r.Platform, &r.Messages, &r.Conversations); err == nil {
				platforms = append(platforms, r)
			}
		}
	}
	if platforms == nil {
		platforms = []platformRow{}
	}

	// ── 5. Weekly trend (last 8 weeks) ────────────────────────────────────────
	type weeklyRow struct {
		Week  string `json:"week"`
		Count int    `json:"count"`
	}
	weekRows, err := h.db.QueryContext(ctx, `
		WITH weeks AS (
			SELECT generate_series(
				date_trunc('week', NOW()) - INTERVAL '7 weeks',
				date_trunc('week', NOW()),
				'1 week'::interval
			) AS w
		)
		SELECT
			to_char(weeks.w, 'MM/DD') AS week,
			COUNT(m.id) AS cnt
		FROM weeks
		LEFT JOIN messages m
			ON date_trunc('week', m.created_at) = weeks.w
			AND m.conversation_id IN (
				SELECT id FROM conversations WHERE user_id = $1
			)
		GROUP BY weeks.w
		ORDER BY weeks.w
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("analytics: weekly query failed")
	}
	var weeklyTrend []weeklyRow
	if weekRows != nil {
		defer weekRows.Close()
		for weekRows.Next() {
			var r weeklyRow
			if err := weekRows.Scan(&r.Week, &r.Count); err == nil {
				weeklyTrend = append(weeklyTrend, r)
			}
		}
	}
	if weeklyTrend == nil {
		weeklyTrend = []weeklyRow{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"summary":      summary,
		"daily_trend":  dailyTrend,
		"hourly_dist":  hourlyDist,
		"platforms":    platforms,
		"weekly_trend": weeklyTrend,
	})
}
