package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
	"github.com/jikime/starnion/gateway/internal/activity"
	"github.com/jikime/starnion/gateway/internal/skill"
	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// TelegramSender can send messages to Telegram users.
type TelegramSender interface {
	SendMessage(chatID int64, text string) error
}

// Scheduler manages periodic tasks such as weekly reports and proactive notifications.
type Scheduler struct {
	cron       *cron.Cron
	grpcClient starnionv1.AgentServiceClient
	telegram   TelegramSender
	db         *sql.DB
	fatigue    *fatigueManager
	loc        *time.Location
	// Activity tracker for idle detection (conversation analysis).
	tracker        *activity.Tracker
	analysisMu     sync.RWMutex
	analysisStates map[string]time.Time // userID (UUID) -> lastMsgTime when last analyzed
	skillService   *skill.Service
}

// New creates a Scheduler connected to the agent gRPC service and database.
func New(grpcConn *grpc.ClientConn, telegram TelegramSender, db *sql.DB, tracker *activity.Tracker, skillSvc *skill.Service) *Scheduler {
	// Use KST (UTC+9) location for cron schedule.
	loc, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		log.Warn().Msg("failed to load Asia/Seoul timezone, using UTC")
		loc = time.UTC
	}

	return &Scheduler{
		cron:           cron.New(cron.WithLocation(loc)),
		grpcClient:     starnionv1.NewAgentServiceClient(grpcConn),
		telegram:       telegram,
		db:             db,
		fatigue:        newFatigueManager(tracker, loc),
		loc:            loc,
		tracker:        tracker,
		analysisStates: make(map[string]time.Time),
		skillService:   skillSvc,
	}
}

// Start registers cron jobs and begins the scheduler.
func (s *Scheduler) Start() {
	jobs := []struct {
		schedule string
		name     string
		fn       func()
	}{
		// Level 1: Rule-Based
		{"0 9 * * 1", "weekly_report", s.sendWeeklyReports},
		{"0 * * * *", "budget_warning", s.runBudgetWarningRule},
		{"0 21 * * *", "daily_summary", s.runDailySummaryRule},
		{"0 20 * * *", "inactive_reminder", s.runInactiveReminderRule},
		{"0 21 28-31 * *", "monthly_closing", s.runMonthlyClosingRule},

		// Level 2: Pattern-Learning
		{"0 6 * * *", "pattern_analysis", s.runPatternAnalysisRule},
		{"0 */3 * * *", "spending_anomaly", s.runSpendingAnomalyRule},
		{"0 14 * * *", "pattern_insight", s.runPatternInsightRule},
		{"*/10 * * * *", "conversation_analysis", s.runConversationAnalysisRule},

		// Level 3: Autonomous Agent
		{"0 7 * * *", "goal_evaluation", s.runGoalEvaluationRule},
		{"0 12 * * 3", "goal_status", s.runGoalStatusRule},
		{"0 8 * * *", "dday_notification", s.runDdayNotificationRule},

		// Level 4: User-Created Schedules
		{"*/15 * * * *", "user_schedules", s.runUserSchedulesRule},

		// Level 5: Maintenance
		{"0 5 * * 1", "memory_compaction", s.runMemoryCompactionRule},
	}

	registered := 0
	for _, j := range jobs {
		if _, err := s.cron.AddFunc(j.schedule, j.fn); err != nil {
			log.Error().Err(err).Str("job", j.name).Msg("failed to register cron job")
		} else {
			registered++
		}
	}

	s.cron.Start()
	log.Info().Int("jobs", registered).Msg("scheduler started with proactive notification rules")
}

// Stop gracefully shuts down the scheduler.
func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Info().Msg("scheduler stopped")
}

// sendWeeklyReports queries active users from DB and sends weekly reports.
func (s *Scheduler) sendWeeklyReports() {
	log.Info().Msg("generating weekly reports for all active users")

	users, err := s.getActiveUsers()
	if err != nil {
		log.Error().Err(err).Msg("failed to query active users")
		return
	}

	if len(users) == 0 {
		log.Info().Msg("no active users found, skipping weekly reports")
		return
	}

	var successCount, failCount int
	for _, u := range users {
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "finance") {
			continue
		}
		if err := s.GenerateAndSend(u.userID, u.chatID); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("weekly report failed")
			failCount++
		} else {
			successCount++
		}
	}

	log.Info().
		Int("success", successCount).
		Int("failed", failCount).
		Int("total", len(users)).
		Msg("weekly reports completed")
}

// GenerateAndSend generates a weekly report for a user and sends it via Telegram.
// Exported so it can be called from HTTP endpoints for testing.
func (s *Scheduler) GenerateAndSend(userID string, chatID int64) error {
	return s.GenerateAndSendType(userID, chatID, "weekly")
}

// GenerateAndSendType generates a report of the given type and sends it via Telegram.
func (s *Scheduler) GenerateAndSendType(userID string, chatID int64, reportType string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := s.grpcClient.GenerateReport(ctx, &starnionv1.ReportRequest{
		UserId:     userID,
		ReportType: reportType,
	})
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("type", reportType).Msg("failed to generate report")
		return fmt.Errorf("generate %s report: %w", reportType, err)
	}

	if resp.Content == "" {
		log.Warn().Str("user_id", userID).Str("type", reportType).Msg("empty report content, skipping send")
		return nil
	}

	// Persist the report to DB regardless of Telegram delivery.
	s.saveReport(userID, reportType, resp.Content)

	if err := s.telegram.SendMessage(chatID, resp.Content); err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("type", reportType).Msg("failed to send report via telegram")
		return fmt.Errorf("send %s report: %w", reportType, err)
	}

	log.Info().Str("user_id", userID).Str("type", reportType).Msg("report sent")
	return nil
}

// saveReport persists a generated report to the reports table.
func (s *Scheduler) saveReport(userID, reportType, content string) {
	if s.db == nil {
		return
	}
	title := buildReportTitle(reportType, s.loc)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO reports (user_id, report_type, title, content)
		VALUES ($1, $2, $3, $4)
	`, userID, reportType, title, content); err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("type", reportType).Msg("failed to save report")
	}
}

// buildReportTitle generates a localized Korean title for a report.
func buildReportTitle(reportType string, loc *time.Location) string {
	now := time.Now().In(loc)
	switch reportType {
	case "daily":
		return fmt.Sprintf("%d년 %s %s 일간 요약", now.Year(), now.Format("01월"), now.Format("02일"))
	case "weekly":
		_, week := now.ISOWeek()
		return fmt.Sprintf("%d년 %s %d주차 주간 리포트", now.Year(), now.Format("01월"), week)
	case "monthly":
		return fmt.Sprintf("%d년 %s 월간 리포트", now.Year(), now.Format("01월"))
	case "anomaly":
		return now.Format("2006-01-02") + " 소비 이상 감지"
	case "pattern":
		return now.Format("2006-01-02") + " 패턴 인사이트"
	case "goal":
		return now.Format("2006-01-02") + " 목표 달성 현황"
	default:
		return now.Format("2006-01-02") + " " + reportType
	}
}

// activeUser represents a user eligible for proactive notifications.
type activeUser struct {
	userID string // internal UUID (for gRPC / DB calls)
	chatID int64  // Telegram chat ID (for message delivery)
}

// getActiveUsers queries users with finance records in the last 30 days.
// Post-migration: finances.user_id is UUID; JOIN platform_identities to get Telegram chatID.
func (s *Scheduler) getActiveUsers() ([]activeUser, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT f.user_id, pi.platform_id
		FROM finances f
		JOIN platform_identities pi ON pi.user_id = f.user_id AND pi.platform = 'telegram'
		WHERE f.created_at >= NOW() - INTERVAL '30 days'
		ORDER BY f.user_id
	`)
	if err != nil {
		return nil, fmt.Errorf("query active users: %w", err)
	}
	defer rows.Close()

	return scanActiveUsers(rows)
}
