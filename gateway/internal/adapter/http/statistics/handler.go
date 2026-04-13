// Package statistics hosts the HTTP adapter for the statistics /
// analytics / usage read endpoints. Eleventh handler sub-package to
// migrate out of internal/adapter/handler.
package statistics

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain/entity"
	statisticsusecase "github.com/newstarnion/gateway/internal/usecase/statistics"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *statisticsusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *statisticsusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/statistics", h.getStatistics)
	protected.GET("/statistics/insights", h.getInsights)
	protected.GET("/analytics", h.getAnalytics)
	protected.GET("/usage", h.getUsage)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── /statistics ─────────────────────────────────────────────────────

func (h *Handler) getStatistics(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	months, _ := strconv.Atoi(c.QueryParam("months"))
	report := h.uc.GetStatistics(c.Request().Context(), userID, months)

	monthlyTrend := make([]map[string]any, 0, len(report.MonthlyTrend))
	for _, t := range report.MonthlyTrend {
		monthlyTrend = append(monthlyTrend, map[string]any{
			"month":   t.Month,
			"income":  t.Income,
			"expense": t.Expense,
		})
	}
	catBreakdown := make([]map[string]any, 0, len(report.CategoryBreakdown))
	for _, c := range report.CategoryBreakdown {
		catBreakdown = append(catBreakdown, map[string]any{
			"category": c.Category,
			"amount":   c.Amount,
			"percent":  c.Percent,
			"count":    c.Count,
		})
	}
	weekday := make([]map[string]any, 0, len(report.WeekdaySpending))
	for _, w := range report.WeekdaySpending {
		weekday = append(weekday, map[string]any{
			"weekday": w.Weekday,
			"total":   w.Total,
			"avg":     w.Avg,
			"count":   w.Count,
		})
	}
	heatmap := make([]map[string]any, 0, len(report.Heatmap))
	for _, h := range report.Heatmap {
		heatmap = append(heatmap, map[string]any{
			"date":  h.Date.Format("2006-01-02"),
			"total": h.Total,
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"period_months": report.PeriodMonths,
		"summary": map[string]any{
			"total_expense":      report.Summary.TotalExpense,
			"avg_daily":          report.Summary.AvgDaily,
			"tx_count":           report.Summary.TxCount,
			"top_category":       report.Summary.TopCategory,
			"top_category_amt":   report.Summary.TopCategoryAmt,
			"this_month_expense": report.Summary.ThisMonthExpense,
			"last_month_expense": report.Summary.LastMonthExpense,
			"mom":                report.Summary.MoM,
		},
		"monthly_trend":      monthlyTrend,
		"category_breakdown": catBreakdown,
		"weekday_spending":   weekday,
		"heatmap":            heatmap,
		"conversation": map[string]any{
			"total_messages": report.Conversation.TotalMessages,
			"this_month":     report.Conversation.ThisMonthMessages,
			"user_messages":  report.Conversation.UserMessages,
			"conversations":  report.Conversation.ConvCount,
		},
	})
}

// ── /statistics/insights ────────────────────────────────────────────

func (h *Handler) getInsights(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	return c.JSON(http.StatusOK, map[string]any{
		"insights": h.uc.GetInsights(c.Request().Context(), userID),
	})
}

// ── /analytics ──────────────────────────────────────────────────────

func (h *Handler) getAnalytics(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	report := h.uc.GetAnalytics(c.Request().Context(), userID)

	daily := toDailyJSON(report.DailyTrend)
	hourly := make([]map[string]any, 0, len(report.HourlyDist))
	for _, h := range report.HourlyDist {
		hourly = append(hourly, map[string]any{"hour": h.Hour, "count": h.Count})
	}
	weekly := make([]map[string]any, 0, len(report.WeeklyTrend))
	for _, w := range report.WeeklyTrend {
		weekly = append(weekly, map[string]any{"week": w.Week, "count": w.Count})
	}
	platforms := make([]map[string]any, 0, len(report.Platforms))
	for _, p := range report.Platforms {
		platforms = append(platforms, map[string]any{
			"platform":      p.Platform,
			"messages":      p.Messages,
			"conversations": p.Conversations,
		})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"summary": map[string]any{
			"total_messages":       report.Summary.TotalMessages,
			"this_month":           report.Summary.ThisMonth,
			"user_messages":        report.Summary.UserMessages,
			"ai_messages":          report.Summary.AIMessages,
			"total_conversations":  report.Summary.TotalConversations,
			"active_conversations": report.Summary.ActiveConversations,
			"telegram_messages":    report.Summary.TelegramMessages,
			"webchat_messages":     report.Summary.WebchatMessages,
			"avg_per_day":          report.Summary.AvgPerDay,
			"mom":                  report.Summary.MoM,
		},
		"daily_trend":  daily,
		"hourly_dist":  hourly,
		"platforms":    platforms,
		"weekly_trend": weekly,
	})
}

func toDailyJSON(rows []entity.DailyMessageCount) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, d := range rows {
		out = append(out, map[string]any{
			"date":  d.Date.Format("2006-01-02"),
			"count": d.Count,
		})
	}
	return out
}

// ── /usage ──────────────────────────────────────────────────────────

func (h *Handler) getUsage(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	days, _ := strconv.Atoi(c.QueryParam("days"))
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))

	report := h.uc.GetUsage(c.Request().Context(), userID, days, page, limit)

	daily := make([]map[string]any, 0, len(report.Daily))
	for _, d := range report.Daily {
		daily = append(daily, map[string]any{
			"date":          d.Date,
			"requests":      d.Requests,
			"input_tokens":  d.InputTokens,
			"output_tokens": d.OutputTokens,
			"cached_tokens": d.CachedTokens,
			"cost_usd":      d.CostUSD,
			"success_count": d.SuccessCount,
			"error_count":   d.ErrorCount,
		})
	}
	models := make([]map[string]any, 0, len(report.ModelBreakdown))
	for _, m := range report.ModelBreakdown {
		models = append(models, map[string]any{
			"model":    m.Model,
			"provider": m.Provider,
			"count":    m.Count,
			"cost_usd": m.CostUSD,
			"tokens":   m.Tokens,
		})
	}
	logs := make([]map[string]any, 0, len(report.Logs))
	for _, l := range report.Logs {
		logs = append(logs, map[string]any{
			"id":            l.ID,
			"model":         l.Model,
			"provider":      l.Provider,
			"input_tokens":  l.InputTokens,
			"output_tokens": l.OutputTokens,
			"cached_tokens": l.CachedTokens,
			"cost_usd":      l.CostUSD,
			"status":        l.Status,
			"call_type":     l.CallType,
			"created_at":    l.CreatedAt,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"summary": map[string]any{
			"total_requests":      report.Summary.TotalRequests,
			"success_requests":    report.Summary.SuccessRequests,
			"total_input_tokens":  report.Summary.TotalInputTokens,
			"total_output_tokens": report.Summary.TotalOutputTokens,
			"total_cached_tokens": report.Summary.TotalCachedTokens,
			"total_cost_usd":      report.Summary.TotalCostUSD,
		},
		"daily":           daily,
		"model_breakdown": models,
		"logs":            logs,
		"total":           report.Total,
		"page":            report.Page,
		"limit":           report.Limit,
	})
}
