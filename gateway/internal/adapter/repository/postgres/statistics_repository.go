package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type StatisticsRepository struct {
	db *database.DB
}

func NewStatisticsRepository(db *database.DB) *StatisticsRepository {
	return &StatisticsRepository{db: db}
}

// ── /statistics ─────────────────────────────────────────────────────

func (r *StatisticsRepository) MonthlyTrend(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.MonthlyTrend, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
		       COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) AS expense
		FROM finances
		WHERE user_id = $1 AND created_at >= $2
		GROUP BY month ORDER BY month`, userID, since)
	if err != nil {
		return nil, fmt.Errorf("postgres stats monthly trend: %w", err)
	}
	defer rows.Close()
	var out []entity.MonthlyTrend
	for rows.Next() {
		var t entity.MonthlyTrend
		if err := rows.Scan(&t.Month, &t.Income, &t.Expense); err != nil {
			return nil, fmt.Errorf("postgres stats monthly scan: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) CategoryBreakdown(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.CategoryBreakdown, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT category, ABS(SUM(amount)) AS amount, COUNT(*) AS cnt
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category ORDER BY amount DESC LIMIT 10`, userID, since)
	if err != nil {
		return nil, fmt.Errorf("postgres stats category: %w", err)
	}
	defer rows.Close()
	var out []entity.CategoryBreakdown
	for rows.Next() {
		var c entity.CategoryBreakdown
		if err := rows.Scan(&c.Category, &c.Amount, &c.Count); err != nil {
			return nil, fmt.Errorf("postgres stats category scan: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) WeekdaySpending90d(ctx context.Context, userID uuid.UUID) ([]entity.WeekdaySpending, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT EXTRACT(DOW FROM created_at)::int AS weekday,
		       ABS(SUM(amount)) AS total,
		       ABS(AVG(amount))::int AS avg,
		       COUNT(*) AS cnt
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= NOW() - INTERVAL '90 days'
		GROUP BY weekday ORDER BY weekday`, userID)
	if err != nil {
		return nil, fmt.Errorf("postgres stats weekday: %w", err)
	}
	defer rows.Close()
	var out []entity.WeekdaySpending
	for rows.Next() {
		var w entity.WeekdaySpending
		if err := rows.Scan(&w.Weekday, &w.Total, &w.Avg, &w.Count); err != nil {
			return nil, fmt.Errorf("postgres stats weekday scan: %w", err)
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) Heatmap90d(ctx context.Context, userID uuid.UUID) ([]entity.HeatmapCell, error) {
	rows, err := r.db.Pool().Query(ctx, `
		SELECT DATE(created_at) AS date, ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= NOW() - INTERVAL '90 days'
		GROUP BY date ORDER BY date`, userID)
	if err != nil {
		return nil, fmt.Errorf("postgres stats heatmap: %w", err)
	}
	defer rows.Close()
	var out []entity.HeatmapCell
	for rows.Next() {
		var c entity.HeatmapCell
		if err := rows.Scan(&c.Date, &c.Total); err != nil {
			return nil, fmt.Errorf("postgres stats heatmap scan: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) ExpenseSummary(ctx context.Context, userID uuid.UUID, since time.Time) (int64, int, error) {
	var totalExpense int64
	var txCount int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(ABS(SUM(amount)), 0), COUNT(*)
		 FROM finances WHERE user_id = $1 AND amount < 0 AND created_at >= $2`,
		userID, since,
	).Scan(&totalExpense, &txCount)
	if err != nil {
		return 0, 0, fmt.Errorf("postgres stats expense summary: %w", err)
	}
	return totalExpense, txCount, nil
}

func (r *StatisticsRepository) TopCategory(ctx context.Context, userID uuid.UUID, since time.Time) (string, int64, error) {
	var category string
	var amount int64
	err := r.db.Pool().QueryRow(ctx, `
		SELECT category, ABS(SUM(amount)) AS amt FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category ORDER BY amt DESC LIMIT 1`,
		userID, since,
	).Scan(&category, &amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", 0, nil
	}
	if err != nil {
		return "", 0, fmt.Errorf("postgres stats top category: %w", err)
	}
	return category, amount, nil
}

func (r *StatisticsRepository) ExpenseInRange(ctx context.Context, userID uuid.UUID, start, end time.Time) (int64, error) {
	var total int64
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(ABS(SUM(amount)), 0) FROM finances
		 WHERE user_id = $1 AND amount < 0
		   AND created_at >= $2 AND created_at < $3`,
		userID, start, end,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("postgres stats expense range: %w", err)
	}
	return total, nil
}

func (r *StatisticsRepository) ConversationStats(ctx context.Context, userID uuid.UUID, since time.Time) (entity.ConversationStats, error) {
	var s entity.ConversationStats
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND created_at >= $2`,
		userID, since,
	).Scan(&s.ConvCount); err != nil {
		return entity.ConversationStats{}, fmt.Errorf("postgres stats conv count: %w", err)
	}
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND m.created_at >= $2`,
		userID, since,
	).Scan(&s.TotalMessages); err != nil {
		return entity.ConversationStats{}, fmt.Errorf("postgres stats total messages: %w", err)
	}
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND m.role = 'user' AND m.created_at >= $2`,
		userID, since,
	).Scan(&s.UserMessages); err != nil {
		return entity.ConversationStats{}, fmt.Errorf("postgres stats user messages: %w", err)
	}
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1
		   AND DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())`,
		userID,
	).Scan(&s.ThisMonthMessages); err != nil {
		return entity.ConversationStats{}, fmt.Errorf("postgres stats this month messages: %w", err)
	}
	return s, nil
}

// ── /analytics ──────────────────────────────────────────────────────

func (r *StatisticsRepository) WebChatMessages(ctx context.Context, userID uuid.UUID, thisMonth, lastMonth string) (entity.PlatformMessages, error) {
	var p entity.PlatformMessages
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN m.role='user'      THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN m.role='assistant' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(m.created_at,'YYYY-MM')=$2 THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN TO_CHAR(m.created_at,'YYYY-MM')=$3 THEN 1 ELSE 0 END),0)
		 FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND c.platform = 'web'`,
		userID, thisMonth, lastMonth,
	).Scan(&p.Total, &p.User, &p.AI, &p.ThisMonth, &p.LastMonth)
	if err != nil {
		return entity.PlatformMessages{}, fmt.Errorf("postgres stats web messages: %w", err)
	}
	return p, nil
}

func (r *StatisticsRepository) TelegramMessages(ctx context.Context, userID uuid.UUID, thisMonth, lastMonth string) (entity.PlatformMessages, error) {
	var p entity.PlatformMessages
	err := r.db.Pool().QueryRow(ctx,
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
		 ) combined`,
		userID, thisMonth, lastMonth,
	).Scan(&p.Total, &p.User, &p.AI, &p.ThisMonth, &p.LastMonth)
	if err != nil {
		return entity.PlatformMessages{}, fmt.Errorf("postgres stats telegram messages: %w", err)
	}
	return p, nil
}

func (r *StatisticsRepository) ConversationTotals(ctx context.Context, userID uuid.UUID) (entity.ConversationTotals, error) {
	var t entity.ConversationTotals
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*),
		        COALESCE(SUM(CASE WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END),0)
		 FROM conversations WHERE user_id = $1`,
		userID,
	).Scan(&t.Total, &t.Active)
	if err != nil {
		return entity.ConversationTotals{}, fmt.Errorf("postgres stats conv totals: %w", err)
	}
	return t, nil
}

func (r *StatisticsRepository) DailyTrend30d(ctx context.Context, userID uuid.UUID) ([]entity.DailyMessageCount, error) {
	rows, err := r.db.Pool().Query(ctx,
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
		 ORDER BY day ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats daily trend: %w", err)
	}
	defer rows.Close()
	var out []entity.DailyMessageCount
	for rows.Next() {
		var d entity.DailyMessageCount
		if err := rows.Scan(&d.Date, &d.Count); err != nil {
			return nil, fmt.Errorf("postgres stats daily trend scan: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) HourlyDist30d(ctx context.Context, userID uuid.UUID) ([]entity.HourlyMessageCount, error) {
	rows, err := r.db.Pool().Query(ctx,
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
		 ORDER BY h`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats hourly dist: %w", err)
	}
	defer rows.Close()
	var out []entity.HourlyMessageCount
	for rows.Next() {
		var h entity.HourlyMessageCount
		if err := rows.Scan(&h.Hour, &h.Count); err != nil {
			return nil, fmt.Errorf("postgres stats hourly dist scan: %w", err)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) WeeklyTrend8w(ctx context.Context, userID uuid.UUID) ([]entity.WeeklyMessageCount, error) {
	rows, err := r.db.Pool().Query(ctx,
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
		 ORDER BY d ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats weekly trend: %w", err)
	}
	defer rows.Close()
	var out []entity.WeeklyMessageCount
	for rows.Next() {
		var w entity.WeeklyMessageCount
		if err := rows.Scan(&w.Week, &w.Count); err != nil {
			return nil, fmt.Errorf("postgres stats weekly trend scan: %w", err)
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) WebConversationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND platform = 'web'`,
		userID,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres stats web conv count: %w", err)
	}
	return n, nil
}

func (r *StatisticsRepository) TelegramConversationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND platform = 'telegram'`,
		userID,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres stats telegram conv count: %w", err)
	}
	return n, nil
}

func (r *StatisticsRepository) LegacyTelegramSessionCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(DISTINCT session_id) FROM chat_messages WHERE user_id = $1`,
		userID,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres stats legacy tg count: %w", err)
	}
	return n, nil
}

// ── /usage ──────────────────────────────────────────────────────────

func (r *StatisticsRepository) UsageSummary(ctx context.Context, userID uuid.UUID, since time.Time) (entity.UsageSummary, error) {
	var s entity.UsageSummary
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		        COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cost_usd),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2`,
		userID, since,
	).Scan(&s.TotalRequests, &s.SuccessRequests, &s.TotalInputTokens, &s.TotalOutputTokens, &s.TotalCachedTokens, &s.TotalCostUSD)
	if err != nil {
		return entity.UsageSummary{}, fmt.Errorf("postgres stats usage summary: %w", err)
	}
	return s, nil
}

func (r *StatisticsRepository) UsageDaily(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.UsageDay, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT DATE(created_at)::text AS date,
		        COUNT(*) AS requests,
		        COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
		        COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cost_usd),0),
		        COALESCE(SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),0),
		        COALESCE(SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 GROUP BY DATE(created_at) ORDER BY date ASC`,
		userID, since,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats usage daily: %w", err)
	}
	defer rows.Close()
	var out []entity.UsageDay
	for rows.Next() {
		var d entity.UsageDay
		if err := rows.Scan(&d.Date, &d.Requests, &d.InputTokens, &d.OutputTokens, &d.CachedTokens, &d.CostUSD, &d.SuccessCount, &d.ErrorCount); err != nil {
			return nil, fmt.Errorf("postgres stats usage daily scan: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) UsageModelBreakdown(ctx context.Context, userID uuid.UUID, since time.Time) ([]entity.UsageModel, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT model, provider, COUNT(*) AS count,
		        COALESCE(SUM(cost_usd),0), COALESCE(SUM(input_tokens+output_tokens),0)
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 GROUP BY model, provider ORDER BY count DESC LIMIT 20`,
		userID, since,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats usage model breakdown: %w", err)
	}
	defer rows.Close()
	var out []entity.UsageModel
	for rows.Next() {
		var m entity.UsageModel
		if err := rows.Scan(&m.Model, &m.Provider, &m.Count, &m.CostUSD, &m.Tokens); err != nil {
			return nil, fmt.Errorf("postgres stats usage model breakdown scan: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) UsageRecentLogs(ctx context.Context, userID uuid.UUID, since time.Time, limit, offset int) ([]entity.UsageLog, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, model, provider, input_tokens, output_tokens, cached_tokens,
		        cost_usd, status, call_type, created_at::text
		 FROM usage_logs WHERE user_id = $1 AND created_at >= $2
		 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
		userID, since, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres stats usage recent: %w", err)
	}
	defer rows.Close()
	var out []entity.UsageLog
	for rows.Next() {
		var l entity.UsageLog
		if err := rows.Scan(&l.ID, &l.Model, &l.Provider, &l.InputTokens, &l.OutputTokens, &l.CachedTokens, &l.CostUSD, &l.Status, &l.CallType, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("postgres stats usage recent scan: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *StatisticsRepository) UsageTotalCount(ctx context.Context, userID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM usage_logs WHERE user_id = $1 AND created_at >= $2`,
		userID, since,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres stats usage count: %w", err)
	}
	return n, nil
}

func (r *StatisticsRepository) LatestPatternAnalysis(ctx context.Context, userID uuid.UUID) (string, error) {
	var raw string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT value FROM knowledge_base
		 WHERE user_id = $1 AND key = 'pattern:analysis_result'
		 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("postgres stats pattern analysis: %w", err)
	}
	return raw, nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.StatisticsRepository = (*StatisticsRepository)(nil)
