package scheduler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"go.uber.org/zap"
)

// ── Smart Notify ──────────────────────────────────────────────────────────────

// TriggerJob forces a single builtin job to fire for the given user regardless
// of its cron schedule. Intended for local testing and debugging only.
//
// Returns:
//   - msg: the message that was (or would have been) sent
//   - sent: true if notifyFn was called, false if the job was skipped (no data)
//   - err: non-nil if notifyFn failed or the job was not found
func (s *Scheduler) TriggerJob(ctx context.Context, jobID, userID string) (msg string, sent bool, err error) {
	for _, job := range BuiltinJobs {
		if job.ID != jobID {
			continue
		}
		switch job.ActionType {
		case "notify":
			if err = s.notifyFn(ctx, userID, job.NotifType, job.Message); err != nil {
				return "", false, err
			}
			return job.Message, true, nil
		case "smart_notify":
			triggerCtx := context.WithValue(ctx, bypassDedupCtxKey{}, true)
			m, skip := s.computeSmartNotify(triggerCtx, userID, job.ID)
			if skip {
				return "", false, nil
			}
			if err = s.notifyFn(triggerCtx, userID, job.NotifType, m); err != nil {
				return "", false, err
			}
			return m, true, nil
		case "maintenance":
			s.runMaintenance(ctx, job.ID, userID)
			return "(maintenance — no message)", false, nil
		}
		return "", false, fmt.Errorf("unknown action type %q for job %q", job.ActionType, jobID)
	}
	return "", false, fmt.Errorf("job %q not found", jobID)
}

// bypassDedupCtxKey is the context key used to skip dedup checks.
// Set by TriggerJob so that a manual Play-button run never blocks same-day scheduled runs.
type bypassDedupCtxKey struct{}

// alreadySentToday returns true if a notification of notifType was already sent to userID today
// (UTC calendar date). Always returns false when the bypassDedup context value is set.
func (s *Scheduler) alreadySentToday(ctx context.Context, userID, notifType string) bool {
	if ctx.Value(bypassDedupCtxKey{}) != nil {
		return false
	}
	var count int
	s.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications
		 WHERE user_id = $1::uuid AND type = $2
		   AND created_at >= CURRENT_DATE`,
		userID, notifType,
	).Scan(&count)
	return count > 0
}

// computeSmartNotify runs job-specific logic and returns a dynamic notification
// message. Returns ("", true) when the notification should be skipped.
func (s *Scheduler) computeSmartNotify(ctx context.Context, userID, jobID string) (string, bool) {
	switch jobID {
	case "daily_summary":
		return s.smartDailyFinanceSummary(ctx, userID)
	case "weekly_report":
		return s.smartWeeklyPlannerReview(ctx, userID)
	case "monthly_closing":
		return s.smartMonthlyFinanceSummary(ctx, userID)
	case "planner_task_reminder":
		return s.smartPlannerTaskReminder(ctx, userID)
	case "planner_goal_dday":
		return s.smartPlannerGoalDday(ctx, userID)
	case "spending_anomaly":
		return s.smartSpendingAnomaly(ctx, userID)
	case "pattern_analysis":
		return s.smartPatternAnalysis(ctx, userID)
	case "pattern_insight":
		return s.smartPatternInsight(ctx, userID)
	case "conversation_analysis":
		return s.smartConversationAnalysis(ctx, userID)
	case "anomaly_insights":
		return s.smartAnomalyInsights(ctx, userID)
	case "daily_weather":
		return s.smartDailyWeather(ctx, userID)
	case "daily_news":
		return s.smartDailyNews(ctx, userID)
	case "local_events":
		return s.smartLocalEvents(ctx, userID)
	case "it_blog_digest":
		return s.smartItBlogDigest(ctx, userID)
	case "tavily_news":
		return s.smartTavilyNews(ctx, userID)
	case "google_calendar_digest":
		return s.smartGoogleCalendarDigest(ctx, userID)
	case "google_gmail_digest":
		return s.smartGoogleGmailDigest(ctx, userID)
	default:
		return "", true
	}
}

// smartSpendingAnomaly fires when today's spending is ≥2× the 30-day daily average.
// Sends at most once per day.
func (s *Scheduler) smartSpendingAnomaly(ctx context.Context, userID string) (string, bool) {
	if s.alreadySentToday(ctx, userID, "spending_anomaly") {
		return "", true
	}

	var todayTotal float64
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE`,
		userID,
	).Scan(&todayTotal)

	var avgDaily float64
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(AVG(daily_total), 0) FROM (
		     SELECT SUM(ABS(amount)) AS daily_total
		     FROM finances
		     WHERE user_id = $1::uuid AND amount < 0
		       AND created_at >= CURRENT_DATE - INTERVAL '30 days'
		       AND created_at < CURRENT_DATE
		     GROUP BY DATE(created_at)
		 ) t`,
		userID,
	).Scan(&avgDaily)

	if avgDaily <= 0 || todayTotal < avgDaily*2 {
		return "", true
	}
	pct := int((todayTotal/avgDaily - 1) * 100)
	return fmt.Sprintf("오늘 지출이 일평균 대비 %d%% 초과했습니다. 지출 현황을 확인해보세요.", pct), false
}

// smartPatternAnalysis fires when a category's spending increased ≥20% vs prior week.
func (s *Scheduler) smartPatternAnalysis(ctx context.Context, userID string) (string, bool) {
	thisWeek := map[string]float64{}
	rows, _ := s.db.Pool().Query(ctx,
		`SELECT category, SUM(ABS(amount)) AS total
		 FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE - INTERVAL '7 days'
		 GROUP BY category`,
		userID,
	)
	if rows != nil {
		for rows.Next() {
			var cat string
			var total float64
			if rows.Scan(&cat, &total) == nil {
				thisWeek[cat] = total
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			s.logger.Warn("scheduler: pattern analysis rows error", zap.Error(err))
		}
	}
	if len(thisWeek) == 0 {
		return "", true
	}

	lastWeek := map[string]float64{}
	rows2, _ := s.db.Pool().Query(ctx,
		`SELECT category, SUM(ABS(amount)) AS total
		 FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE - INTERVAL '14 days'
		   AND created_at < CURRENT_DATE - INTERVAL '7 days'
		 GROUP BY category`,
		userID,
	)
	if rows2 != nil {
		for rows2.Next() {
			var cat string
			var total float64
			if rows2.Scan(&cat, &total) == nil {
				lastWeek[cat] = total
			}
		}
		rows2.Close()
		if err := rows2.Err(); err != nil {
			s.logger.Warn("scheduler: pattern analysis rows2 error", zap.Error(err))
		}
	}

	maxPct := 0.0
	maxCat := ""
	for cat, thisTotal := range thisWeek {
		prev, ok := lastWeek[cat]
		if !ok || prev <= 0 {
			continue
		}
		pct := (thisTotal - prev) / prev * 100
		if pct > maxPct {
			maxPct = pct
			maxCat = cat
		}
	}
	if maxPct < 20 || maxCat == "" {
		return "", true
	}
	return fmt.Sprintf("소비 패턴 분석: %s 지출이 지난주 대비 %.0f%% 증가했습니다.", maxCat, maxPct), false
}

// smartPatternInsight fires daily at 14:00 with a combined weekly activity summary.
// Skipped when no activity data exists.
func (s *Scheduler) smartPatternInsight(ctx context.Context, userID string) (string, bool) {
	var weekSpend float64
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
		userID,
	).Scan(&weekSpend)

	var diaryCount int
	s.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM planner_diary
		 WHERE user_id = $1::uuid
		   AND entry_date >= CURRENT_DATE - INTERVAL '7 days'`,
		userID,
	).Scan(&diaryCount)

	var activeGoals int
	s.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM planner_goals
		 WHERE user_id = $1::uuid AND status = 'active'`,
		userID,
	).Scan(&activeGoals)

	if weekSpend == 0 && diaryCount == 0 && activeGoals == 0 {
		return "", true
	}

	var parts []string
	if weekSpend > 0 {
		parts = append(parts, fmt.Sprintf("이번 주 지출 ₩%s", formatKRW(int64(weekSpend))))
	}
	if diaryCount > 0 {
		parts = append(parts, fmt.Sprintf("노트 %d회 작성", diaryCount))
	}
	if activeGoals > 0 {
		parts = append(parts, fmt.Sprintf("진행 중인 목표 %d개", activeGoals))
	}
	return "주간 인사이트: " + strings.Join(parts, " · "), false
}

// smartConversationAnalysis notifies when the user has been inactive for ≥3 days.
// Sends at most once per 3 days (separate from inactive_reminder which covers 1 day).
func (s *Scheduler) smartConversationAnalysis(ctx context.Context, userID string) (string, bool) {
	// Already notified today?
	if s.alreadySentToday(ctx, userID, "conversation_analysis") {
		return "", true
	}

	// Last web message
	var lastWeb pgtype.Timestamptz
	s.db.Pool().QueryRow(ctx,
		`SELECT MAX(m.created_at) FROM messages m
		 JOIN conversations c ON m.conversation_id = c.id
		 WHERE c.user_id = $1::uuid`,
		userID,
	).Scan(&lastWeb)

	// Last telegram message
	var lastTg pgtype.Timestamptz
	s.db.Pool().QueryRow(ctx,
		`SELECT MAX(cm.created_at) FROM chat_messages cm
		 JOIN chat_sessions cs ON cm.session_id = cs.id
		 WHERE cs.user_id = $1::uuid`,
		userID,
	).Scan(&lastTg)

	var last time.Time
	if lastWeb.Valid {
		last = lastWeb.Time
	}
	if lastTg.Valid && lastTg.Time.After(last) {
		last = lastTg.Time
	}
	if last.IsZero() {
		return "", true
	}

	daysSince := int(time.Since(last).Hours() / 24)
	if daysSince < 1 {
		return "", true
	}
	return fmt.Sprintf("%d일째 대화가 없네요. 오늘 하루 어떠셨는지 이야기해보세요.", daysSince), false
}

// ── Finance & Planner Summary Jobs ────────────────────────────────────────────

// smartDailyFinanceSummary sends today's spending total with top-3 categories.
// Skips when there are no expenses today.
func (s *Scheduler) smartDailyFinanceSummary(ctx context.Context, userID string) (string, bool) {
	var total int64
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0 AND created_at >= CURRENT_DATE`,
		userID,
	).Scan(&total)
	if total == 0 {
		return "", true
	}

	rows, err := s.db.Pool().Query(ctx,
		`SELECT category, SUM(ABS(amount)) AS cat_total
		 FROM finances
		 WHERE user_id = $1::uuid AND amount < 0 AND created_at >= CURRENT_DATE
		 GROUP BY category ORDER BY cat_total DESC LIMIT 3`,
		userID,
	)
	if err != nil {
		return fmt.Sprintf("오늘 지출: ₩%s", formatKRW(total)), false
	}
	defer rows.Close()

	var parts []string
	for rows.Next() {
		var cat string
		var amt int64
		if rows.Scan(&cat, &amt) == nil {
			parts = append(parts, fmt.Sprintf("%s ₩%s", cat, formatKRW(amt)))
		}
	}
	msg := fmt.Sprintf("오늘 지출: ₩%s", formatKRW(total))
	if len(parts) > 0 {
		msg += " (" + strings.Join(parts, " · ") + ")"
	}
	return msg, false
}

// smartWeeklyPlannerReview sends weekly goal completion rate and spending total.
// Runs every Sunday at 20:00. Skips when no data exists.
func (s *Scheduler) smartWeeklyPlannerReview(ctx context.Context, userID string) (string, bool) {
	var doneCount, totalCount int
	s.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FILTER (WHERE done = true), COUNT(*)
		 FROM planner_weekly_goals
		 WHERE user_id = $1::uuid
		   AND week_start = date_trunc('week', CURRENT_DATE)::date`,
		userID,
	).Scan(&doneCount, &totalCount)

	var weekSpend int64
	s.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= date_trunc('week', CURRENT_DATE)`,
		userID,
	).Scan(&weekSpend)

	if totalCount == 0 && weekSpend == 0 {
		return "", true
	}

	var parts []string
	if totalCount > 0 {
		parts = append(parts, fmt.Sprintf("주간 목표 %d/%d 달성", doneCount, totalCount))
	}
	if weekSpend > 0 {
		parts = append(parts, fmt.Sprintf("지출 ₩%s", formatKRW(weekSpend)))
	}
	return "이번 주 마무리: " + strings.Join(parts, " · "), false
}

// smartMonthlyFinanceSummary sends last month's income, expenses, and savings rate.
// Runs on the 1st of every month. Skips when no transactions exist.
func (s *Scheduler) smartMonthlyFinanceSummary(ctx context.Context, userID string) (string, bool) {
	var income, expense int64
	s.db.Pool().QueryRow(ctx,
		`SELECT
		   COALESCE(SUM(CASE WHEN amount > 0 THEN amount  ELSE 0 END), 0),
		   COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
		 FROM finances
		 WHERE user_id = $1::uuid
		   AND created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
		   AND created_at <  date_trunc('month', NOW())`,
		userID,
	).Scan(&income, &expense)

	if income == 0 && expense == 0 {
		return "", true
	}

	month := time.Now().AddDate(0, -1, 0).Month()
	msg := fmt.Sprintf("%d월 정산: 수입 ₩%s · 지출 ₩%s", int(month), formatKRW(income), formatKRW(expense))
	if income > 0 {
		savingsRate := int((float64(income-expense) / float64(income)) * 100)
		if savingsRate < 0 {
			savingsRate = 0
		}
		msg += fmt.Sprintf(" · 저축률 %d%%", savingsRate)
	}
	return msg, false
}

// smartPlannerTaskReminder summarises today's pending/in-progress tasks.
// Skips when no tasks are due today.
func (s *Scheduler) smartPlannerTaskReminder(ctx context.Context, userID string) (string, bool) {
	rows, err := s.db.Pool().Query(ctx,
		`SELECT title, priority FROM planner_tasks
		 WHERE user_id = $1::uuid
		   AND task_date = CURRENT_DATE
		   AND status IN ('pending', 'in-progress')
		 ORDER BY
		   CASE priority WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,
		   sort_order
		 LIMIT 5`,
		userID,
	)
	if err != nil {
		return "", true
	}
	defer rows.Close()

	type task struct{ title, priority string }
	var tasks []task
	for rows.Next() {
		var t task
		if rows.Scan(&t.title, &t.priority) == nil {
			tasks = append(tasks, t)
		}
	}
	if len(tasks) == 0 {
		return "", true
	}

	var parts []string
	for _, t := range tasks {
		parts = append(parts, fmt.Sprintf("[%s] %s", t.priority, t.title))
	}
	return fmt.Sprintf("오늘 할 일 %d개: %s", len(tasks), strings.Join(parts, ", ")), false
}

// smartPlannerGoalDday alerts about goals due within 7 days.
// Skips when no goals are approaching deadline.
func (s *Scheduler) smartPlannerGoalDday(ctx context.Context, userID string) (string, bool) {
	rows, err := s.db.Pool().Query(ctx,
		`SELECT title, (due_date - CURRENT_DATE) AS days_left
		 FROM planner_goals
		 WHERE user_id = $1::uuid
		   AND status = 'active'
		   AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
		 ORDER BY due_date`,
		userID,
	)
	if err != nil {
		return "", true
	}
	defer rows.Close()

	type goal struct {
		title    string
		daysLeft int
	}
	var goals []goal
	for rows.Next() {
		var g goal
		if rows.Scan(&g.title, &g.daysLeft) == nil {
			goals = append(goals, g)
		}
	}
	if len(goals) == 0 {
		return "", true
	}

	var parts []string
	for _, g := range goals {
		if g.daysLeft == 0 {
			parts = append(parts, fmt.Sprintf("'%s' (오늘 마감)", g.title))
		} else {
			parts = append(parts, fmt.Sprintf("'%s' (D-%d)", g.title, g.daysLeft))
		}
	}
	return "마감 임박 목표: " + strings.Join(parts, ", "), false
}
