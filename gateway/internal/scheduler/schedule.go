package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// scheduleData represents a user-created schedule stored in knowledge_base.
type scheduleData struct {
	Title      string       `json:"title"`
	Type       string       `json:"type"` // one_time / recurring
	ReportType string       `json:"report_type"`
	Schedule   scheduleTime `json:"schedule"`
	Status     string       `json:"status"`
	Message    string       `json:"message"`
	LastSent   string       `json:"last_sent"`
	CreatedAt  string       `json:"created_at"`
}

// scheduleTime holds the timing configuration for a schedule.
type scheduleTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
}

// scheduleEntry pairs a knowledge_base row with its parsed schedule data.
type scheduleEntry struct {
	id       int
	userID   string
	key      string
	data     scheduleData
	rawValue string
}

// runUserSchedulesRule polls knowledge_base for user-created schedules and
// sends notifications when the scheduled time matches the current 15-min window.
func (s *Scheduler) runUserSchedulesRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	entries, err := getActiveSchedules(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("user schedules: failed to query schedules")
		return
	}

	if len(entries) == 0 {
		return
	}

	now := time.Now().In(s.loc)
	var sentCount int

	for _, entry := range entries {
		if s.skillService != nil && !s.skillService.IsEnabled(entry.userID, "schedule") {
			continue
		}
		if !isScheduleDue(entry, now) {
			continue
		}

		// Look up Telegram platform_id for this UUID user.
		// knowledge_base.user_id is UUID post-migration 005.
		var platformID string
		if lookupErr := s.db.QueryRowContext(ctx,
			`SELECT platform_id FROM platform_identities WHERE user_id = $1 AND platform = 'telegram'`,
			entry.userID,
		).Scan(&platformID); lookupErr != nil {
			log.Warn().Str("user_id", entry.userID).Msg("user schedules: no telegram platform for user, skipping")
			continue
		}
		chatID, chatErr := strconv.ParseInt(platformID, 10, 64)
		if chatErr != nil {
			log.Warn().Str("user_id", entry.userID).Str("platform_id", platformID).Msg("user schedules: invalid telegram platform_id, skipping")
			continue
		}

		// 사용자가 직접 만든 일정은 명시적 의도이므로 fatigue 제한(조용한 시간,
		// 일일 한도, 대화 중 유예)을 건너뛴다. 단, 전체 알림 비활성화 설정은 존중한다.
		prefs := s.loadPreferences(entry.userID)
		if !notificationsEnabled(prefs) {
			log.Debug().
				Str("user_id", entry.userID).
				Str("schedule", entry.key).
				Msg("user schedules: notifications disabled by preference, skipping")
			continue
		}

		// Send notification.
		var sendErr error
		if entry.data.ReportType == "custom_reminder" {
			msg := entry.data.Message
			if msg == "" {
				msg = entry.data.Title
			}
			sendErr = s.telegram.SendMessage(chatID, msg)
		} else {
			sendErr = s.GenerateAndSendType(entry.userID, chatID, entry.data.ReportType)
		}

		if sendErr != nil {
			log.Error().Err(sendErr).
				Str("user_id", entry.userID).
				Str("schedule", entry.key).
				Msg("user schedules: send failed")
			continue
		}

		// 사용자 일정은 시스템 proactive 알림 한도에 포함하지 않는다.
		// (사용자가 요청한 알림이 시스템 알림 발송을 막으면 안 되므로)

		// Update schedule state.
		if entry.data.Type == "one_time" {
			if err := markScheduleCompleted(ctx, s.db, entry); err != nil {
				log.Error().Err(err).Str("key", entry.key).Msg("user schedules: mark completed failed")
			}
		} else {
			if err := updateScheduleLastSent(ctx, s.db, entry, now); err != nil {
				log.Error().Err(err).Str("key", entry.key).Msg("user schedules: update last_sent failed")
			}
		}

		sentCount++
		log.Info().
			Str("user_id", entry.userID).
			Str("title", entry.data.Title).
			Str("type", entry.data.ReportType).
			Msg("user scheduled notification sent")
	}

	if sentCount > 0 {
		log.Info().Int("sent", sentCount).Msg("user scheduled notifications completed")
	}
}

// getActiveSchedules queries knowledge_base for all active user-created schedules.
func getActiveSchedules(ctx context.Context, db *sql.DB) ([]scheduleEntry, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, user_id, key, value
		FROM knowledge_base
		WHERE key LIKE 'schedule:%'
		  AND value::jsonb->>'status' = 'active'
		ORDER BY user_id, key
	`)
	if err != nil {
		return nil, fmt.Errorf("query schedules: %w", err)
	}
	defer rows.Close()

	var entries []scheduleEntry
	for rows.Next() {
		var e scheduleEntry
		if err := rows.Scan(&e.id, &e.userID, &e.key, &e.rawValue); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}

		if err := json.Unmarshal([]byte(e.rawValue), &e.data); err != nil {
			log.Warn().
				Str("key", e.key).
				Str("user_id", e.userID).
				Msg("user schedules: invalid JSON, skipping")
			continue
		}

		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// isScheduleDue checks if a schedule entry should fire at the given time.
func isScheduleDue(entry scheduleEntry, now time.Time) bool {
	sched := entry.data.Schedule

	// Check date for one_time schedules.
	if entry.data.Type == "one_time" {
		if sched.Date == "" {
			return false
		}
		todayStr := now.Format("2006-01-02")
		if sched.Date != todayStr {
			return false
		}
	}

	// Check day_of_week for recurring schedules.
	if entry.data.Type == "recurring" && sched.DayOfWeek != "" {
		todayDOW := strings.ToLower(now.Weekday().String())
		if sched.DayOfWeek != todayDOW {
			return false
		}
	}

	// Check last_sent to prevent duplicate sends on the same day.
	if entry.data.LastSent != "" {
		todayStr := now.Format("2006-01-02")
		if entry.data.LastSent == todayStr {
			return false
		}
	}

	// Check if we're within the 15-minute window of the scheduled time.
	schedMins := sched.Hour*60 + sched.Minute
	nowMins := now.Hour()*60 + now.Minute()

	return nowMins >= schedMins && nowMins < schedMins+15
}

// markScheduleCompleted sets a one_time schedule's status to "completed".
func markScheduleCompleted(ctx context.Context, db *sql.DB, entry scheduleEntry) error {
	entry.data.Status = "completed"
	return updateScheduleValue(ctx, db, entry)
}

// updateScheduleLastSent updates the last_sent field for recurring schedules.
func updateScheduleLastSent(ctx context.Context, db *sql.DB, entry scheduleEntry, now time.Time) error {
	entry.data.LastSent = now.Format("2006-01-02")
	return updateScheduleValue(ctx, db, entry)
}

// updateScheduleValue writes the updated schedule data back to knowledge_base.
func updateScheduleValue(ctx context.Context, db *sql.DB, entry scheduleEntry) error {
	newValue, err := json.Marshal(entry.data)
	if err != nil {
		return fmt.Errorf("marshal schedule: %w", err)
	}

	_, err = db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE id = $2`,
		string(newValue), entry.id,
	)
	if err != nil {
		return fmt.Errorf("update schedule: %w", err)
	}

	return nil
}
