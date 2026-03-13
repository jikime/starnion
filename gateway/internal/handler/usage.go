package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// UsageHandler exposes LLM usage log endpoints.
type UsageHandler struct {
	db *sql.DB
}

func NewUsageHandler(db *sql.DB) *UsageHandler {
	return &UsageHandler{db: db}
}

// GET /api/v1/usage?user_id=...&days=30&page=1&limit=50
func (h *UsageHandler) GetUsage(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	days, _ := strconv.Atoi(c.QueryParam("days"))
	if days <= 0 {
		days = 30
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	ctx := c.Request().Context()

	// ── 1. Summary KPIs ───────────────────────────────────────────────────
	type summary struct {
		TotalRequests     int     `json:"total_requests"`
		SuccessRequests   int     `json:"success_requests"`
		TotalInputTokens  int64   `json:"total_input_tokens"`
		TotalOutputTokens int64   `json:"total_output_tokens"`
		TotalCachedTokens int64   `json:"total_cached_tokens"`
		TotalCostUSD      float64 `json:"total_cost_usd"`
	}
	var sum summary
	h.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'success'),
			COALESCE(SUM(input_tokens),  0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(SUM(cost_usd),      0)
		FROM usage_logs
		WHERE user_id = $1
		  AND created_at >= NOW() - ($2 || ' days')::interval
	`, userID, days).Scan(
		&sum.TotalRequests, &sum.SuccessRequests,
		&sum.TotalInputTokens, &sum.TotalOutputTokens, &sum.TotalCachedTokens,
		&sum.TotalCostUSD,
	)

	// ── 2. Daily aggregates (last N days) ─────────────────────────────────
	type dailyRow struct {
		Date         string  `json:"date"`
		Requests     int     `json:"requests"`
		InputTokens  int64   `json:"input_tokens"`
		OutputTokens int64   `json:"output_tokens"`
		CachedTokens int64   `json:"cached_tokens"`
		CostUSD      float64 `json:"cost_usd"`
		SuccessCount int     `json:"success_count"`
		ErrorCount   int     `json:"error_count"`
	}
	dailyRows, err := h.db.QueryContext(ctx, `
		WITH days AS (
			SELECT generate_series(
				(NOW() - ($2 || ' days')::interval)::date,
				NOW()::date,
				'1 day'::interval
			)::date AS d
		)
		SELECT
			days.d::text,
			COALESCE(COUNT(u.id), 0),
			COALESCE(SUM(u.input_tokens),  0),
			COALESCE(SUM(u.output_tokens), 0),
			COALESCE(SUM(u.cached_tokens), 0),
			COALESCE(SUM(u.cost_usd),      0),
			COALESCE(COUNT(u.id) FILTER (WHERE u.status = 'success'), 0),
			COALESCE(COUNT(u.id) FILTER (WHERE u.status = 'error'),   0)
		FROM days
		LEFT JOIN usage_logs u
			ON DATE(u.created_at AT TIME ZONE 'Asia/Seoul') = days.d
			AND u.user_id = $1
		GROUP BY days.d
		ORDER BY days.d
	`, userID, days)
	if err != nil {
		log.Error().Err(err).Msg("usage: daily query failed")
	}
	var daily []dailyRow
	if dailyRows != nil {
		defer dailyRows.Close()
		for dailyRows.Next() {
			var r dailyRow
			if err := dailyRows.Scan(
				&r.Date, &r.Requests,
				&r.InputTokens, &r.OutputTokens, &r.CachedTokens,
				&r.CostUSD, &r.SuccessCount, &r.ErrorCount,
			); err == nil {
				daily = append(daily, r)
			}
		}
	}
	if daily == nil {
		daily = []dailyRow{}
	}

	// ── 3. Model breakdown ────────────────────────────────────────────────
	type modelRow struct {
		Model    string  `json:"model"`
		Provider string  `json:"provider"`
		Count    int     `json:"count"`
		CostUSD  float64 `json:"cost_usd"`
		Tokens   int64   `json:"tokens"`
	}
	modelRows, err := h.db.QueryContext(ctx, `
		SELECT
			model, provider,
			COUNT(*),
			COALESCE(SUM(cost_usd), 0),
			COALESCE(SUM(input_tokens + output_tokens), 0)
		FROM usage_logs
		WHERE user_id = $1
		  AND created_at >= NOW() - ($2 || ' days')::interval
		GROUP BY model, provider
		ORDER BY SUM(cost_usd) DESC
	`, userID, days)
	if err != nil {
		log.Error().Err(err).Msg("usage: model breakdown query failed")
	}
	var models []modelRow
	if modelRows != nil {
		defer modelRows.Close()
		for modelRows.Next() {
			var r modelRow
			if err := modelRows.Scan(&r.Model, &r.Provider, &r.Count, &r.CostUSD, &r.Tokens); err == nil {
				models = append(models, r)
			}
		}
	}
	if models == nil {
		models = []modelRow{}
	}

	// ── 4. Log list (paginated) ────────────────────────────────────────────
	type logRow struct {
		ID           int64   `json:"id"`
		Model        string  `json:"model"`
		Provider     string  `json:"provider"`
		InputTokens  int     `json:"input_tokens"`
		OutputTokens int     `json:"output_tokens"`
		CachedTokens int     `json:"cached_tokens"`
		CostUSD      float64 `json:"cost_usd"`
		Status       string  `json:"status"`
		CallType     string  `json:"call_type"`
		CreatedAt    string  `json:"created_at"`
	}
	var total int
	h.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM usage_logs
		WHERE user_id = $1
		  AND created_at >= NOW() - ($2 || ' days')::interval
	`, userID, days).Scan(&total)

	logRows, err := h.db.QueryContext(ctx, `
		SELECT
			id, model, provider,
			input_tokens, output_tokens, cached_tokens,
			cost_usd, status, call_type,
			to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS')
		FROM usage_logs
		WHERE user_id = $1
		  AND created_at >= NOW() - ($2 || ' days')::interval
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`, userID, days, limit, offset)
	if err != nil {
		log.Error().Err(err).Msg("usage: log list query failed")
	}
	var logs []logRow
	if logRows != nil {
		defer logRows.Close()
		for logRows.Next() {
			var r logRow
			if err := logRows.Scan(
				&r.ID, &r.Model, &r.Provider,
				&r.InputTokens, &r.OutputTokens, &r.CachedTokens,
				&r.CostUSD, &r.Status, &r.CallType,
				&r.CreatedAt,
			); err == nil {
				logs = append(logs, r)
			}
		}
	}
	if logs == nil {
		logs = []logRow{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"summary":         sum,
		"daily":           daily,
		"model_breakdown": models,
		"logs":            logs,
		"total":           total,
		"page":            page,
		"limit":           limit,
	})
}
