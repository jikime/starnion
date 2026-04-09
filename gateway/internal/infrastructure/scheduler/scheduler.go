// Package scheduler executes time-based cron jobs for all users.
//
// Two job categories are handled:
//   - System jobs (builtinJobs): hardcoded schedules that run for every user
//     who has not explicitly disabled them via preferences.scheduler.disabled_jobs.
//   - User schedules: stored as JSON in knowledge_base under keys "schedule:<uuid>".
//
// Actions:
//   - "report": calls ReportFunc to generate and save a report.
//   - "notify": calls NotifyFunc with a static message.
//   - "smart_notify": runs user-specific DB logic, then calls NotifyFunc with a dynamic message.
//   - "maintenance": runs background DB cleanup with no user notification.
package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// ReportFunc generates a report for the given user and report type.
// userID is a UUID string. reportType is one of: summary, weekly, monthly, diary, goals, finance.
type ReportFunc func(ctx context.Context, userID string, reportType string) error

// NotifyFunc inserts a notification row for the given user.
type NotifyFunc func(ctx context.Context, userID string, notifType string, message string) error

// Scheduler polls scheduled jobs once per minute and dispatches due actions.
type Scheduler struct {
	db       *database.DB
	logger   *zap.Logger
	reportFn ReportFunc
	notifyFn NotifyFunc
}

// New creates a Scheduler. Call Start to begin execution.
func New(db *database.DB, logger *zap.Logger, rf ReportFunc, nf NotifyFunc) *Scheduler {
	return &Scheduler{db: db, logger: logger, reportFn: rf, notifyFn: nf}
}

// Start launches the background goroutine. It returns immediately.
func (s *Scheduler) Start(ctx context.Context) {
	go s.run(ctx)
}

func (s *Scheduler) run(ctx context.Context) {
	s.logger.Info("scheduler: started")

	// Run once at startup to catch any missed schedules.
	s.tick(ctx)

	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("scheduler: stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	now := time.Now()
	s.runSystemJobs(ctx, now)
	s.runUserSchedules(ctx, now)
}

// ── System Jobs ───────────────────────────────────────────────────────────────

type systemJob struct {
	id         string
	cronExpr   string
	actionType string // "report" or "notify"
	// report params
	reportType string
	// notify params
	notifType string
	message   string
}

// builtinJobs mirrors the job definitions in cron.go (builtinSystemJobs).
// Only jobs that have an executable action are included here.
var builtinJobs = []systemJob{
	// Level 1: Rule-Based
	{id: "daily_summary", cronExpr: "0 21 * * *", actionType: "report", reportType: "summary"},
	{id: "weekly_report", cronExpr: "0 9 * * 1", actionType: "report", reportType: "weekly"},
	{id: "monthly_closing", cronExpr: "0 21 1 * *", actionType: "report", reportType: "finance"},
	{id: "inactive_reminder", cronExpr: "0 20 * * *", actionType: "notify",
		notifType: "inactive_reminder", message: "오늘 하루 어떠셨나요? 일기를 작성해보세요."},
	{id: "budget_warning", cronExpr: "0 21 * * *", actionType: "notify",
		notifType: "budget_warning", message: "오늘 예산 현황을 확인해보세요."},
	// Level 2: Pattern-Learning
	{id: "spending_anomaly", cronExpr: "0 */3 * * *", actionType: "smart_notify",
		notifType: "spending_anomaly"},
	{id: "anomaly_insights", cronExpr: "0 9 * * *", actionType: "smart_notify",
		notifType: "anomaly_insights"},
	{id: "pattern_analysis", cronExpr: "0 6 * * *", actionType: "smart_notify",
		notifType: "pattern_analysis"},
	{id: "pattern_insight", cronExpr: "0 14 * * *", actionType: "smart_notify",
		notifType: "pattern_insight"},
	{id: "conversation_analysis", cronExpr: "*/10 * * * *", actionType: "smart_notify",
		notifType: "conversation_analysis"},
	// Level 3: Autonomous
	{id: "goal_evaluation", cronExpr: "0 7 * * *", actionType: "report", reportType: "goals"},
	{id: "goal_status", cronExpr: "0 12 * * 3", actionType: "report", reportType: "goals"},
	// dday_notification removed — D-Day is now part of planner_goals
	// Level 5: Maintenance
	{id: "memory_compaction", cronExpr: "0 5 * * 1", actionType: "maintenance"},
}

func (s *Scheduler) runSystemJobs(ctx context.Context, now time.Time) {
	for _, job := range builtinJobs {
		if !matchCron(job.cronExpr, now) {
			continue
		}
		job := job // capture for goroutine
		s.logger.Info("scheduler: system job triggered", zap.String("id", job.id))

		// Fetch all users who have NOT disabled this job.
		// Preference path: preferences -> scheduler -> disabled_jobs (jsonb array of strings).
		queryCtx, queryCancel := context.WithTimeout(ctx, 10*time.Second)
		rows, err := s.db.QueryContext(queryCtx,
			`SELECT id::text FROM users
			 WHERE NOT (
			     COALESCE(preferences->'scheduler'->'disabled_jobs', '[]'::jsonb)
			     @> to_jsonb($1::text)
			 )`,
			job.id,
		)
		if err != nil {
			queryCancel()
			s.logger.Error("scheduler: query users for system job failed",
				zap.String("job_id", job.id), zap.Error(err))
			continue
		}

		var userIDs []string
		for rows.Next() {
			var uid string
			if rows.Scan(&uid) == nil {
				userIDs = append(userIDs, uid)
			}
		}
		rows.Close()
		queryCancel()

		for _, uid := range userIDs {
			switch job.actionType {
			case "report":
				go func() {
					if err := s.reportFn(ctx, uid, job.reportType); err != nil {
						s.logger.Error("scheduler: system report failed",
							zap.String("job_id", job.id),
							zap.String("user_id", uid),
							zap.Error(err))
					}
				}()
			case "notify":
				go func() {
					if err := s.notifyFn(ctx, uid, job.notifType, job.message); err != nil {
						s.logger.Error("scheduler: system notify failed",
							zap.String("job_id", job.id),
							zap.String("user_id", uid),
							zap.Error(err))
					}
				}()
			case "smart_notify":
				go func() {
					msg, skip := s.computeSmartNotify(ctx, uid, job.id)
					if skip {
						return
					}
					if err := s.notifyFn(ctx, uid, job.notifType, msg); err != nil {
						s.logger.Error("scheduler: smart notify failed",
							zap.String("job_id", job.id),
							zap.String("user_id", uid),
							zap.Error(err))
					}
				}()
			case "maintenance":
				go func() {
					s.runMaintenance(ctx, job.id, uid)
				}()
			}
		}
	}
}

// ── User Schedules ────────────────────────────────────────────────────────────

// schedTime mirrors the struct in cron.go for JSON unmarshalling.
type schedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
	Timezone  string `json:"timezone,omitempty"` // IANA timezone, e.g. "Asia/Seoul"
}

type scheduleEntry struct {
	Title      string    `json:"title"`
	Type       string    `json:"type"`        // "recurring" | "once" | "one_time"
	ReportType string    `json:"report_type"` // action discriminator
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"`      // "active" | "paused"
	Message    string    `json:"message"`
	LastSent   string    `json:"last_sent"`
	TaskPrompt string    `json:"task_prompt,omitempty"` // NL task for AI agent execution
	DeliverTo  string    `json:"deliver_to,omitempty"`  // "telegram" or ""
	LastOutput string    `json:"last_output,omitempty"` // last execution output snippet
}

// reportTypeSet contains the report_type values that should trigger report generation.
var reportTypeSet = map[string]bool{
	"summary": true, "weekly": true, "monthly": true,
	"diary": true, "goals": true, "finance": true,
}

func (s *Scheduler) runUserSchedules(ctx context.Context, now time.Time) {
	queryCtx, queryCancel := context.WithTimeout(ctx, 10*time.Second)
	defer queryCancel()
	rows, err := s.db.QueryContext(queryCtx,
		`SELECT user_id::text, id, key, value
		 FROM knowledge_base
		 WHERE key LIKE 'schedule:%'`,
	)
	if err != nil {
		s.logger.Error("scheduler: user schedule query failed", zap.Error(err))
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		var kbID int64
		var key, value string
		if rows.Scan(&userID, &kbID, &key, &value) != nil {
			continue
		}

		var entry scheduleEntry
		if json.Unmarshal([]byte(value), &entry) != nil {
			continue
		}

		if entry.Status != "active" {
			continue
		}

		// Convert now to the schedule's timezone for accurate local-time comparison.
		// Falls back to server time when timezone is empty or invalid (backward compat).
		localNow := now
		if tz := entry.Schedule.Timezone; tz != "" {
			if loc, err := time.LoadLocation(tz); err == nil {
				localNow = now.In(loc)
			}
		}
		today := localNow.Format("2006-01-02")

		// Time match (in local timezone)
		if entry.Schedule.Hour != localNow.Hour() || entry.Schedule.Minute != localNow.Minute() {
			continue
		}

		// Day-of-week match (optional, in local timezone)
		if entry.Schedule.DayOfWeek != "" && !matchDayOfWeek(entry.Schedule.DayOfWeek, localNow) {
			continue
		}

		// Specific date match (optional, local date)
		if entry.Schedule.Date != "" && entry.Schedule.Date != today {
			continue
		}

		// Prevent duplicate execution within the same day (local date).
		if entry.LastSent == today {
			continue
		}

		schedID := strings.TrimPrefix(key, "schedule:")
		capturedUserID, capturedEntry, capturedKBID, capturedToday := userID, entry, kbID, today
		go s.executeUserSchedule(ctx, capturedUserID, schedID, capturedKBID, capturedEntry, capturedToday)
	}
}

func (s *Scheduler) executeUserSchedule(
	ctx context.Context,
	userID, schedID string,
	kbID int64,
	entry scheduleEntry,
	today string,
) {
	s.logger.Info("scheduler: executing user schedule",
		zap.String("sched_id", schedID),
		zap.String("user_id", userID),
		zap.String("report_type", entry.ReportType))

	var execErr error
	if reportTypeSet[entry.ReportType] {
		execErr = s.reportFn(ctx, userID, entry.ReportType)
	} else {
		msg := entry.Message
		if msg == "" {
			msg = entry.Title + " 알림입니다."
		}
		notifType := entry.ReportType
		if notifType == "" {
			notifType = "custom_reminder"
		}
		execErr = s.notifyFn(ctx, userID, notifType, msg)
	}

	if execErr != nil {
		s.logger.Error("scheduler: user schedule execution failed",
			zap.String("sched_id", schedID),
			zap.String("user_id", userID),
			zap.Error(execErr))
		return
	}

	// Mark executed: update last_sent; pause one-time schedules.
	entry.LastSent = today
	if entry.Type == "once" || entry.Type == "one_time" {
		entry.Status = "paused"
	}

	newValue, _ := json.Marshal(entry)
	if _, err := s.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE id = $2`,
		string(newValue), kbID,
	); err != nil {
		s.logger.Warn("scheduler: failed to update last_sent",
			zap.String("sched_id", schedID), zap.Error(err))
	}
}

// ── Smart Notify ──────────────────────────────────────────────────────────────

// computeSmartNotify runs job-specific logic and returns a dynamic notification
// message. Returns ("", true) when the notification should be skipped.
func (s *Scheduler) computeSmartNotify(ctx context.Context, userID, jobID string) (string, bool) {
	switch jobID {
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
	default:
		return "", true
	}
}

// smartSpendingAnomaly fires when today's spending is ≥2× the 30-day daily average.
// Sends at most once per day.
func (s *Scheduler) smartSpendingAnomaly(ctx context.Context, userID string) (string, bool) {
	// Already notified today?
	var count int
	s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications
		 WHERE user_id = $1::uuid AND type = 'spending_anomaly'
		   AND created_at >= CURRENT_DATE`,
		userID,
	).Scan(&count)
	if count > 0 {
		return "", true
	}

	var todayTotal float64
	s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE`,
		userID,
	).Scan(&todayTotal)

	var avgDaily float64
	s.db.QueryRowContext(ctx,
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
	rows, _ := s.db.QueryContext(ctx,
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
	rows2, _ := s.db.QueryContext(ctx,
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
	s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM finances
		 WHERE user_id = $1::uuid AND amount < 0
		   AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
		userID,
	).Scan(&weekSpend)

	var diaryCount int
	s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM planner_diary
		 WHERE user_id = $1::uuid
		   AND entry_date >= CURRENT_DATE - INTERVAL '7 days'`,
		userID,
	).Scan(&diaryCount)

	var activeGoals int
	s.db.QueryRowContext(ctx,
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
		parts = append(parts, fmt.Sprintf("일기 %d회 작성", diaryCount))
	}
	if activeGoals > 0 {
		parts = append(parts, fmt.Sprintf("진행 중인 목표 %d개", activeGoals))
	}
	return "주간 인사이트: " + strings.Join(parts, " · "), false
}

// smartConversationAnalysis notifies when the user has been inactive for ≥3 days.
// Sends at most once per 3 days (separate from inactive_reminder which covers 1 day).
func (s *Scheduler) smartConversationAnalysis(ctx context.Context, userID string) (string, bool) {
	// Already notified in the last 3 days?
	var count int
	s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications
		 WHERE user_id = $1::uuid AND type = 'conversation_analysis'
		   AND created_at >= NOW() - INTERVAL '3 days'`,
		userID,
	).Scan(&count)
	if count > 0 {
		return "", true
	}

	// Last web message
	var lastWeb sql.NullTime
	s.db.QueryRowContext(ctx,
		`SELECT MAX(m.created_at) FROM messages m
		 JOIN conversations c ON m.conversation_id = c.id
		 WHERE c.user_id = $1::uuid`,
		userID,
	).Scan(&lastWeb)

	// Last telegram message
	var lastTg sql.NullTime
	s.db.QueryRowContext(ctx,
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
	if daysSince < 3 {
		return "", true
	}
	return fmt.Sprintf("%d일째 대화가 없네요. 오늘 하루 어떠셨는지 이야기해보세요.", daysSince), false
}

// ── Anomaly Insights ──────────────────────────────────────────────────────────

// schedWelfordState is a local copy of Welford's online algorithm used by the
// scheduler to avoid a circular import with the handler package.
type schedWelfordState struct {
	count int
	mean  float64
	m2    float64
}

func (w *schedWelfordState) update(x float64) {
	w.count++
	delta := x - w.mean
	w.mean += delta / float64(w.count)
	delta2 := x - w.mean
	w.m2 += delta * delta2
}

func (w *schedWelfordState) stdDev() float64 {
	if w.count < 2 {
		return 0
	}
	return math.Sqrt(w.m2 / float64(w.count-1))
}

func (w *schedWelfordState) zScore(x float64) float64 {
	std := w.stdDev()
	if std == 0 || w.count < 3 {
		return 0
	}
	return (x - w.mean) / std
}

// schedAnomalySeverity mirrors the handler.anomalySeverity thresholds.
func schedAnomalySeverity(z float64) string {
	az := math.Abs(z)
	switch {
	case az >= 3.0:
		return "high"
	case az >= 2.0:
		return "moderate"
	case az >= 1.5:
		return "mild"
	default:
		return ""
	}
}

// schedAnomalySignal is a minimal anomaly result used within the scheduler.
type schedAnomalySignal struct {
	Severity string
	Message  string
}

// smartAnomalyInsights runs all 4 anomaly signals once per day at 09:00 and
// sends a consolidated notification when ≥1 HIGH or MODERATE signal is found.
func (s *Scheduler) smartAnomalyInsights(ctx context.Context, userID string) (string, bool) {
	// Dedup: already sent today?
	var count int
	s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications
		 WHERE user_id = $1::uuid AND type = 'anomaly_insights'
		   AND created_at >= CURRENT_DATE`,
		userID,
	).Scan(&count)
	if count > 0 {
		return "", true
	}

	var signals []schedAnomalySignal

	// ── Signal 1: Daily spending anomaly (90-day baseline) ───────────────────
	{
		since90 := time.Now().AddDate(0, 0, -90)
		rows, err := s.db.QueryContext(ctx, `
			SELECT DATE(created_at) AS day, ABS(SUM(amount)) AS total
			FROM finances
			WHERE user_id = $1::uuid AND amount < 0 AND created_at >= $2
			GROUP BY day ORDER BY day`, userID, since90)
		if err == nil {
			type dayPoint struct {
				day   time.Time
				total float64
			}
			var points []dayPoint
			for rows.Next() {
				var dp dayPoint
				if rows.Scan(&dp.day, &dp.total) == nil {
					points = append(points, dp)
				}
			}
			rows.Close()

			if len(points) >= 14 {
				cutoff := time.Now().AddDate(0, 0, -7)
				ws := &schedWelfordState{}
				var recentPoints []dayPoint
				for _, p := range points {
					if p.day.Before(cutoff) {
						ws.update(p.total)
					} else {
						recentPoints = append(recentPoints, p)
					}
				}
				if ws.count >= 7 && len(recentPoints) > 0 {
					var recentSum float64
					for _, p := range recentPoints {
						recentSum += p.total
					}
					recentAvg := recentSum / float64(len(recentPoints))
					z := ws.zScore(recentAvg)
					sev := schedAnomalySeverity(z)
					if sev == "high" || sev == "moderate" {
						ratio := recentAvg / ws.mean
						var msg string
						if z > 0 {
							msg = fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.1f배 높아요", ratio)
						} else {
							msg = fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.0f%% 줄었어요", (1-ratio)*100)
						}
						signals = append(signals, schedAnomalySignal{Severity: sev, Message: msg})
					}
				}
			}
		}
	}

	// ── Signal 2: Weekly category spending anomaly (12-week baseline) ────────
	{
		since12w := time.Now().AddDate(0, 0, -84)
		rows, err := s.db.QueryContext(ctx, `
			SELECT category,
			       DATE_TRUNC('week', created_at) AS week,
			       ABS(SUM(amount)) AS total
			FROM finances
			WHERE user_id = $1::uuid AND amount < 0 AND created_at >= $2
			GROUP BY category, week
			ORDER BY category, week`, userID, since12w)
		if err == nil {
			type weekPoint struct {
				category string
				week     time.Time
				total    float64
			}
			catMap := map[string][]weekPoint{}
			for rows.Next() {
				var wp weekPoint
				if rows.Scan(&wp.category, &wp.week, &wp.total) == nil {
					catMap[wp.category] = append(catMap[wp.category], wp)
				}
			}
			rows.Close()

			now := time.Now()
			weekday := int(now.Weekday())
			if weekday == 0 {
				weekday = 7
			}
			thisWeekMonday := now.AddDate(0, 0, -(weekday - 1))
			thisWeekMonday = time.Date(thisWeekMonday.Year(), thisWeekMonday.Month(), thisWeekMonday.Day(), 0, 0, 0, 0, time.UTC)

			catLabels := map[string]string{
				"식비": "식비", "교통": "교통비", "쇼핑": "쇼핑",
				"구독": "구독", "의료": "의료비", "문화": "문화생활", "기타": "기타",
			}

			for cat, points := range catMap {
				if len(points) < 4 {
					continue
				}
				ws := &schedWelfordState{}
				var currentWeekTotal float64
				hasCurrentWeek := false
				for _, p := range points {
					wMon := time.Date(p.week.Year(), p.week.Month(), p.week.Day(), 0, 0, 0, 0, time.UTC)
					if !wMon.Before(thisWeekMonday) {
						currentWeekTotal = p.total
						hasCurrentWeek = true
					} else {
						ws.update(p.total)
					}
				}
				if !hasCurrentWeek || ws.count < 3 {
					continue
				}
				z := ws.zScore(currentWeekTotal)
				sev := schedAnomalySeverity(z)
				if sev != "high" && sev != "moderate" {
					continue
				}
				label := catLabels[cat]
				if label == "" {
					label = cat
				}
				ratio := currentWeekTotal / ws.mean
				var msg string
				if z > 0 {
					msg = fmt.Sprintf("이번 주 %s가 주간 평균보다 %.1f배 높아요", label, ratio)
				} else {
					msg = fmt.Sprintf("이번 주 %s가 주간 평균보다 %.0f%% 줄었어요", label, (1-ratio)*100)
				}
				signals = append(signals, schedAnomalySignal{Severity: sev, Message: msg})
			}
		}
	}

	// ── Signal 3: Stalled goals ───────────────────────────────────────────────
	{
		rows, err := s.db.QueryContext(ctx, `
			SELECT title, updated_at, due_date
			FROM planner_goals
			WHERE user_id = $1::uuid AND status = 'active'`, userID)
		if err == nil {
			now := time.Now()
			for rows.Next() {
				var title string
				var updatedAt time.Time
				var targetDate *time.Time
				if rows.Scan(&title, &updatedAt, &targetDate) != nil {
					continue
				}
				daysSince := now.Sub(updatedAt).Hours() / 24
				if daysSince < 7 {
					continue
				}
				sev := "mild"
				if daysSince >= 14 {
					sev = "moderate"
				}
				if daysSince >= 30 {
					sev = "high"
				}
				urgency := ""
				if targetDate != nil && targetDate.After(now) {
					daysLeft := targetDate.Sub(now).Hours() / 24
					if daysLeft < 14 {
						sev = "high"
						urgency = fmt.Sprintf(" (마감 %.0f일 전)", daysLeft)
					}
				}
				if sev != "high" && sev != "moderate" {
					continue
				}
				msg := fmt.Sprintf("'%s' 목표가 %.0f일째 진행이 멈췄어요%s", title, daysSince, urgency)
				signals = append(signals, schedAnomalySignal{Severity: sev, Message: msg})
			}
			rows.Close()
		}
	}

	// ── Signal 4: Monthly projected spending anomaly (6-month baseline) ───────
	{
		since6m := time.Now().AddDate(-1, 0, 0)
		rows, err := s.db.QueryContext(ctx, `
			SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
			       ABS(SUM(amount)) AS total
			FROM finances
			WHERE user_id = $1::uuid AND amount < 0 AND created_at >= $2
			GROUP BY month ORDER BY month`, userID, since6m)
		if err == nil {
			type monthPoint struct {
				month string
				total float64
			}
			var mpoints []monthPoint
			for rows.Next() {
				var mp monthPoint
				if rows.Scan(&mp.month, &mp.total) == nil {
					mpoints = append(mpoints, mp)
				}
			}
			rows.Close()

			thisMonth := time.Now().Format("2006-01")
			if len(mpoints) >= 4 {
				ws := &schedWelfordState{}
				var thisMonthTotal float64
				hasThisMonth := false
				for _, p := range mpoints {
					if p.month == thisMonth {
						thisMonthTotal = p.total
						hasThisMonth = true
					} else {
						ws.update(p.total)
					}
				}
				if hasThisMonth && ws.count >= 3 {
					dayOfMonth := float64(time.Now().Day())
					daysInMonth := float64(time.Date(time.Now().Year(), time.Now().Month()+1, 0, 0, 0, 0, 0, time.UTC).Day())
					projected := thisMonthTotal / dayOfMonth * daysInMonth
					z := ws.zScore(projected)
					sev := schedAnomalySeverity(z)
					if sev == "high" || sev == "moderate" {
						ratio := projected / ws.mean
						var msg string
						if z > 0 {
							msg = fmt.Sprintf("이번 달 지출이 월 평균보다 %.1f배 많을 것으로 예상돼요", ratio)
						} else {
							msg = fmt.Sprintf("이번 달 지출이 월 평균보다 %.0f%% 적을 것으로 예상돼요", (1-ratio)*100)
						}
						signals = append(signals, schedAnomalySignal{Severity: sev, Message: msg})
					}
				}
			}
		}
	}

	if len(signals) == 0 {
		return "", true
	}

	// Cap at 3 anomalies; prioritise high severity first.
	// Signals are already appended in detection order; just truncate.
	if len(signals) > 3 {
		signals = signals[:3]
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("🔔 오늘의 이상 감지 알림 (%d건)\n", len(signals)))
	for _, sig := range signals {
		sb.WriteString("• ")
		sb.WriteString(sig.Message)
		sb.WriteByte('\n')
	}
	return strings.TrimRight(sb.String(), "\n"), false
}

// formatKRW formats an integer as a comma-separated Korean Won amount (e.g. 1,234,567).
func formatKRW(amount int64) string {
	s := strconv.FormatInt(amount, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String()
}

// ── Maintenance ───────────────────────────────────────────────────────────────

// runMaintenance runs background DB cleanup tasks with no user-visible notification.
func (s *Scheduler) runMaintenance(ctx context.Context, jobID, userID string) {
	switch jobID {
	case "memory_compaction":
		res, err := s.db.ExecContext(ctx,
			`DELETE FROM knowledge_base
			 WHERE user_id = $1::uuid
			   AND key NOT LIKE 'schedule:%'
			   AND created_at < NOW() - INTERVAL '90 days'`,
			userID,
		)
		if err != nil {
			s.logger.Error("maintenance: memory_compaction failed",
				zap.String("user_id", userID), zap.Error(err))
			return
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			s.logger.Info("maintenance: memory_compaction done",
				zap.String("user_id", userID),
				zap.Int64("deleted_rows", n))
		}
	}
}

func matchDayOfWeek(dayName string, t time.Time) bool {
	switch strings.ToLower(dayName) {
	case "sunday":
		return t.Weekday() == time.Sunday
	case "monday":
		return t.Weekday() == time.Monday
	case "tuesday":
		return t.Weekday() == time.Tuesday
	case "wednesday":
		return t.Weekday() == time.Wednesday
	case "thursday":
		return t.Weekday() == time.Thursday
	case "friday":
		return t.Weekday() == time.Friday
	case "saturday":
		return t.Weekday() == time.Saturday
	case "weekday":
		wd := t.Weekday()
		return wd >= time.Monday && wd <= time.Friday
	case "weekend":
		wd := t.Weekday()
		return wd == time.Saturday || wd == time.Sunday
	default:
		return true // unknown value: always match (backward compat)
	}
}

// ── Cron Expression Parser ────────────────────────────────────────────────────
//
// Supports standard 5-field cron: minute hour dom month dow
// Fields: * (any), N (exact), N-M (range), */N (step), A,B,... (list)

func matchCron(expr string, t time.Time) bool {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return false
	}
	return matchField(parts[0], t.Minute()) &&
		matchField(parts[1], t.Hour()) &&
		matchField(parts[2], t.Day()) &&
		matchField(parts[3], int(t.Month())) &&
		matchField(parts[4], int(t.Weekday()))
}

func matchField(field string, val int) bool {
	if field == "*" {
		return true
	}
	// Step: */N
	if strings.HasPrefix(field, "*/") {
		if step, err := strconv.Atoi(field[2:]); err == nil && step > 0 {
			return val%step == 0
		}
		return false
	}
	// Comma-separated list
	for part := range strings.SplitSeq(field, ",") {
		part = strings.TrimSpace(part)
		// Range: N-M
		if idx := strings.Index(part, "-"); idx > 0 {
			lo, err1 := strconv.Atoi(part[:idx])
			hi, err2 := strconv.Atoi(part[idx+1:])
			if err1 == nil && err2 == nil && val >= lo && val <= hi {
				return true
			}
			continue
		}
		// Exact
		if n, err := strconv.Atoi(part); err == nil && n == val {
			return true
		}
	}
	return false
}
