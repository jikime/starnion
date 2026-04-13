package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// StatisticsRepository is the read-only port the statistics / analytics
// / usage use cases rely on. Every method is a single SQL query — the
// usecase orchestrates them with an errgroup so the HTTP handler does
// not have to know about goroutines or wait groups.
type StatisticsRepository interface {
	// ── /statistics (finances + conversations) ───────────────────
	MonthlyTrend(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.MonthlyTrend, error)
	CategoryBreakdown(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.CategoryBreakdown, error)
	WeekdaySpending90d(ctx context.Context, userID uuid.UUID) ([]entity.WeekdaySpending, error)
	Heatmap90d(ctx context.Context, userID uuid.UUID) ([]entity.HeatmapCell, error)
	ExpenseSummary(ctx context.Context, userID uuid.UUID, since time.Time) (totalExpense int64, txCount int, err error)
	TopCategory(ctx context.Context, userID uuid.UUID, since time.Time) (category string, amount int64, err error)
	ExpenseInRange(ctx context.Context, userID uuid.UUID, start, end time.Time) (int64, error)
	ConversationStats(ctx context.Context, userID uuid.UUID, since time.Time) (entity.ConversationStats, error)

	// ── /analytics ──────────────────────────────────────────────
	WebChatMessages(ctx context.Context, userID uuid.UUID, thisMonth, lastMonth string) (entity.PlatformMessages, error)
	TelegramMessages(ctx context.Context, userID uuid.UUID, thisMonth, lastMonth string) (entity.PlatformMessages, error)
	ConversationTotals(ctx context.Context, userID uuid.UUID) (entity.ConversationTotals, error)
	DailyTrend30d(ctx context.Context, userID uuid.UUID) ([]entity.DailyMessageCount, error)
	HourlyDist30d(ctx context.Context, userID uuid.UUID) ([]entity.HourlyMessageCount, error)
	WeeklyTrend8w(ctx context.Context, userID uuid.UUID) ([]entity.WeeklyMessageCount, error)
	WebConversationCount(ctx context.Context, userID uuid.UUID) (int, error)
	TelegramConversationCount(ctx context.Context, userID uuid.UUID) (int, error)
	LegacyTelegramSessionCount(ctx context.Context, userID uuid.UUID) (int, error)

	// ── /usage ──────────────────────────────────────────────────
	UsageSummary(ctx context.Context, userID uuid.UUID, since time.Time) (entity.UsageSummary, error)
	UsageDaily(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.UsageDay, error)
	UsageModelBreakdown(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.UsageModel, error)
	UsageRecentLogs(ctx context.Context, userID uuid.UUID, since time.Time, limit, offset int) ([]entity.UsageLog, error)
	UsageTotalCount(ctx context.Context, userID uuid.UUID, since time.Time) (int, error)

	// ── /statistics/insights (knowledge_base AI patterns) ───────
	LatestPatternAnalysis(ctx context.Context, userID uuid.UUID) (string, error)
}
