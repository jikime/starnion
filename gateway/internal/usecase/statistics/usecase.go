// Package statistics hosts the read-only aggregation use cases behind
// /statistics, /statistics/insights, /analytics, and /usage. The use
// case fans out every sub-query via errgroup so the HTTP handler does
// not have to touch goroutines.
package statistics

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type UseCase struct {
	repo   repository.StatisticsRepository
	logger *zap.Logger
}

func NewUseCase(repo repository.StatisticsRepository, logger *zap.Logger) *UseCase {
	return &UseCase{repo: repo, logger: logger}
}

// ── /statistics ─────────────────────────────────────────────────────

// StatisticsReport is the response DTO for GET /statistics.
type StatisticsReport struct {
	PeriodMonths      int
	Summary           StatisticsSummary
	MonthlyTrend      []entity.MonthlyTrend
	CategoryBreakdown []CategoryItem
	WeekdaySpending   []entity.WeekdaySpending
	Heatmap           []entity.HeatmapCell
	Conversation      entity.ConversationStats
}

type StatisticsSummary struct {
	TotalExpense     int64
	AvgDaily         int64
	TxCount          int
	TopCategory      string
	TopCategoryAmt   int64
	ThisMonthExpense int64
	LastMonthExpense int64
	MoM              float64
}

// CategoryItem is category breakdown with computed percent.
type CategoryItem struct {
	Category string
	Amount   int64
	Percent  float64
	Count    int
}

// GetStatistics runs every sub-query in parallel and assembles the
// final report.
func (u *UseCase) GetStatistics(ctx context.Context, userID uuid.UUID, months int) StatisticsReport {
	if months < 1 || months > 24 {
		months = 3
	}
	since := time.Now().AddDate(0, -months, 0)
	now := time.Now()
	thisMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	nextMonthStart := thisMonthStart.AddDate(0, 1, 0)
	lastMonthStart := thisMonthStart.AddDate(0, -1, 0)

	var (
		monthlyTrend     []entity.MonthlyTrend
		catBreakdown     []entity.CategoryBreakdown
		weekdaySpending  []entity.WeekdaySpending
		heatmap          []entity.HeatmapCell
		totalExpense     int64
		txCount          int
		topCategory      string
		topCategoryAmt   int64
		thisMonthExpense int64
		lastMonthExpense int64
		convStats        entity.ConversationStats
	)

	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		rows, err := u.repo.MonthlyTrend(gctx, userID, since)
		if err != nil {
			u.logger.Warn("statistics: monthly trend query failed", zap.Error(err))
			return nil
		}
		monthlyTrend = rows
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.CategoryBreakdown(gctx, userID, since)
		if err != nil {
			u.logger.Warn("statistics: category breakdown query failed", zap.Error(err))
			return nil
		}
		catBreakdown = rows
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.WeekdaySpending90d(gctx, userID)
		if err != nil {
			u.logger.Warn("statistics: weekday spending query failed", zap.Error(err))
			return nil
		}
		weekdaySpending = rows
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.Heatmap90d(gctx, userID)
		if err != nil {
			u.logger.Warn("statistics: heatmap query failed", zap.Error(err))
			return nil
		}
		heatmap = rows
		return nil
	})
	g.Go(func() error {
		total, tx, err := u.repo.ExpenseSummary(gctx, userID, since)
		if err != nil {
			u.logger.Warn("statistics: expense summary query failed", zap.Error(err))
			return nil
		}
		totalExpense = total
		txCount = tx
		return nil
	})
	g.Go(func() error {
		cat, amt, err := u.repo.TopCategory(gctx, userID, since)
		if err != nil {
			u.logger.Warn("statistics: top category query failed", zap.Error(err))
			return nil
		}
		topCategory = cat
		topCategoryAmt = amt
		return nil
	})
	g.Go(func() error {
		amt, err := u.repo.ExpenseInRange(gctx, userID, thisMonthStart, nextMonthStart)
		if err != nil {
			u.logger.Warn("statistics: this month expense query failed", zap.Error(err))
			return nil
		}
		thisMonthExpense = amt
		return nil
	})
	g.Go(func() error {
		amt, err := u.repo.ExpenseInRange(gctx, userID, lastMonthStart, thisMonthStart)
		if err != nil {
			u.logger.Warn("statistics: last month expense query failed", zap.Error(err))
			return nil
		}
		lastMonthExpense = amt
		return nil
	})
	g.Go(func() error {
		stats, err := u.repo.ConversationStats(gctx, userID, since)
		if err != nil {
			u.logger.Warn("statistics: conversation stats query failed", zap.Error(err))
			return nil
		}
		convStats = stats
		return nil
	})

	if err := g.Wait(); err != nil {
		u.logger.Error("statistics: unexpected errgroup error", zap.Error(err))
	}

	// Assemble category breakdown with percent.
	var totalCatAmt int64
	for _, c := range catBreakdown {
		totalCatAmt += c.Amount
	}
	items := make([]CategoryItem, 0, len(catBreakdown))
	for _, c := range catBreakdown {
		pct := 0.0
		if totalCatAmt > 0 {
			pct = float64(c.Amount) / float64(totalCatAmt) * 100
		}
		items = append(items, CategoryItem{
			Category: c.Category,
			Amount:   c.Amount,
			Percent:  pct,
			Count:    c.Count,
		})
	}

	dayCount := time.Since(since).Hours() / 24
	var avgDaily int64
	if dayCount > 0 {
		avgDaily = int64(float64(totalExpense) / dayCount)
	}
	var mom float64
	if lastMonthExpense > 0 {
		mom = float64(thisMonthExpense-lastMonthExpense) / float64(lastMonthExpense) * 100
	}

	return StatisticsReport{
		PeriodMonths: months,
		Summary: StatisticsSummary{
			TotalExpense:     totalExpense,
			AvgDaily:         avgDaily,
			TxCount:          txCount,
			TopCategory:      topCategory,
			TopCategoryAmt:   topCategoryAmt,
			ThisMonthExpense: thisMonthExpense,
			LastMonthExpense: lastMonthExpense,
			MoM:              mom,
		},
		MonthlyTrend:      monthlyTrend,
		CategoryBreakdown: items,
		WeekdaySpending:   weekdaySpending,
		Heatmap:           heatmap,
		Conversation:      convStats,
	}
}

// GetInsights returns the Korean-language pattern descriptions from
// the latest scheduler AI analysis run. Returns an empty list if no
// analysis has been run yet.
func (u *UseCase) GetInsights(ctx context.Context, userID uuid.UUID) []string {
	raw, err := u.repo.LatestPatternAnalysis(ctx, userID)
	if err != nil || raw == "" {
		return []string{}
	}
	var parsed struct {
		Patterns []struct {
			Description string `json:"description"`
		} `json:"patterns"`
	}
	out := []string{}
	if json.Unmarshal([]byte(raw), &parsed) == nil {
		for _, p := range parsed.Patterns {
			if p.Description != "" {
				out = append(out, p.Description)
			}
		}
	}
	return out
}

// ── /analytics ──────────────────────────────────────────────────────

// AnalyticsReport is the response DTO for GET /analytics.
type AnalyticsReport struct {
	Summary     AnalyticsSummary
	DailyTrend  []entity.DailyMessageCount
	HourlyDist  []entity.HourlyMessageCount
	Platforms   []PlatformEntry
	WeeklyTrend []entity.WeeklyMessageCount
}

// AnalyticsSummary is the totals block inside /analytics.
type AnalyticsSummary struct {
	TotalMessages       int
	ThisMonth           int
	UserMessages        int
	AIMessages          int
	TotalConversations  int
	ActiveConversations int
	TelegramMessages    int
	WebchatMessages     int
	AvgPerDay           int
	MoM                 float64
}

// PlatformEntry is one row in the /analytics platforms list.
type PlatformEntry struct {
	Platform      string
	Messages      int
	Conversations int
}

// GetAnalytics runs every /analytics sub-query in parallel and
// assembles the final report.
func (u *UseCase) GetAnalytics(ctx context.Context, userID uuid.UUID) AnalyticsReport {
	now := time.Now()
	thisMonth := now.Format("2006-01")
	lastMonth := now.AddDate(0, -1, 0).Format("2006-01")

	var (
		web           entity.PlatformMessages
		tg            entity.PlatformMessages
		convTotals    entity.ConversationTotals
		dailyTrend    []entity.DailyMessageCount
		hourlyDist    []entity.HourlyMessageCount
		weeklyTrend   []entity.WeeklyMessageCount
		webConvCount  int
		tgConvCount   int
		legacyTgCount int
	)

	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		p, err := u.repo.WebChatMessages(gctx, userID, thisMonth, lastMonth)
		if err != nil {
			u.logger.Warn("analytics: web messages query failed", zap.Error(err))
			return nil
		}
		web = p
		return nil
	})
	g.Go(func() error {
		p, err := u.repo.TelegramMessages(gctx, userID, thisMonth, lastMonth)
		if err != nil {
			u.logger.Warn("analytics: telegram messages query failed", zap.Error(err))
			return nil
		}
		tg = p
		return nil
	})
	g.Go(func() error {
		t, err := u.repo.ConversationTotals(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: conversation totals query failed", zap.Error(err))
			return nil
		}
		convTotals = t
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.DailyTrend30d(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: daily trend query failed", zap.Error(err))
			return nil
		}
		dailyTrend = rows
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.HourlyDist30d(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: hourly dist query failed", zap.Error(err))
			return nil
		}
		hourlyDist = rows
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.WeeklyTrend8w(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: weekly trend query failed", zap.Error(err))
			return nil
		}
		weeklyTrend = rows
		return nil
	})
	g.Go(func() error {
		n, err := u.repo.WebConversationCount(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: web conv count query failed", zap.Error(err))
			return nil
		}
		webConvCount = n
		return nil
	})
	g.Go(func() error {
		n, err := u.repo.TelegramConversationCount(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: telegram conv count query failed", zap.Error(err))
			return nil
		}
		tgConvCount = n
		return nil
	})
	g.Go(func() error {
		n, err := u.repo.LegacyTelegramSessionCount(gctx, userID)
		if err != nil {
			u.logger.Warn("analytics: legacy tg count query failed", zap.Error(err))
			return nil
		}
		legacyTgCount = n
		return nil
	})
	if err := g.Wait(); err != nil {
		u.logger.Error("analytics: unexpected errgroup error", zap.Error(err))
	}

	totalMessages := web.Total + tg.Total
	userMessages := web.User + tg.User
	aiMessages := web.AI + tg.AI
	thisMonthTotal := web.ThisMonth + tg.ThisMonth
	lastMonthTotal := web.LastMonth + tg.LastMonth

	var mom float64
	if lastMonthTotal > 0 {
		mom = float64(thisMonthTotal-lastMonthTotal) / float64(lastMonthTotal) * 100
	}
	avgPerDay := 0
	if totalMessages > 0 {
		avgPerDay = totalMessages / 30
	}

	tgConvCount += legacyTgCount

	return AnalyticsReport{
		Summary: AnalyticsSummary{
			TotalMessages:       totalMessages,
			ThisMonth:           thisMonthTotal,
			UserMessages:        userMessages,
			AIMessages:          aiMessages,
			TotalConversations:  convTotals.Total,
			ActiveConversations: convTotals.Active,
			TelegramMessages:    tg.Total,
			WebchatMessages:     web.Total,
			AvgPerDay:           avgPerDay,
			MoM:                 mom,
		},
		DailyTrend:  dailyTrend,
		HourlyDist:  hourlyDist,
		WeeklyTrend: weeklyTrend,
		Platforms: []PlatformEntry{
			{Platform: "web", Messages: web.Total, Conversations: webConvCount},
			{Platform: "telegram", Messages: tg.Total, Conversations: tgConvCount},
		},
	}
}

// ── /usage ──────────────────────────────────────────────────────────

// UsageReport is the response DTO for GET /usage.
type UsageReport struct {
	Summary        entity.UsageSummary
	Daily          []entity.UsageDay
	ModelBreakdown []entity.UsageModel
	Logs           []entity.UsageLog
	Total          int
	Page           int
	Limit          int
}

// GetUsage returns a paginated usage report for the given window.
func (u *UseCase) GetUsage(ctx context.Context, userID uuid.UUID, days, page, limit int) UsageReport {
	if days < 1 {
		days = 30
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 100
	}
	offset := (page - 1) * limit
	since := time.Now().AddDate(0, 0, -days)

	report := UsageReport{Page: page, Limit: limit}

	if s, err := u.repo.UsageSummary(ctx, userID, since); err == nil {
		report.Summary = s
	} else {
		u.logger.Warn("usage: summary query failed", zap.Error(err))
	}
	if rows, err := u.repo.UsageDaily(ctx, userID, since); err == nil {
		report.Daily = rows
	} else {
		u.logger.Warn("usage: daily query failed", zap.Error(err))
	}
	if rows, err := u.repo.UsageModelBreakdown(ctx, userID, since); err == nil {
		report.ModelBreakdown = rows
	} else {
		u.logger.Warn("usage: model breakdown query failed", zap.Error(err))
	}
	if rows, err := u.repo.UsageRecentLogs(ctx, userID, since, limit, offset); err == nil {
		report.Logs = rows
	} else {
		u.logger.Warn("usage: recent logs query failed", zap.Error(err))
	}
	if n, err := u.repo.UsageTotalCount(ctx, userID, since); err == nil {
		report.Total = n
	} else {
		u.logger.Warn("usage: total count query failed", zap.Error(err))
	}
	return report
}
