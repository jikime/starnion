package scheduler

import (
	"context"
	"encoding/json"
	"time"

	"go.uber.org/zap"
)

// ── System Jobs ───────────────────────────────────────────────────────────────

// Job is the single source of truth for a built-in scheduler job. The HTTP
// layer (`handler/cron.go`) imports BuiltinJobs and enriches each entry
// with UI-only metadata (name, description, level) keyed by ID. This keeps
// cron expressions, action types, and default-enabled state authoritative
// in one place and eliminates the drift that used to happen between
// scheduler.BuiltinJobs and handler.builtinSystemJobs.
type Job struct {
	ID             string
	CronExpr       string
	ActionType     string // "report" | "notify" | "smart_notify" | "maintenance"
	DefaultEnabled bool   // false = opt-in (user must explicitly enable)
	ReportType     string // report params
	NotifType      string // notify params
	Message        string // notify params (static message)
}

// BuiltinJobs is the canonical list of scheduler built-ins. The handler
// package iterates this slice when responding to /api/v1/cron/system so
// there is no second copy to keep in sync.
var BuiltinJobs = []Job{
	// Level 1: Rule-Based
	{ID: "daily_summary", CronExpr: "0 21 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "daily_summary"},
	{ID: "weekly_report", CronExpr: "0 20 * * 0", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "weekly_report"},
	{ID: "monthly_closing", CronExpr: "0 21 1 * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "monthly_closing"},
	{ID: "inactive_reminder", CronExpr: "0 20 * * *", ActionType: "notify", DefaultEnabled: true,
		NotifType: "inactive_reminder", Message: "오늘 하루 어떠셨나요? 오늘의 한마디나 노트를 작성해보세요."},
	{ID: "budget_warning", CronExpr: "0 21 * * *", ActionType: "notify", DefaultEnabled: true,
		NotifType: "budget_warning", Message: "오늘 예산 현황을 확인해보세요."},
	// Level 2: Pattern-Learning
	{ID: "planner_task_reminder", CronExpr: "0 9 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "planner_task_reminder"},
	{ID: "planner_goal_dday", CronExpr: "0 8 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "planner_goal_dday"},
	{ID: "spending_anomaly", CronExpr: "0 */3 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "spending_anomaly"},
	{ID: "anomaly_insights", CronExpr: "0 9 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "anomaly_insights"},
	{ID: "pattern_analysis", CronExpr: "0 6 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "pattern_analysis"},
	{ID: "pattern_insight", CronExpr: "0 14 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "pattern_insight"},
	{ID: "conversation_analysis", CronExpr: "0 10 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "conversation_analysis"},
	// Level 3: External Content
	{ID: "daily_weather", CronExpr: "0 6 * * *", ActionType: "smart_notify", DefaultEnabled: true,
		NotifType: "daily_weather"},
	// Level 3b: Naver Search API — default OFF (requires Naver API key)
	{ID: "daily_news", CronExpr: "0 7 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "daily_news"},
	{ID: "local_events", CronExpr: "0 12 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "local_events"},
	{ID: "it_blog_digest", CronExpr: "0 18 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "it_blog_digest"},
	// Level 3c: Tavily Search API — default OFF (requires Tavily API key)
	{ID: "tavily_news", CronExpr: "30 8 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "tavily_news"},
	// Level 3d: Google Workspace — default OFF (requires Google OAuth)
	{ID: "google_calendar_digest", CronExpr: "0 8 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "google_calendar_digest"},
	{ID: "google_gmail_digest", CronExpr: "0 8 * * *", ActionType: "smart_notify", DefaultEnabled: false,
		NotifType: "google_gmail_digest"},
	// Level 5: Maintenance
	{ID: "memory_compaction", CronExpr: "0 5 * * 1", ActionType: "maintenance", DefaultEnabled: true},
}

// runSystemJobs evaluates all builtin jobs for the current minute.
//
// Cron expressions are interpreted in each user's local timezone
// (preferences->>'timezone', defaulting to "Asia/Seoul").  This means
// "0 8 * * *" fires at 08:00 the user's local time, regardless of the
// server's system timezone.
//
// Implementation: one SQL query loads every user per tick (previously N per
// tick, one per job). time.LoadLocation is memoised so typical deployments
// with a small set of distinct timezones pay the zoneinfo file read once per
// minute instead of N_users × N_jobs times.
func (s *Scheduler) runSystemJobs(ctx context.Context, now time.Time) {
	queryCtx, queryCancel := context.WithTimeout(ctx, 10*time.Second)
	defer queryCancel()

	const userQuery = `SELECT id::text,
	                         COALESCE(preferences->>'timezone', 'Asia/Seoul') AS tz,
	                         COALESCE(preferences->'scheduler'->'disabled_jobs', '[]'::jsonb) AS disabled,
	                         COALESCE(preferences->'scheduler'->'enabled_jobs',  '[]'::jsonb) AS enabled
	                    FROM users`

	rows, err := s.db.Pool().Query(queryCtx, userQuery)
	if err != nil {
		s.logger.Error("scheduler: load users for system jobs failed", zap.Error(err))
		return
	}

	type userTick struct {
		id       string
		localNow time.Time
		disabled map[string]struct{}
		enabled  map[string]struct{}
	}

	// Cache (tz → *time.Location) for this tick only. One-shot map beats
	// per-user + per-job LoadLocation calls which read zoneinfo from disk.
	locCache := make(map[string]*time.Location, 4)
	lookupLoc := func(tz string) *time.Location {
		if loc, ok := locCache[tz]; ok {
			return loc
		}
		loc, err := time.LoadLocation(tz)
		if err != nil {
			if fallback, ok := locCache["Asia/Seoul"]; ok {
				locCache[tz] = fallback
				return fallback
			}
			loc, _ = time.LoadLocation("Asia/Seoul")
		}
		locCache[tz] = loc
		return loc
	}

	var users []userTick
	for rows.Next() {
		var id, tz string
		var disabledRaw, enabledRaw []byte
		if err := rows.Scan(&id, &tz, &disabledRaw, &enabledRaw); err != nil {
			s.logger.Debug("scheduler: user row scan failed", zap.Error(err))
			continue
		}
		users = append(users, userTick{
			id:       id,
			localNow: now.In(lookupLoc(tz)),
			disabled: parseJobIDSet(disabledRaw),
			enabled:  parseJobIDSet(enabledRaw),
		})
	}
	if err := rows.Err(); err != nil {
		s.logger.Warn("scheduler: user row iteration error", zap.Error(err))
	}
	rows.Close()

	if len(users) == 0 {
		return
	}

	// Bounded worker pool — at most maxConcurrentDispatches goroutines
	// can run a job handler at once. This caps the 21:00 fan-out burst
	// (previously unlimited: 500 users × 7 smart_notify = 3.5k concurrent
	// goroutines + external HTTP/LLM calls) so the scheduler no longer
	// exhausts the DB pool or outbound connection limits.
	dispatch := func(job Job, uid string) {
		select {
		case schedulerWorkerSem <- struct{}{}:
		case <-ctx.Done():
			return
		}
		go func() {
			defer func() { <-schedulerWorkerSem }()
			switch job.ActionType {
			case "notify":
				if err := s.notifyFn(ctx, uid, job.NotifType, job.Message); err != nil {
					s.logger.Error("scheduler: system notify failed",
						zap.String("job_id", job.ID),
						zap.String("user_id", uid),
						zap.Error(err))
				}
			case "smart_notify":
				msg, skip := s.computeSmartNotify(ctx, uid, job.ID)
				if skip {
					return
				}
				if err := s.notifyFn(ctx, uid, job.NotifType, msg); err != nil {
					s.logger.Error("scheduler: smart notify failed",
						zap.String("job_id", job.ID),
						zap.String("user_id", uid),
						zap.Error(err))
				}
			case "maintenance":
				s.runMaintenance(ctx, job.ID, uid)
			}
		}()
	}

	for _, job := range BuiltinJobs {
		firing := 0
		for _, u := range users {
			// Per-user enable/disable gate.
			if job.DefaultEnabled {
				if _, off := u.disabled[job.ID]; off {
					continue
				}
			} else {
				if _, on := u.enabled[job.ID]; !on {
					continue
				}
			}
			if !matchCron(job.CronExpr, u.localNow) {
				continue
			}
			dispatch(job, u.id)
			firing++
		}
		if firing > 0 {
			s.logger.Info("scheduler: system job triggered",
				zap.String("id", job.ID),
				zap.Int("users", firing))
		}
	}
}

// parseJobIDSet decodes a JSONB string array (["jobA", "jobB"]) into a
// set-shaped map[string]struct{}. Nil / empty / malformed input yields nil
// which callers can probe with `_, ok := m[key]`.
func parseJobIDSet(data []byte) map[string]struct{} {
	// Fast path: empty document or PG default `'[]'::jsonb` is 2 bytes.
	// parseJobIDSet runs once per user per tick × 18 jobs, so the 99%
	// "no disabled jobs" case should not allocate or enter the JSON
	// parser at all.
	if len(data) == 0 || len(data) == 2 && data[0] == '[' && data[1] == ']' {
		return nil
	}
	var arr []string
	if err := json.Unmarshal(data, &arr); err != nil || len(arr) == 0 {
		return nil
	}
	set := make(map[string]struct{}, len(arr))
	for _, id := range arr {
		set[id] = struct{}{}
	}
	return set
}
