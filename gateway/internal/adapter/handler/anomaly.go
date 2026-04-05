package handler

import (
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type AnomalyHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewAnomalyHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *AnomalyHandler {
	return &AnomalyHandler{db: db, config: cfg, logger: logger}
}

// ── Welford's online algorithm for streaming mean/variance ──────────────────

type welfordState struct {
	count int
	mean  float64
	m2    float64
}

func (w *welfordState) update(x float64) {
	w.count++
	delta := x - w.mean
	w.mean += delta / float64(w.count)
	delta2 := x - w.mean
	w.m2 += delta * delta2
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

// ── Result types ─────────────────────────────────────────────────────────────

type anomalyResult struct {
	Domain    string  `json:"domain"`
	Signal    string  `json:"signal"`
	Label     string  `json:"label"`
	Current   float64 `json:"current"`
	Baseline  float64 `json:"baseline"`
	StdDev    float64 `json:"std_dev"`
	ZScore    float64 `json:"z_score"`
	Severity  string  `json:"severity"`
	Direction string  `json:"direction"`
	Message   string  `json:"message"`
}

func anomalySeverity(z float64) string {
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

// GET /api/v1/anomalies
func (h *AnomalyHandler) GetAnomalies(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	ctx := c.Request().Context()

	var anomalies []anomalyResult

	// ── 1. Daily spending anomaly (90-day baseline) ───────────────────────────
	since90 := time.Now().AddDate(0, 0, -90)
	dailyRows, err := h.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS day, ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY day ORDER BY day`, userID, since90)
	if err == nil {
		defer dailyRows.Close()
		type dayPoint struct {
			day   time.Time
			total float64
		}
		var points []dayPoint
		for dailyRows.Next() {
			var dp dayPoint
			if dailyRows.Scan(&dp.day, &dp.total) == nil {
				points = append(points, dp)
			}
		}

		if len(points) >= 14 {
			cutoff := time.Now().AddDate(0, 0, -7)
			ws := &welfordState{}
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
				sev := anomalySeverity(z)

				if sev != "" {
					dir := "up"
					if z < 0 {
						dir = "down"
					}
					ratio := recentAvg / ws.mean
					var msg string
					if dir == "up" {
						msg = fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.1f배 높아요", ratio)
					} else {
						msg = fmt.Sprintf("최근 7일 일평균 지출이 평소보다 %.0f%% 줄었어요", (1-ratio)*100)
					}
					anomalies = append(anomalies, anomalyResult{
						Domain:    "spending",
						Signal:    "daily_avg",
						Label:     "일평균 지출",
						Current:   math.Round(recentAvg),
						Baseline:  math.Round(ws.mean),
						StdDev:    math.Round(ws.stdDev()),
						ZScore:    math.Round(z*100) / 100,
						Severity:  sev,
						Direction: dir,
						Message:   msg,
					})
				}
			}
		}
	}

	// ── 2. Weekly category spending anomaly (12-week baseline) ───────────────
	since12w := time.Now().AddDate(0, 0, -84)
	catWeeklyRows, err := h.db.QueryContext(ctx, `
		SELECT category,
		       DATE_TRUNC('week', created_at) AS week,
		       ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY category, week
		ORDER BY category, week`, userID, since12w)
	if err == nil {
		defer catWeeklyRows.Close()
		type weekPoint struct {
			category string
			week     time.Time
			total    float64
		}
		catMap := map[string][]weekPoint{}
		for catWeeklyRows.Next() {
			var wp weekPoint
			if catWeeklyRows.Scan(&wp.category, &wp.week, &wp.total) == nil {
				catMap[wp.category] = append(catMap[wp.category], wp)
			}
		}

		// Monday of current week
		now := time.Now()
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7 // Sunday → 7
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
			ws := &welfordState{}
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
			sev := anomalySeverity(z)
			if sev == "" {
				continue
			}

			label := catLabels[cat]
			if label == "" {
				label = cat
			}

			dir := "up"
			if z < 0 {
				dir = "down"
			}
			ratio := currentWeekTotal / ws.mean
			var msg string
			if dir == "up" {
				msg = fmt.Sprintf("이번 주 %s가 주간 평균보다 %.1f배 높아요", label, ratio)
			} else {
				msg = fmt.Sprintf("이번 주 %s가 주간 평균보다 %.0f%% 줄었어요", label, (1-ratio)*100)
			}
			anomalies = append(anomalies, anomalyResult{
				Domain:    "category",
				Signal:    "category_" + cat,
				Label:     label + " 주간 지출",
				Current:   math.Round(currentWeekTotal),
				Baseline:  math.Round(ws.mean),
				StdDev:    math.Round(ws.stdDev()),
				ZScore:    math.Round(z*100) / 100,
				Severity:  sev,
				Direction: dir,
				Message:   msg,
			})
		}
	}

	// ── 3. Stalled goals detection ────────────────────────────────────────────
	goalRows, err := h.db.QueryContext(ctx, `
		SELECT title, due_date, updated_at
		FROM planner_goals
		WHERE user_id = $1 AND status = 'active'`, userID)
	if err == nil {
		defer goalRows.Close()
		now := time.Now()
		for goalRows.Next() {
			var title string
			var targetDate *time.Time
			var updatedAt time.Time
			if goalRows.Scan(&title, &targetDate, &updatedAt) != nil {
				continue
			}

			daysSinceUpdate := now.Sub(updatedAt).Hours() / 24
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
			if targetDate != nil && targetDate.After(now) {
				daysLeft := targetDate.Sub(now).Hours() / 24
				if daysLeft < 14 {
					sev = "high"
					urgency = fmt.Sprintf(" (마감 %.0f일 전)", daysLeft)
				}
			}

			msg := fmt.Sprintf("'%s' 목표가 %.0f일째 진행이 멈췄어요%s", title, daysSinceUpdate, urgency)
			anomalies = append(anomalies, anomalyResult{
				Domain:    "goals",
				Signal:    "goal_stalled",
				Label:     "목표 정체",
				Current:   math.Round(daysSinceUpdate),
				Baseline:  7,
				ZScore:    math.Round(daysSinceUpdate/7*100) / 100,
				Severity:  sev,
				Direction: "down",
				Message:   msg,
			})
		}
	}

	// ── 4. Monthly total spending anomaly (6-month baseline) ─────────────────
	since6m := time.Now().AddDate(-1, 0, 0)
	monthlyRows, err := h.db.QueryContext(ctx, `
		SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		       ABS(SUM(amount)) AS total
		FROM finances
		WHERE user_id = $1 AND amount < 0 AND created_at >= $2
		GROUP BY month ORDER BY month`, userID, since6m)
	if err == nil {
		defer monthlyRows.Close()
		type monthPoint struct {
			month string
			total float64
		}
		var mpoints []monthPoint
		for monthlyRows.Next() {
			var mp monthPoint
			if monthlyRows.Scan(&mp.month, &mp.total) == nil {
				mpoints = append(mpoints, mp)
			}
		}

		thisMonth := time.Now().Format("2006-01")
		if len(mpoints) >= 4 {
			ws := &welfordState{}
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
				// Extrapolate: scale partial month to full month
				dayOfMonth := float64(time.Now().Day())
				daysInMonth := float64(time.Date(time.Now().Year(), time.Now().Month()+1, 0, 0, 0, 0, 0, time.UTC).Day())
				projected := thisMonthTotal / dayOfMonth * daysInMonth

				z := ws.zScore(projected)
				sev := anomalySeverity(z)

				if sev != "" {
					dir := "up"
					if z < 0 {
						dir = "down"
					}
					ratio := projected / ws.mean
					var msg string
					if dir == "up" {
						msg = fmt.Sprintf("이번 달 지출이 월 평균보다 %.1f배 많을 것으로 예상돼요", ratio)
					} else {
						msg = fmt.Sprintf("이번 달 지출이 월 평균보다 %.0f%% 적을 것으로 예상돼요", (1-ratio)*100)
					}
					anomalies = append(anomalies, anomalyResult{
						Domain:    "spending",
						Signal:    "monthly_projected",
						Label:     "월간 지출 예측",
						Current:   math.Round(projected),
						Baseline:  math.Round(ws.mean),
						StdDev:    math.Round(ws.stdDev()),
						ZScore:    math.Round(z*100) / 100,
						Severity:  sev,
						Direction: dir,
						Message:   msg,
					})
				}
			}
		}
	}

	if anomalies == nil {
		anomalies = []anomalyResult{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"anomalies":   anomalies,
		"count":       len(anomalies),
		"computed_at": time.Now().UTC(),
	})
}
