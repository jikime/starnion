// Package anomaly computes anomaly reports for the /anomalies endpoint.
// The four detectors (daily spend, weekly per-category spend, monthly
// projected spend, stalled goals) all use Welford's online algorithm
// for a numerically stable mean/variance over the baseline window.
//
// Business rules (severity thresholds, minimum baseline sizes, z-score
// floors) live here so they can be unit-tested against a fake
// AnomalyRepository without standing up Postgres.
package anomaly

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

type UseCase struct {
	repo repository.AnomalyRepository
}

func NewUseCase(repo repository.AnomalyRepository) *UseCase {
	return &UseCase{repo: repo}
}

// Detect runs every detector and returns the non-empty findings.
// Errors from any single detector are silently skipped — the endpoint
// should still surface whichever detectors succeeded (matches legacy
// behaviour, which ignored SQL errors in the same way).
func (u *UseCase) Detect(ctx context.Context, userID uuid.UUID) []entity.AnomalyReport {
	now := time.Now()
	var out []entity.AnomalyReport
	if r := u.detectDailySpending(ctx, userID, now); r != nil {
		out = append(out, *r)
	}
	out = append(out, u.detectWeeklyCategorySpending(ctx, userID, now)...)
	out = append(out, u.detectStalledGoals(ctx, userID, now)...)
	if r := u.detectMonthlyProjected(ctx, userID, now); r != nil {
		out = append(out, *r)
	}
	if out == nil {
		out = []entity.AnomalyReport{}
	}
	return out
}

// ── 1. Daily spending anomaly (90-day baseline) ─────────────────────────

func (u *UseCase) detectDailySpending(ctx context.Context, userID uuid.UUID, now time.Time) *entity.AnomalyReport {
	points, err := u.repo.DailySpendingSince(ctx, userID, now.AddDate(0, 0, -90))
	if err != nil || len(points) < 14 {
		return nil
	}
	cutoff := now.AddDate(0, 0, -7)
	var ws welfordState
	var recent []entity.DailySpend
	for _, p := range points {
		if p.Day.Before(cutoff) {
			ws.update(p.Total)
		} else {
			recent = append(recent, p)
		}
	}
	if ws.count < 7 || len(recent) == 0 {
		return nil
	}
	var recentSum float64
	for _, p := range recent {
		recentSum += p.Total
	}
	recentAvg := recentSum / float64(len(recent))
	z := ws.zScore(recentAvg)
	sev := severity(z)
	if sev == "" {
		return nil
	}
	dir := "up"
	if z < 0 {
		dir = "down"
	}
	ratio := recentAvg / ws.mean
	msg := fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.1f배 높아요", ratio)
	if dir == "down" {
		msg = fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.0f%% 줄었어요", (1-ratio)*100)
	}
	return &entity.AnomalyReport{
		Domain:    "spending",
		Signal:    "daily_avg",
		Label:     "일평균 지출",
		Current:   math.Round(recentAvg),
		Baseline:  math.Round(ws.mean),
		StdDev:    math.Round(ws.stdDev()),
		ZScore:    roundTo2(z),
		Severity:  sev,
		Direction: dir,
		Message:   msg,
	}
}

// ── 2. Weekly per-category spending (12-week baseline) ──────────────────

func (u *UseCase) detectWeeklyCategorySpending(ctx context.Context, userID uuid.UUID, now time.Time) []entity.AnomalyReport {
	points, err := u.repo.WeeklyCategorySpendingSince(ctx, userID, now.AddDate(0, 0, -84))
	if err != nil {
		return nil
	}
	catMap := map[string][]entity.WeeklyCategorySpend{}
	for _, p := range points {
		catMap[p.Category] = append(catMap[p.Category], p)
	}

	// Monday of the current week — matches the legacy handler, which
	// normalised to UTC midnight on Monday regardless of the user's
	// actual timezone.
	thisMonday := mondayOfWeek(now)

	labels := map[string]string{
		"식비": "식비", "교통": "교통비", "쇼핑": "쇼핑",
		"구독": "구독", "의료": "의료비", "문화": "문화생활", "기타": "기타",
	}

	var out []entity.AnomalyReport
	for cat, pts := range catMap {
		if len(pts) < 4 {
			continue
		}
		var ws welfordState
		var currentWeekTotal float64
		hasCurrent := false
		for _, p := range pts {
			wMon := time.Date(p.Week.Year(), p.Week.Month(), p.Week.Day(), 0, 0, 0, 0, time.UTC)
			if !wMon.Before(thisMonday) {
				currentWeekTotal = p.Total
				hasCurrent = true
			} else {
				ws.update(p.Total)
			}
		}
		if !hasCurrent || ws.count < 3 {
			continue
		}
		z := ws.zScore(currentWeekTotal)
		sev := severity(z)
		if sev == "" {
			continue
		}

		label := labels[cat]
		if label == "" {
			label = cat
		}
		dir := "up"
		if z < 0 {
			dir = "down"
		}
		ratio := currentWeekTotal / ws.mean
		msg := fmt.Sprintf("이번 주 %s가 주간 평균보다 %.1f배 높아요", label, ratio)
		if dir == "down" {
			msg = fmt.Sprintf("이번 주 %s가 주간 평균보다 %.0f%% 줄었어요", label, (1-ratio)*100)
		}
		out = append(out, entity.AnomalyReport{
			Domain:    "category",
			Signal:    "category_" + cat,
			Label:     label + " 주간 지출",
			Current:   math.Round(currentWeekTotal),
			Baseline:  math.Round(ws.mean),
			StdDev:    math.Round(ws.stdDev()),
			ZScore:    roundTo2(z),
			Severity:  sev,
			Direction: dir,
			Message:   msg,
		})
	}
	return out
}

// ── 3. Stalled goals ────────────────────────────────────────────────────

func (u *UseCase) detectStalledGoals(ctx context.Context, userID uuid.UUID, now time.Time) []entity.AnomalyReport {
	goals, err := u.repo.ActiveGoals(ctx, userID)
	if err != nil {
		return nil
	}
	var out []entity.AnomalyReport
	for _, g := range goals {
		daysSinceUpdate := now.Sub(g.UpdatedAt).Hours() / 24
		if daysSinceUpdate < 7 {
			continue
		}
		sev := "mild"
		if daysSinceUpdate >= 14 {
			sev = "moderate"
		}
		if daysSinceUpdate >= 30 {
			sev = "high"
		}

		urgency := ""
		if g.DueDate != nil && g.DueDate.After(now) {
			daysLeft := g.DueDate.Sub(now).Hours() / 24
			if daysLeft < 14 {
				sev = "high"
				urgency = fmt.Sprintf(" (마감 %.0f일 전)", daysLeft)
			}
		}
		msg := fmt.Sprintf("'%s' 목표가 %.0f일째 진행이 멈췄어요%s", g.Title, daysSinceUpdate, urgency)
		out = append(out, entity.AnomalyReport{
			Domain:    "goals",
			Signal:    "goal_stalled",
			Label:     "목표 정체",
			Current:   math.Round(daysSinceUpdate),
			Baseline:  7,
			ZScore:    roundTo2(daysSinceUpdate / 7),
			Severity:  sev,
			Direction: "down",
			Message:   msg,
		})
	}
	return out
}

// ── 4. Monthly projected spending ───────────────────────────────────────

func (u *UseCase) detectMonthlyProjected(ctx context.Context, userID uuid.UUID, now time.Time) *entity.AnomalyReport {
	points, err := u.repo.MonthlySpendingSince(ctx, userID, now.AddDate(-1, 0, 0))
	if err != nil || len(points) < 4 {
		return nil
	}
	thisMonth := now.Format("2006-01")
	var ws welfordState
	var thisMonthTotal float64
	hasThis := false
	for _, p := range points {
		if p.Month == thisMonth {
			thisMonthTotal = p.Total
			hasThis = true
		} else {
			ws.update(p.Total)
		}
	}
	if !hasThis || ws.count < 3 {
		return nil
	}
	// Extrapolate partial month to a full-month projection.
	dayOfMonth := float64(now.Day())
	daysInMonth := float64(time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day())
	projected := thisMonthTotal / dayOfMonth * daysInMonth

	z := ws.zScore(projected)
	sev := severity(z)
	if sev == "" {
		return nil
	}
	dir := "up"
	if z < 0 {
		dir = "down"
	}
	ratio := projected / ws.mean
	msg := fmt.Sprintf("이번 달 지출이 월 평균보다 %.1f배 많을 것으로 예상돼요", ratio)
	if dir == "down" {
		msg = fmt.Sprintf("이번 달 지출이 월 평균보다 %.0f%% 적을 것으로 예상돼요", (1-ratio)*100)
	}
	return &entity.AnomalyReport{
		Domain:    "spending",
		Signal:    "monthly_projected",
		Label:     "월간 지출 예측",
		Current:   math.Round(projected),
		Baseline:  math.Round(ws.mean),
		StdDev:    math.Round(ws.stdDev()),
		ZScore:    roundTo2(z),
		Severity:  sev,
		Direction: dir,
		Message:   msg,
	}
}

// ── Welford online mean/variance ────────────────────────────────────────

type welfordState struct {
	count int
	mean  float64
	m2    float64
}

func (w *welfordState) update(x float64) {
	w.count++
	delta := x - w.mean
	w.mean += delta / float64(w.count)
	w.m2 += delta * (x - w.mean)
}

func (w *welfordState) stdDev() float64 {
	if w.count < 2 {
		return 0
	}
	return math.Sqrt(w.m2 / float64(w.count-1))
}

func (w *welfordState) zScore(x float64) float64 {
	std := w.stdDev()
	if std == 0 || w.count < 3 {
		return 0
	}
	return (x - w.mean) / std
}

// ── Severity thresholds ─────────────────────────────────────────────────

func severity(z float64) string {
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

func roundTo2(v float64) float64 {
	return math.Round(v*100) / 100
}

// mondayOfWeek returns the UTC-normalised Monday of the week that
// contains `t`, matching the legacy handler's definition (Sunday is
// treated as the last day of the previous week).
func mondayOfWeek(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := t.AddDate(0, 0, -(weekday - 1))
	return time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
}
