package scheduler

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
)

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
	if s.alreadySentToday(ctx, userID, "anomaly_insights") {
		return "", true
	}

	var signals []schedAnomalySignal

	// ── Signal 1: Daily spending anomaly (90-day baseline) ───────────────────
	{
		since90 := time.Now().AddDate(0, 0, -90)
		rows, err := s.db.Pool().Query(ctx, `
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
		rows, err := s.db.Pool().Query(ctx, `
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
		rows, err := s.db.Pool().Query(ctx, `
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
		rows, err := s.db.Pool().Query(ctx, `
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
