package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// BudgetHandler exposes budget management endpoints.
type BudgetHandler struct {
	db *sql.DB
}

// NewBudgetHandler creates a new BudgetHandler.
func NewBudgetHandler(db *sql.DB) *BudgetHandler {
	return &BudgetHandler{db: db}
}

type budgetCategoryItem struct {
	Category string  `json:"category"`
	Budget   int     `json:"budget"`
	Spent    int     `json:"spent"`
	Percent  float64 `json:"percent"`
}

type budgetResponse struct {
	Budgets           []budgetCategoryItem `json:"budgets"`
	TotalBudget       int                  `json:"total_budget"`
	TotalSpent        int                  `json:"total_spent"`
	TotalRemaining    int                  `json:"total_remaining"`
	TotalPercent      float64              `json:"total_percent"`
	WarningThreshold  int                  `json:"warning_threshold"`
	DangerThreshold   int                  `json:"danger_threshold"`
	MonthlySpendChart []monthlySpendPoint  `json:"monthly_spend_chart"`
}

type monthlySpendPoint struct {
	Month string `json:"month"`
	Spent int    `json:"spent"`
}

var defaultCategories = []string{"식비", "교통", "쇼핑", "구독", "의료", "문화", "기타"}

// GetBudget returns budget limits + current-month spending per category.
// GET /api/v1/budget?user_id=...&year=YYYY&month=M
func (h *BudgetHandler) GetBudget(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	now := time.Now()
	year := now.Year()
	month := int(now.Month())
	if y := c.QueryParam("year"); y != "" {
		if v, err := strconv.Atoi(y); err == nil {
			year = v
		}
	}
	if m := c.QueryParam("month"); m != "" {
		if v, err := strconv.Atoi(m); err == nil {
			month = v
		}
	}

	ctx := c.Request().Context()

	// ── Load budget settings from profile preferences ────────────────────────
	budgetMap := map[string]int{}
	warningThreshold := 70
	dangerThreshold := 90

	var prefsRaw []byte
	row := h.db.QueryRowContext(ctx,
		`SELECT COALESCE(preferences, '{}'::jsonb)::text FROM profiles WHERE uuid_id = $1`, userID,
	)
	if err := row.Scan(&prefsRaw); err == nil && len(prefsRaw) > 0 {
		var prefs map[string]interface{}
		if err := json.Unmarshal(prefsRaw, &prefs); err == nil {
			if b, ok := prefs["budget"].(map[string]interface{}); ok {
				for k, v := range b {
					switch val := v.(type) {
					case float64:
						budgetMap[k] = int(val)
					case json.Number:
						if n, err := val.Int64(); err == nil {
							budgetMap[k] = int(n)
						}
					}
				}
			}
			if w, ok := prefs["warning_threshold"].(float64); ok {
				warningThreshold = int(w)
			}
			if d, ok := prefs["danger_threshold"].(float64); ok {
				dangerThreshold = int(d)
			}
		}
	}

	// ── Current-month spending per category ──────────────────────────────────
	spentMap := map[string]int{}
	rows, err := h.db.QueryContext(ctx, `
		SELECT category, COALESCE(SUM(ABS(amount)), 0)
		FROM finances
		WHERE user_id = $1
		  AND amount < 0
		  AND EXTRACT(YEAR  FROM created_at) = $2
		  AND EXTRACT(MONTH FROM created_at) = $3
		GROUP BY category
	`, userID, year, month)
	if err != nil {
		log.Error().Err(err).Msg("budget: spending query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()
	for rows.Next() {
		var cat string
		var spent int
		if err := rows.Scan(&cat, &spent); err == nil {
			spentMap[cat] = spent
		}
	}

	// ── 6-month total spending trend ──────────────────────────────────────────
	trendRows, err := h.db.QueryContext(ctx, `
		WITH months AS (
			SELECT generate_series(
				date_trunc('month', make_date($2, $3, 1)) - INTERVAL '5 months',
				date_trunc('month', make_date($2, $3, 1)),
				INTERVAL '1 month'
			) AS m
		)
		SELECT
			to_char(months.m, 'YYYY-MM') AS month,
			COALESCE(SUM(ABS(f.amount)), 0) AS spent
		FROM months
		LEFT JOIN finances f
			ON f.user_id = $1
			AND f.amount < 0
			AND date_trunc('month', f.created_at) = months.m
		GROUP BY months.m
		ORDER BY months.m
	`, userID, year, month)
	if err != nil {
		log.Error().Err(err).Msg("budget: trend query failed")
	}
	var spendChart []monthlySpendPoint
	if trendRows != nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var p monthlySpendPoint
			if err := trendRows.Scan(&p.Month, &p.Spent); err == nil {
				spendChart = append(spendChart, p)
			}
		}
	}
	if spendChart == nil {
		spendChart = []monthlySpendPoint{}
	}

	// ── Build per-category result ────────────────────────────────────────────
	// Union of configured categories and default list.
	catSet := map[string]bool{}
	for _, c := range defaultCategories {
		catSet[c] = true
	}
	for k := range budgetMap {
		catSet[k] = true
	}
	for k := range spentMap {
		catSet[k] = true
	}

	var items []budgetCategoryItem
	totalBudget := 0
	totalSpent := 0

	for _, cat := range defaultCategories {
		if !catSet[cat] {
			continue
		}
		budget := budgetMap[cat]
		spent := spentMap[cat]
		var pct float64
		if budget > 0 {
			pct = float64(spent) / float64(budget) * 100
		}
		items = append(items, budgetCategoryItem{
			Category: cat,
			Budget:   budget,
			Spent:    spent,
			Percent:  pct,
		})
		totalBudget += budget
		totalSpent += spent
	}
	// Add any extra categories not in default list.
	for cat := range catSet {
		found := false
		for _, dc := range defaultCategories {
			if dc == cat {
				found = true
				break
			}
		}
		if !found {
			budget := budgetMap[cat]
			spent := spentMap[cat]
			var pct float64
			if budget > 0 {
				pct = float64(spent) / float64(budget) * 100
			}
			items = append(items, budgetCategoryItem{
				Category: cat,
				Budget:   budget,
				Spent:    spent,
				Percent:  pct,
			})
			totalBudget += budget
			totalSpent += spent
		}
	}

	totalRemaining := totalBudget - totalSpent
	var totalPercent float64
	if totalBudget > 0 {
		totalPercent = float64(totalSpent) / float64(totalBudget) * 100
	}

	return c.JSON(http.StatusOK, budgetResponse{
		Budgets:           items,
		TotalBudget:       totalBudget,
		TotalSpent:        totalSpent,
		TotalRemaining:    totalRemaining,
		TotalPercent:      totalPercent,
		WarningThreshold:  warningThreshold,
		DangerThreshold:   dangerThreshold,
		MonthlySpendChart: spendChart,
	})
}

// UpdateBudget saves budget limits and thresholds into profile preferences.
// PUT /api/v1/budget?user_id=...
func (h *BudgetHandler) UpdateBudget(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	var req struct {
		Budgets          map[string]int `json:"budgets"`
		WarningThreshold int            `json:"warning_threshold"`
		DangerThreshold  int            `json:"danger_threshold"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := c.Request().Context()

	// Build JSONB patch for budget key.
	_, err := h.db.ExecContext(ctx, `
		INSERT INTO profiles (uuid_id, preferences)
		VALUES ($1, jsonb_build_object(
			'budget', $2::jsonb,
			'warning_threshold', $3::int,
			'danger_threshold', $4::int
		))
		ON CONFLICT (uuid_id) DO UPDATE
		SET preferences = profiles.preferences
			|| jsonb_build_object(
				'budget', $2::jsonb,
				'warning_threshold', $3::int,
				'danger_threshold', $4::int
			),
		updated_at = NOW()
	`, userID, budgetMapToJSON(req.Budgets), req.WarningThreshold, req.DangerThreshold)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("budget: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]any{"updated": true})
}

// budgetMapToJSON converts a map[string]int to a JSON string for use in SQL.
func budgetMapToJSON(m map[string]int) string {
	if len(m) == 0 {
		return "{}"
	}
	b := make([]byte, 0, 64)
	b = append(b, '{')
	first := true
	for k, v := range m {
		if !first {
			b = append(b, ',')
		}
		b = append(b, '"')
		b = append(b, []byte(k)...)
		b = append(b, '"', ':')
		b = strconv.AppendInt(b, int64(v), 10)
		first = false
	}
	b = append(b, '}')
	return string(b)
}
