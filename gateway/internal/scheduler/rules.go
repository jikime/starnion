package scheduler

import (
	"context"
	"fmt"
	"strings"
	"time"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/rs/zerolog/log"
)

// --- Budget Warning Rule ---

// runBudgetWarningRule checks all users with budgets for >= 90% usage
// and sends template notifications for over-budget categories.
func (s *Scheduler) runBudgetWarningRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getBudgetUsers(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("budget warning: failed to query budget users")
		return
	}

	for _, u := range users {
		spending, err := getCategorySpending(ctx, s.db, u.telegramID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("budget warning: failed to query spending")
			continue
		}

		var alerts []string
		for category, budget := range u.budgets {
			if budget <= 0 {
				continue
			}
			spent, ok := spending[category]
			if !ok {
				continue
			}
			pct := float64(spent) / float64(budget) * 100
			if pct >= 90 {
				remaining := budget - spent
				if remaining < 0 {
					remaining = 0
				}
				alerts = append(alerts, fmt.Sprintf(
					"%s 예산을 거의 다 사용했어요!\n사용: %s원 / %s원 (%.0f%%)\n남은 금액: %s원",
					category, formatNumber(spent), formatNumber(budget), pct, formatNumber(remaining),
				))
			}
		}

		if len(alerts) == 0 {
			continue
		}

		message := "⚠️ 예산 알림\n\n" + strings.Join(alerts, "\n\n")
		if err := s.sendTemplateNotification(u.telegramID, u.chatID, u.preferences, message); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("budget warning: send failed")
		}
	}
}

// --- Daily Summary Rule ---

// runDailySummaryRule sends LLM-generated daily summaries to users with records today.
func (s *Scheduler) runDailySummaryRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getUsersWithRecordsToday(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("daily summary: failed to query users")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("daily summary: no users with records today")
		return
	}

	log.Info().Int("users", len(users)).Msg("generating daily summaries")

	for _, u := range users {
		if err := s.sendGeneratedNotification(u, "daily_summary"); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("daily summary: send failed")
		}
	}
}

// --- Inactive Reminder Rule ---

// runInactiveReminderRule sends template reminders to users inactive for 3+ days.
func (s *Scheduler) runInactiveReminderRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getInactiveUsers(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("inactive reminder: failed to query users")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("inactive reminder: no inactive users found")
		return
	}

	log.Info().Int("users", len(users)).Msg("sending inactive reminders")

	message := "👋 요즘 어떻게 지내세요?\n\n기록을 남기신 지 좀 됐어요.\n간단하게라도 오늘 지출을 기록해 보는 건 어때요?"

	for _, u := range users {
		prefs := s.loadPreferences(u.telegramID)
		if err := s.sendTemplateNotification(u.telegramID, u.chatID, prefs, message); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("inactive reminder: send failed")
		}
	}
}

// --- Monthly Closing Rule ---

// runMonthlyClosingRule sends LLM-generated monthly summaries on the last day of the month.
func (s *Scheduler) runMonthlyClosingRule() {
	// Guard: only run on the actual last day of the month.
	if !isLastDayOfMonth(s.loc) {
		log.Debug().Msg("monthly closing: not last day of month, skipping")
		return
	}

	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getUsersWithRecordsThisMonth(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("monthly closing: failed to query users")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("monthly closing: no users with records this month")
		return
	}

	log.Info().Int("users", len(users)).Msg("generating monthly closing reports")

	for _, u := range users {
		if err := s.sendGeneratedNotification(u, "monthly_closing"); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("monthly closing: send failed")
		}
	}
}

// --- Level 2: Pattern-Learning Rules ---

// runPatternAnalysisRule triggers LLM-based pattern analysis for all active users.
// Runs daily at 06:00 KST. Results are stored in knowledge_base (not sent to users).
func (s *Scheduler) runPatternAnalysisRule() {
	if s.db == nil {
		return
	}

	users, err := s.getActiveUsers()
	if err != nil {
		log.Error().Err(err).Msg("pattern analysis: failed to query active users")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("pattern analysis: no active users")
		return
	}

	log.Info().Int("users", len(users)).Msg("running pattern analysis")

	var successCount, failCount int
	for _, u := range users {
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		resp, err := s.grpcClient.GenerateReport(ctx, &jikiv1.ReportRequest{
			UserId:     u.telegramID,
			ReportType: "pattern_analysis",
		})
		cancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("pattern analysis: gRPC failed")
			failCount++
			continue
		}
		log.Info().Str("user_id", u.telegramID).Str("result", resp.Content).Msg("pattern analysis complete")
		successCount++
	}

	log.Info().Int("success", successCount).Int("failed", failCount).Msg("pattern analysis finished")
}

// runSpendingAnomalyRule detects spending anomalies by comparing today's total
// against the 30-day daily average. Sends template notification if > 200%.
func (s *Scheduler) runSpendingAnomalyRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getUsersWithRecordsToday(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("spending anomaly: failed to query users")
		return
	}

	if len(users) == 0 {
		return
	}

	for _, u := range users {
		stats, err := getDailySpendingStats(ctx, s.db, u.telegramID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("spending anomaly: query failed")
			continue
		}

		// Need at least 7 days of data for meaningful comparison.
		if stats.daysWithData < 7 || stats.dailyAvg == 0 {
			continue
		}

		pct := float64(stats.todayTotal) / float64(stats.dailyAvg) * 100
		if pct < 200 {
			continue
		}

		message := fmt.Sprintf(
			"⚠️ 지출 이상 감지\n\n"+
				"오늘 총 지출: %s원\n"+
				"최근 30일 일평균: %s원 (%.0f%%)\n\n"+
				"평소보다 많이 사용하고 있어요. 한번 확인해 보세요!",
			formatNumber(stats.todayTotal),
			formatNumber(stats.dailyAvg),
			pct,
		)

		prefs := s.loadPreferences(u.telegramID)
		if err := s.sendTemplateNotification(u.telegramID, u.chatID, prefs, message); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("spending anomaly: send failed")
		}
	}
}

// runPatternInsightRule checks stored patterns for trigger matches and sends
// LLM-generated personalized notifications.
func (s *Scheduler) runPatternInsightRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := s.getActiveUsers()
	if err != nil {
		log.Error().Err(err).Msg("pattern insight: failed to query active users")
		return
	}

	now := time.Now().In(s.loc)
	var insightCount int

	for _, u := range users {
		patternJSON, err := getStoredPatterns(ctx, s.db, u.telegramID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("pattern insight: read failed")
			continue
		}
		if patternJSON == "" {
			continue
		}

		analysis, err := parsePatterns(patternJSON)
		if err != nil {
			log.Warn().Err(err).Str("user_id", u.telegramID).Msg("pattern insight: parse failed")
			continue
		}

		triggered := triggeredPatterns(analysis, now)
		if len(triggered) == 0 {
			continue
		}

		log.Info().
			Str("user_id", u.telegramID).
			Int("triggered", len(triggered)).
			Msg("pattern triggers matched, generating insight")

		if err := s.sendGeneratedNotification(u, "pattern_insight"); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("pattern insight: send failed")
			continue
		}
		insightCount++
	}

	if insightCount > 0 {
		log.Info().Int("sent", insightCount).Msg("pattern insights sent")
	}
}

// --- Level 3: Autonomous Agent Rules ---

// runGoalEvaluationRule evaluates progress on all active goals.
// Runs daily at 07:00 KST. Results are stored in knowledge_base (not sent to users).
func (s *Scheduler) runGoalEvaluationRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getUsersWithGoals(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("goal evaluation: failed to query users with goals")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("goal evaluation: no users with active goals")
		return
	}

	log.Info().Int("users", len(users)).Msg("running goal evaluation")

	var successCount, failCount int
	for _, u := range users {
		rctx, rcancel := context.WithTimeout(context.Background(), 180*time.Second)
		resp, err := s.grpcClient.GenerateReport(rctx, &jikiv1.ReportRequest{
			UserId:     u.telegramID,
			ReportType: "goal_evaluate",
		})
		rcancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("goal evaluation: gRPC failed")
			failCount++
			continue
		}
		log.Info().Str("user_id", u.telegramID).Str("result", resp.Content).Msg("goal evaluation complete")
		successCount++
	}

	log.Info().Int("success", successCount).Int("failed", failCount).Msg("goal evaluation finished")
}

// runGoalStatusRule sends weekly goal progress notifications.
// Runs on Wednesdays at 12:00 KST.
func (s *Scheduler) runGoalStatusRule() {
	if s.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	users, err := getUsersWithGoals(ctx, s.db)
	if err != nil {
		log.Error().Err(err).Msg("goal status: failed to query users with goals")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("goal status: no users with active goals")
		return
	}

	log.Info().Int("users", len(users)).Msg("generating goal status reports")

	for _, u := range users {
		if err := s.sendGeneratedNotification(u, "goal_status"); err != nil {
			log.Error().Err(err).Str("user_id", u.telegramID).Msg("goal status: send failed")
		}
	}
}

// --- Helpers ---

// sendTemplateNotification sends a pre-formatted message with fatigue checks.
func (s *Scheduler) sendTemplateNotification(telegramID string, chatID int64, preferences map[string]any, message string) error {
	if !s.fatigue.canNotify(telegramID, preferences) {
		return nil
	}

	if err := s.telegram.SendMessage(chatID, message); err != nil {
		return fmt.Errorf("send template: %w", err)
	}

	s.fatigue.recordNotification(telegramID)
	log.Info().Str("user_id", telegramID).Msg("proactive template notification sent")
	return nil
}

// sendGeneratedNotification calls gRPC to generate a report, then sends it with fatigue checks.
func (s *Scheduler) sendGeneratedNotification(user activeUser, reportType string) error {
	prefs := s.loadPreferences(user.telegramID)
	if !s.fatigue.canNotify(user.telegramID, prefs) {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := s.grpcClient.GenerateReport(ctx, &jikiv1.ReportRequest{
		UserId:     user.telegramID,
		ReportType: reportType,
	})
	if err != nil {
		return fmt.Errorf("generate %s: %w", reportType, err)
	}

	if resp.Content == "" {
		log.Warn().Str("user_id", user.telegramID).Str("type", reportType).Msg("empty report, skipping")
		return nil
	}

	if err := s.telegram.SendMessage(user.chatID, resp.Content); err != nil {
		return fmt.Errorf("send %s: %w", reportType, err)
	}

	s.fatigue.recordNotification(user.telegramID)
	log.Info().Str("user_id", user.telegramID).Str("type", reportType).Msg("proactive generated notification sent")
	return nil
}

// loadPreferences is a convenience wrapper for getUserPreferences.
func (s *Scheduler) loadPreferences(telegramID string) map[string]any {
	if s.db == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	prefs, err := getUserPreferences(ctx, s.db, telegramID)
	if err != nil {
		log.Warn().Err(err).Str("user_id", telegramID).Msg("failed to load preferences")
		return nil
	}
	return prefs
}

// formatNumber formats an integer with Korean-style comma separators.
func formatNumber(n int) string {
	if n < 0 {
		return "-" + formatNumber(-n)
	}

	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}

	var result strings.Builder
	remainder := len(s) % 3
	if remainder > 0 {
		result.WriteString(s[:remainder])
	}
	for i := remainder; i < len(s); i += 3 {
		if result.Len() > 0 {
			result.WriteByte(',')
		}
		result.WriteString(s[i : i+3])
	}
	return result.String()
}
