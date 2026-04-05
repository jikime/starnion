package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type StatisticsHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewStatisticsHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *StatisticsHandler {
	return &StatisticsHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/statistics?months=3
func (h *StatisticsHandler) GetStatistics(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	months, _ := strconv.Atoi(c.QueryParam("months"))
	if months < 1 || months > 24 {
		months = 3
	}
	since := time.Now().AddDate(0, -months, 0)
	ctx := c.Request().Context()

	// ── Monthly trend (income vs expense per month) ───────────────────────────
	trendRows, err := h.db.QueryContext(ctx, `
		SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
		       COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) AS expense
		FROM finances
		WHERE user_id = $1 AND created_at >= $2
		GROUP BY month ORDER BY month`, userID, since)
	var monthlyTrend []map[string]any
	if err == nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var month string
			var income, expense int64
			if trendRows.Scan(&month, &income, &expense) == nil {
				monthlyTrend = append(monthlyTrend, map[string]any{
					"month": month, "income": income, "expense": expense,
				})
			}
		}
	}
	if monthlyTrend == nil {
		monthlyTrend = []map[string]any{}
	}

	// ── Category breakdown ────────────────────────────────────────────────────
	catRows, err := h.db.QueryContext(ctx, `
		SELECT category,
		       ABS(SUM(amount)) AS amount,
		       COUNT(*) AS cnt
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category ORDER BY amount DESC LIMIT 10`, userID, since)
	type catItem struct {
		cat    string
		amount int64
		cnt    int
	}
	var catItems []catItem
	var totalCatAmt int64
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var ci catItem
			if catRows.Scan(&ci.cat, &ci.amount, &ci.cnt) == nil {
				catItems = append(catItems, ci)
				totalCatAmt += ci.amount
			}
		}
	}
	var categoryBreakdown []map[string]any
	for _, ci := range catItems {
		pct := 0.0
		if totalCatAmt > 0 {
			pct = float64(ci.amount) / float64(totalCatAmt) * 100
		}
		categoryBreakdown = append(categoryBreakdown, map[string]any{
			"category": ci.cat, "amount": ci.amount, "percent": pct, "count": ci.cnt,
		})
	}
	if categoryBreakdown == nil {
		categoryBreakdown = []map[string]any{}
	}

	// ── Weekday spending pattern (last 90 days) ───────────────────────────────
	wdRows, err := h.db.QueryContext(ctx, `
		SELECT EXTRACT(DOW FROM created_at)::int AS weekday,
		       ABS(SUM(amount)) AS total,
		       ABS(AVG(amount))::int AS avg,
		       COUNT(*) AS cnt
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= NOW() - INTERVAL '90 days'
		GROUP BY weekday ORDER BY weekday`, userID)
	var weekdaySpending []map[string]any
	if err == nil {
		defer wdRows.Close()
		for wdRows.Next() {
			var weekday, cnt int
			var total, avg int64
			if wdRows.Scan(&weekday, &total, &avg, &cnt) == nil {
				weekdaySpending = append(weekdaySpending, map[string]any{
					"weekday": weekday, "total": total, "avg": avg, "count": cnt,
				})
			}
		}
	}
	if weekdaySpending == nil {
		weekdaySpending = []map[string]any{}
	}

	// ── 90-day spending heatmap ───────────────────────────────────────────────
	hmRows, err := h.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS date, ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= NOW() - INTERVAL '90 days'
		GROUP BY date ORDER BY date`, userID)
	var heatmap []map[string]any
	if err == nil {
		defer hmRows.Close()
		for hmRows.Next() {
			var date time.Time
			var total int64
			if hmRows.Scan(&date, &total) == nil {
				heatmap = append(heatmap, map[string]any{
					"date": date.Format("2006-01-02"), "total": total,
				})
			}
		}
	}
	if heatmap == nil {
		heatmap = []map[string]any{}
	}

	// ── Summary stats ─────────────────────────────────────────────────────────
	var totalExpense int64
	var txCount int
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(ABS(SUM(amount)), 0), COUNT(*)
		 FROM finances WHERE user_id = $1 AND amount < 0 AND created_at >= $2`,
		userID, since,
	).Scan(&totalExpense, &txCount)

	// avg daily = total / days in period
	dayCount := time.Since(since).Hours() / 24
	var avgDaily int64
	if dayCount > 0 {
		avgDaily = int64(float64(totalExpense) / dayCount)
	}

	// Top category in period
	var topCategory string
	var topCategoryAmt int64
	h.db.QueryRowContext(ctx, `
		SELECT category, ABS(SUM(amount)) AS amt FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category ORDER BY amt DESC LIMIT 1`,
		userID, since,
	).Scan(&topCategory, &topCategoryAmt)

	// This month vs last month
	thisMonthStr := time.Now().Format("2006-01")
	lastMonthStr := time.Now().AddDate(0, -1, 0).Format("2006-01")
	var thisMonthExpense, lastMonthExpense int64
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(ABS(SUM(amount)), 0) FROM finances
		 WHERE user_id = $1 AND amount < 0 AND TO_CHAR(created_at, 'YYYY-MM') = $2`,
		userID, thisMonthStr,
	).Scan(&thisMonthExpense)
	h.db.QueryRowContext(ctx,
		`SELECT COALESCE(ABS(SUM(amount)), 0) FROM finances
		 WHERE user_id = $1 AND amount < 0 AND TO_CHAR(created_at, 'YYYY-MM') = $2`,
		userID, lastMonthStr,
	).Scan(&lastMonthExpense)

	var mom float64
	if lastMonthExpense > 0 {
		mom = float64(thisMonthExpense-lastMonthExpense) / float64(lastMonthExpense) * 100
	}

	// ── Conversation stats ────────────────────────────────────────────────────
	var totalMessages, thisMonthMessages, userMessages, convCount int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND created_at >= $2`, userID, since,
	).Scan(&convCount)
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND m.created_at >= $2`, userID, since,
	).Scan(&totalMessages)
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND m.role = 'user' AND m.created_at >= $2`, userID, since,
	).Scan(&userMessages)
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1
		   AND DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())`, userID,
	).Scan(&thisMonthMessages)

	return c.JSON(http.StatusOK, map[string]any{
		"period_months": months,
		"summary": map[string]any{
			"total_expense":      totalExpense,
			"avg_daily":          avgDaily,
			"tx_count":           txCount,
			"top_category":       topCategory,
			"top_category_amt":   topCategoryAmt,
			"this_month_expense": thisMonthExpense,
			"last_month_expense": lastMonthExpense,
			"mom":                mom,
		},
		"monthly_trend":      monthlyTrend,
		"category_breakdown": categoryBreakdown,
		"weekday_spending":   weekdaySpending,
		"heatmap":            heatmap,
		"conversation": map[string]any{
			"total_messages": totalMessages,
			"this_month":     thisMonthMessages,
			"user_messages":  userMessages,
			"conversations":  convCount,
		},
	})
}

// GET /api/v1/statistics/insights
// Reads AI pattern analysis from knowledge_base (key: pattern:analysis_result).
// Falls back to empty list if the scheduler hasn't run yet.
func (h *StatisticsHandler) GetInsights(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	var rawValue string
	err = h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base
		 WHERE user_id = $1 AND key = 'pattern:analysis_result'
		 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&rawValue)
	if err != nil {
		// No analysis yet
		return c.JSON(http.StatusOK, map[string]any{"insights": []string{}})
	}

	// {"patterns": [{"description": "한국어 설명", "type": "...", "category": "...", "confidence": 0.9}]}
	var parsed struct {
		Patterns []struct {
			Description string `json:"description"`
		} `json:"patterns"`
	}
	insights := []string{}
	if json.Unmarshal([]byte(rawValue), &parsed) == nil {
		for _, p := range parsed.Patterns {
			if p.Description != "" {
				insights = append(insights, p.Description)
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{"insights": insights})
}

// GET /api/v1/analytics
// Returns full analytics data: summary, daily_trend, hourly_dist, platforms, weekly_trend.
func (h *StatisticsHandler) GetAnalytics(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()
	now := time.Now()
	thisMonth := now.Format("2006-01")
	lastMonth := now.AddDate(0, -1, 0).Format("2006-01")

	// ── Summary ───────────────────────────────────────────────────────────────
	// Web chat messages (messages table via conversations, web platform only)
	var webTotal, webUser, webAI, webThisMonth, webLastMonth int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN m.role='user'      THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN m.role='assistant' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(m.created_at,'YYYY-MM')=$2 THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(m.created_at,'YYYY-MM')=$3 THEN 1 ELSE 0 END),0)
		 FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND c.platform = 'web'`, userID, thisMonth, lastMonth,
	).Scan(&webTotal, &webUser, &webAI, &webThisMonth, &webLastMonth)

	// Telegram messages (messages table via conversations, telegram platform)
	// + legacy chat_messages table for older sessions
	var tgTotal, tgUser, tgAI, tgThisMonth, tgLastMonth int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN role='user'      THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN role='assistant' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(ca,'YYYY-MM')=$2 THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(ca,'YYYY-MM')=$3 THEN 1 ELSE 0 END),0)
		 FROM (
		   SELECT m.role, m.created_at AS ca FROM messages m
		   JOIN conversations c ON c.id = m.conversation_id
		   WHERE c.user_id = $1 AND c.platform = 'telegram'
		   UNION ALL
		   SELECT role, created_at AS ca FROM chat_messages
		   WHERE user_id = $1
		 ) combined`, userID, thisMonth, lastMonth,
	).Scan(&tgTotal, &tgUser, &tgAI, &tgThisMonth, &tgLastMonth)

	totalMessages := webTotal + tgTotal
	userMessages := webUser + tgUser
	aiMessages := webAI + tgAI
	thisMonthTotal := webThisMonth + tgThisMonth
	lastMonthTotal := webLastMonth + tgLastMonth

	var mom float64
	if lastMonthTotal > 0 {
		mom = float64(thisMonthTotal-lastMonthTotal) / float64(lastMonthTotal) * 100
	}

	var totalConv, activeConv int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END),0)
		 FROM conversations WHERE user_id = $1`, userID,
	).Scan(&totalConv, &activeConv)

	avgPerDay := 0
	if totalMessages > 0 {
		avgPerDay = totalMessages / 30
	}

	// ── Daily trend (last 30 days, ASC) ─────────────────────────────────────
	dailyRows, err := h.db.QueryContext(ctx,
		`SELECT d::date AS day,
		        COALESCE(web.cnt, 0) + COALESCE(tg.cnt, 0) AS count
		 FROM generate_series(NOW()-INTERVAL '29 days', NOW(), INTERVAL '1 day') AS d
		 LEFT JOIN (
		   SELECT DATE(m.created_at) AS day, COUNT(*) AS cnt
		   FROM messages m JOIN conversations c ON c.id = m.conversation_id
		   WHERE c.user_id = $1 AND m.created_at >= NOW()-INTERVAL '30 days'
		   GROUP BY DATE(m.created_at)
		 ) web ON web.day = d::date
		 LEFT JOIN (
		   SELECT DATE(created_at) AS day, COUNT(*) AS cnt
		   FROM chat_messages WHERE user_id = $1 AND created_at >= NOW()-INTERVAL '30 days'
		   GROUP BY DATE(created_at)
		 ) tg ON tg.day = d::date
		 ORDER BY day ASC`, userID,
	)
	var dailyTrend []map[string]any
	if err == nil {
		defer dailyRows.Close()
		for dailyRows.Next() {
			var day time.Time
			var count int
			if dailyRows.Scan(&day, &count) == nil {
				dailyTrend = append(dailyTrend, map[string]any{
					"date":  day.Format("2006-01-02"),
					"count": count,
				})
			}
		}
	}
	if dailyTrend == nil {
		dailyTrend = []map[string]any{}
	}

	// ── Hourly distribution (last 30 days) ───────────────────────────────────
	hourlyRows, err := h.db.QueryContext(ctx,
		`SELECT h AS hour,
		        COALESCE(web.cnt, 0) + COALESCE(tg.cnt, 0) AS count
		 FROM generate_series(0, 23) AS h
		 LEFT JOIN (
		   SELECT EXTRACT(HOUR FROM m.created_at)::int AS hour, COUNT(*) AS cnt
		   FROM messages m JOIN conversations c ON c.id = m.conversation_id
		   WHERE c.user_id = $1 AND m.created_at >= NOW()-INTERVAL '30 days'
		   GROUP BY EXTRACT(HOUR FROM m.created_at)::int
		 ) web ON web.hour = h
		 LEFT JOIN (
		   SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS cnt
		   FROM chat_messages WHERE user_id = $1 AND created_at >= NOW()-INTERVAL '30 days'
		   GROUP BY EXTRACT(HOUR FROM created_at)::int
		 ) tg ON tg.hour = h
		 ORDER BY h`, userID,
	)
	var hourlyDist []map[string]any
	if err == nil {
		defer hourlyRows.Close()
		for hourlyRows.Next() {
			var hour, count int
			if hourlyRows.Scan(&hour, &count) == nil {
				hourlyDist = append(hourlyDist, map[string]any{
					"hour": hour, "count": count,
				})
			}
		}
	}
	if hourlyDist == nil {
		hourlyDist = []map[string]any{}
	}

	// ── Weekly trend (last 8 weeks, ASC) ─────────────────────────────────────
	weeklyRows, err := h.db.QueryContext(ctx,
		`SELECT TO_CHAR(DATE_TRUNC('week', d), 'MM/DD') AS week,
		        COALESCE(web.cnt, 0) + COALESCE(tg.cnt, 0) AS count
		 FROM generate_series(
		   DATE_TRUNC('week', NOW()-INTERVAL '7 weeks'),
		   DATE_TRUNC('week', NOW()),
		   INTERVAL '1 week'
		 ) AS d
		 LEFT JOIN (
		   SELECT DATE_TRUNC('week', m.created_at) AS wk, COUNT(*) AS cnt
		   FROM messages m JOIN conversations c ON c.id = m.conversation_id
		   WHERE c.user_id = $1 AND m.created_at >= NOW()-INTERVAL '8 weeks'
		   GROUP BY wk
		 ) web ON web.wk = DATE_TRUNC('week', d)
		 LEFT JOIN (
		   SELECT DATE_TRUNC('week', created_at) AS wk, COUNT(*) AS cnt
		   FROM chat_messages WHERE user_id = $1 AND created_at >= NOW()-INTERVAL '8 weeks'
		   GROUP BY wk
		 ) tg ON tg.wk = DATE_TRUNC('week', d)
		 ORDER BY d ASC`, userID,
	)
	var weeklyTrend []map[string]any
	if err == nil {
		defer weeklyRows.Close()
		for weeklyRows.Next() {
			var week string
			var count int
			if weeklyRows.Scan(&week, &count) == nil {
				weeklyTrend = append(weeklyTrend, map[string]any{
					"week": week, "count": count,
				})
			}
		}
	}
	if weeklyTrend == nil {
		weeklyTrend = []map[string]any{}
	}

	// ── Platform breakdown ────────────────────────────────────────────────────
	var webConvCount int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND platform = 'web'`, userID,
	).Scan(&webConvCount)

	var tgConvCount int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND platform = 'telegram'`, userID,
	).Scan(&tgConvCount)
	// Add legacy chat_sessions count
	var legacyTgCount int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT session_id) FROM chat_messages WHERE user_id = $1`, userID,
	).Scan(&legacyTgCount)
	tgConvCount += legacyTgCount

	platforms := []map[string]any{
		{"platform": "web", "messages": webTotal, "conversations": webConvCount},
		{"platform": "telegram", "messages": tgTotal, "conversations": tgConvCount},
	}

	return c.JSON(http.StatusOK, map[string]any{
		"summary": map[string]any{
			"total_messages":       totalMessages,
			"this_month":           thisMonthTotal,
			"user_messages":        userMessages,
			"ai_messages":          aiMessages,
			"total_conversations":  totalConv,
			"active_conversations": activeConv,
			"telegram_messages":    tgTotal,
			"webchat_messages":     webTotal,
			"avg_per_day":          avgPerDay,
			"mom":                  mom,
		},
		"daily_trend":  dailyTrend,
		"hourly_dist":  hourlyDist,
		"platforms":    platforms,
		"weekly_trend": weeklyTrend,
	})
}

// GET /api/v1/usage?days=30&page=1&limit=100
func (h *StatisticsHandler) GetUsage(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	days, _ := strconv.Atoi(c.QueryParam("days"))
	if days < 1 {
		days = 30
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 200 {
		limit = 100
	}
	offset := (page - 1) * limit
	since := time.Now().AddDate(0, 0, -days)
	ctx := c.Request().Context()

	// ── Summary ───────────────────────────────────────────────────────────────
	var totalReqs, successReqs int
	var totalInput, totalOutput, totalCached int64
	var totalCost float64
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		        COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cost_usd),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2`,
		userID, since,
	).Scan(&totalReqs, &successReqs, &totalInput, &totalOutput, &totalCached, &totalCost)

	summary := map[string]any{
		"total_requests":      totalReqs,
		"success_requests":    successReqs,
		"total_input_tokens":  totalInput,
		"total_output_tokens": totalOutput,
		"total_cached_tokens": totalCached,
		"total_cost_usd":      totalCost,
	}

	// ── Daily breakdown ───────────────────────────────────────────────────────
	dailyRows, dailyErr := h.db.QueryContext(ctx,
		`SELECT DATE(created_at) as date,
		        COUNT(*) as requests,
		        COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		        COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cost_usd),0),
		        COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 GROUP BY DATE(created_at) ORDER BY date ASC`,
		userID, since,
	)
	var daily []map[string]any
	if dailyErr == nil {
		defer dailyRows.Close()
		for dailyRows.Next() {
			var date string
			var reqs, inp, out, cached, succ, errCount int64
			var cost float64
			if dailyRows.Scan(&date, &reqs, &inp, &out, &cached, &cost, &succ, &errCount) == nil {
				daily = append(daily, map[string]any{
					"date":          date,
					"requests":      reqs,
					"input_tokens":  inp,
					"output_tokens": out,
					"cached_tokens": cached,
					"cost_usd":      cost,
					"success_count": succ,
					"error_count":   errCount,
				})
			}
		}
	}
	if daily == nil {
		daily = []map[string]any{}
	}

	// ── Model breakdown ───────────────────────────────────────────────────────
	modelRows, modelErr := h.db.QueryContext(ctx,
		`SELECT model, provider, COUNT(*) as count,
		        COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens+output_tokens),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 GROUP BY model, provider ORDER BY count DESC LIMIT 20`,
		userID, since,
	)
	var modelBreakdown []map[string]any
	if modelErr == nil {
		defer modelRows.Close()
		for modelRows.Next() {
			var model, provider string
			var count, tokens int64
			var cost float64
			if modelRows.Scan(&model, &provider, &count, &cost, &tokens) == nil {
				modelBreakdown = append(modelBreakdown, map[string]any{
					"model":    model,
					"provider": provider,
					"count":    count,
					"cost_usd": cost,
					"tokens":   tokens,
				})
			}
		}
	}
	if modelBreakdown == nil {
		modelBreakdown = []map[string]any{}
	}

	// ── Recent logs ───────────────────────────────────────────────────────────
	logRows, logErr := h.db.QueryContext(ctx,
		`SELECT id, model, provider, input_tokens, output_tokens, cached_tokens,
		        cost_usd, status, call_type, created_at
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
		userID, since, limit, offset,
	)
	var logs []map[string]any
	if logErr == nil {
		defer logRows.Close()
		for logRows.Next() {
			var id int64
			var model, provider, status, callType string
			var inp, out, cached int
			var cost float64
			var createdAt string
			if logRows.Scan(&id, &model, &provider, &inp, &out, &cached, &cost, &status, &callType, &createdAt) == nil {
				logs = append(logs, map[string]any{
					"id": id, "model": model, "provider": provider,
					"input_tokens": inp, "output_tokens": out, "cached_tokens": cached,
					"cost_usd": cost, "status": status, "call_type": callType,
					"created_at": createdAt,
				})
			}
		}
	}
	if logs == nil {
		logs = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM usage_logs WHERE user_id = $1 AND created_at >= $2`, userID, since,
	).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{
		"summary":         summary,
		"daily":           daily,
		"model_breakdown": modelBreakdown,
		"logs":            logs,
		"total":           total,
		"page":            page,
		"limit":           limit,
	})
}
