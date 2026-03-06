package scheduler

import (
	"context"
	"fmt"
	"strings"
	"time"

	starpionv1 "github.com/jikime/starpion/gateway/gen/starpion/v1"
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "budget") {
			continue
		}
		spending, err := getCategorySpending(ctx, s.db, u.userID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("budget warning: failed to query spending")
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
		if err := s.sendTemplateNotification(u.userID, u.chatID, u.preferences, message); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("budget warning: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "finance") {
			continue
		}
		if err := s.sendGeneratedNotification(u, "daily_summary"); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("daily summary: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "proactive") {
			continue
		}
		prefs := s.loadPreferences(u.userID)
		if err := s.sendTemplateNotification(u.userID, u.chatID, prefs, message); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("inactive reminder: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "finance") {
			continue
		}
		if err := s.sendGeneratedNotification(u, "monthly_closing"); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("monthly closing: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "pattern") {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		resp, err := s.grpcClient.GenerateReport(ctx, &starpionv1.ReportRequest{
			UserId:     u.userID,
			ReportType: "pattern_analysis",
		})
		cancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("pattern analysis: gRPC failed")
			failCount++
			continue
		}
		log.Info().Str("user_id", u.userID).Str("result", resp.Content).Msg("pattern analysis complete")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "finance") {
			continue
		}
		stats, err := getDailySpendingStats(ctx, s.db, u.userID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("spending anomaly: query failed")
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

		prefs := s.loadPreferences(u.userID)
		if err := s.sendTemplateNotification(u.userID, u.chatID, prefs, message); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("spending anomaly: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "pattern") {
			continue
		}
		patternJSON, err := getStoredPatterns(ctx, s.db, u.userID)
		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("pattern insight: read failed")
			continue
		}
		if patternJSON == "" {
			continue
		}

		analysis, err := parsePatterns(patternJSON)
		if err != nil {
			log.Warn().Err(err).Str("user_id", u.userID).Msg("pattern insight: parse failed")
			continue
		}

		triggered := triggeredPatterns(analysis, now)
		if len(triggered) == 0 {
			continue
		}

		log.Info().
			Str("user_id", u.userID).
			Int("triggered", len(triggered)).
			Msg("pattern triggers matched, generating insight")

		if err := s.sendGeneratedNotification(u, "pattern_insight"); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("pattern insight: send failed")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "goals") {
			continue
		}
		rctx, rcancel := context.WithTimeout(context.Background(), 180*time.Second)
		resp, err := s.grpcClient.GenerateReport(rctx, &starpionv1.ReportRequest{
			UserId:     u.userID,
			ReportType: "goal_evaluate",
		})
		rcancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("goal evaluation: gRPC failed")
			failCount++
			continue
		}
		log.Info().Str("user_id", u.userID).Str("result", resp.Content).Msg("goal evaluation complete")
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
		if s.skillService != nil && !s.skillService.IsEnabled(u.userID, "goals") {
			continue
		}
		if err := s.sendGeneratedNotification(u, "goal_status"); err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("goal status: send failed")
		}
	}
}

// --- Helpers ---

// sendTemplateNotification sends a pre-formatted message with fatigue checks.
func (s *Scheduler) sendTemplateNotification(userID string, chatID int64, preferences map[string]any, message string) error {
	if !s.fatigue.canNotify(userID, preferences) {
		return nil
	}

	if err := s.telegram.SendMessage(chatID, message); err != nil {
		return fmt.Errorf("send template: %w", err)
	}

	s.fatigue.recordNotification(userID)
	log.Info().Str("user_id", userID).Msg("proactive template notification sent")
	return nil
}

// sendGeneratedNotification calls gRPC to generate a report, then sends it with fatigue checks.
func (s *Scheduler) sendGeneratedNotification(user activeUser, reportType string) error {
	prefs := s.loadPreferences(user.userID)
	if !s.fatigue.canNotify(user.userID, prefs) {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := s.grpcClient.GenerateReport(ctx, &starpionv1.ReportRequest{
		UserId:     user.userID,
		ReportType: reportType,
	})
	if err != nil {
		return fmt.Errorf("generate %s: %w", reportType, err)
	}

	if resp.Content == "" {
		log.Warn().Str("user_id", user.userID).Str("type", reportType).Msg("empty report, skipping")
		return nil
	}

	if err := s.telegram.SendMessage(user.chatID, resp.Content); err != nil {
		return fmt.Errorf("send %s: %w", reportType, err)
	}

	s.fatigue.recordNotification(user.userID)
	log.Info().Str("user_id", user.userID).Str("type", reportType).Msg("proactive generated notification sent")
	return nil
}

// loadPreferences is a convenience wrapper for getUserPreferences.
func (s *Scheduler) loadPreferences(userID string) map[string]any {
	if s.db == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	prefs, err := getUserPreferences(ctx, s.db, userID)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("failed to load preferences")
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

// --- Conversation Analysis Rule ---

// runConversationAnalysisRule detects idle users and triggers background
// conversation analysis. Results are stored in knowledge_base but NOT
// sent to the user.
//
// Idle condition: user had messages, now idle for 30min-2hours, and
// this idle session has not been analyzed yet.
func (s *Scheduler) runConversationAnalysisRule() {
	if s.tracker == nil {
		return
	}

	activeUsers := s.tracker.ActiveUsers()
	if len(activeUsers) == 0 {
		return
	}

	now := time.Now()
	var analyzeCount int

	for userID, lastMsg := range activeUsers {
		if s.skillService != nil && !s.skillService.IsEnabled(userID, "diary") {
			continue
		}

		idle := now.Sub(lastMsg)

		// Idle window: 30 minutes to 2 hours.
		if idle < 30*time.Minute || idle > 2*time.Hour {
			continue
		}

		// Skip during quiet hours.
		if s.fatigue.isQuietHours() {
			continue
		}

		// Dedup: skip if we already analyzed this idle session.
		s.analysisMu.RLock()
		lastAnalyzed, exists := s.analysisStates[userID]
		s.analysisMu.RUnlock()
		if exists && lastAnalyzed.Equal(lastMsg) {
			continue
		}

		// Trigger background analysis via gRPC.
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		resp, err := s.grpcClient.GenerateReport(ctx, &starpionv1.ReportRequest{
			UserId:     userID,
			ReportType: "conversation_analysis",
		})
		cancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("conversation analysis: gRPC failed")
			continue
		}

		// Mark this idle session as analyzed.
		s.analysisMu.Lock()
		s.analysisStates[userID] = lastMsg
		s.analysisMu.Unlock()

		log.Info().
			Str("user_id", userID).
			Str("result", resp.Content).
			Dur("idle", idle).
			Msg("conversation analysis complete")
		analyzeCount++
	}

	if analyzeCount > 0 {
		log.Info().Int("analyzed", analyzeCount).Msg("conversation analysis batch finished")
	}
}

// --- Memory Compaction Rule ---

// runMemoryCompactionRule triggers weekly memory compaction for all active users.
// Runs Monday 05:00 KST. Summarizes old daily_logs into weekly summaries
// and removes originals to reduce storage. Background-only, no user notification.
func (s *Scheduler) runMemoryCompactionRule() {
	if s.db == nil {
		return
	}

	users, err := s.getActiveUsers()
	if err != nil {
		log.Error().Err(err).Msg("memory compaction: failed to query active users")
		return
	}

	if len(users) == 0 {
		log.Debug().Msg("memory compaction: no active users")
		return
	}

	log.Info().Int("users", len(users)).Msg("running memory compaction")

	var successCount, failCount int
	for _, u := range users {
		ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
		resp, err := s.grpcClient.GenerateReport(ctx, &starpionv1.ReportRequest{
			UserId:     u.userID,
			ReportType: "memory_compaction",
		})
		cancel()

		if err != nil {
			log.Error().Err(err).Str("user_id", u.userID).Msg("memory compaction: gRPC failed")
			failCount++
			continue
		}
		log.Info().Str("user_id", u.userID).Str("result", resp.Content).Msg("memory compaction complete")
		successCount++
	}

	log.Info().Int("success", successCount).Int("failed", failCount).Msg("memory compaction finished")
}
