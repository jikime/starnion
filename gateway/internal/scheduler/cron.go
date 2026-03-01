package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// TelegramSender can send messages to Telegram users.
type TelegramSender interface {
	SendMessage(chatID int64, text string) error
}

// Scheduler manages periodic tasks such as weekly reports.
type Scheduler struct {
	cron       *cron.Cron
	grpcClient jikiv1.AgentServiceClient
	telegram   TelegramSender
	db         *sql.DB
}

// New creates a Scheduler connected to the agent gRPC service and database.
func New(grpcConn *grpc.ClientConn, telegram TelegramSender, db *sql.DB) *Scheduler {
	// Use KST (UTC+9) location for cron schedule.
	loc, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		log.Warn().Msg("failed to load Asia/Seoul timezone, using UTC")
		loc = time.UTC
	}

	return &Scheduler{
		cron:       cron.New(cron.WithLocation(loc)),
		grpcClient: jikiv1.NewAgentServiceClient(grpcConn),
		telegram:   telegram,
		db:         db,
	}
}

// Start registers cron jobs and begins the scheduler.
func (s *Scheduler) Start() {
	// Weekly report: every Monday at 09:00 KST.
	_, err := s.cron.AddFunc("0 9 * * 1", func() {
		s.sendWeeklyReports()
	})
	if err != nil {
		log.Error().Err(err).Msg("failed to register weekly report cron job")
		return
	}

	s.cron.Start()
	log.Info().Msg("scheduler started (weekly report: Mon 09:00 KST)")
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
		if err := s.GenerateAndSend(u.telegramID, u.chatID); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("weekly report failed")
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

// GenerateAndSend generates a report for a user and sends it via Telegram.
// Exported so it can be called from HTTP endpoints for testing.
func (s *Scheduler) GenerateAndSend(userID string, chatID int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := s.grpcClient.GenerateReport(ctx, &jikiv1.ReportRequest{
		UserId:     userID,
		ReportType: "weekly",
	})
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to generate report")
		return fmt.Errorf("generate report: %w", err)
	}

	if resp.Content == "" {
		log.Warn().Str("user_id", userID).Msg("empty report content, skipping send")
		return nil
	}

	if err := s.telegram.SendMessage(chatID, resp.Content); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to send report via telegram")
		return fmt.Errorf("send report: %w", err)
	}

	log.Info().Str("user_id", userID).Msg("weekly report sent")
	return nil
}

// activeUser represents a user eligible for proactive notifications.
type activeUser struct {
	telegramID string
	chatID     int64
}

// getActiveUsers queries the profiles table for users with finance records
// in the last 30 days (i.e. active users who would benefit from a report).
func (s *Scheduler) getActiveUsers() ([]activeUser, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT p.telegram_id
		FROM profiles p
		JOIN finances f ON f.user_id = p.telegram_id
		WHERE f.created_at >= NOW() - INTERVAL '30 days'
		ORDER BY p.telegram_id
	`)
	if err != nil {
		return nil, fmt.Errorf("query active users: %w", err)
	}
	defer rows.Close()

	var users []activeUser
	for rows.Next() {
		var telegramID string
		if err := rows.Scan(&telegramID); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}

		// Telegram chat ID = telegram user ID for DMs.
		chatID, err := strconv.ParseInt(telegramID, 10, 64)
		if err != nil {
			log.Warn().Str("telegram_id", telegramID).Msg("invalid telegram_id, skipping")
			continue
		}

		users = append(users, activeUser{
			telegramID: telegramID,
			chatID:     chatID,
		})
	}

	return users, rows.Err()
}
