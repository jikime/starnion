package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type BudgetHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewBudgetHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *BudgetHandler {
	return &BudgetHandler{db: db, config: cfg, logger: logger}
}

// GetBudget returns per-category budget utilization merged with actual spending.
// GET /api/v1/budget?year=2026&month=3
func (h *BudgetHandler) GetBudget(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	now := time.Now()
	year := now.Year()
	month := int(now.Month())
	if y, e := strconv.Atoi(c.QueryParam("year")); e == nil && y > 0 {
		year = y
	}
	if m, e := strconv.Atoi(c.QueryParam("month")); e == nil && m >= 1 && m <= 12 {
		month = m
	}

	// ── Spending per category for selected month (expenses only) ──────────
	spendMap := map[string]int64{}
	var totalSpendAll int64
	rows, err := h.db.QueryContext(ctx,
		`SELECT category, ABS(SUM(amount)) AS total
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY category`,
		userID, year, month,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var total int64
			if rows.Scan(&cat, &total) == nil {
				spendMap[cat] = total
				totalSpendAll += total
			}
		}
	}
	// '전체' is NOT a category — it's the total across all categories.
	// Tracked separately and returned as a top-level field.

	// ── Budget limits ─────────────────────────────────────────────────────
	limitMap := map[string]int64{}
	bRows, err := h.db.QueryContext(ctx,
		`SELECT category, amount FROM budgets WHERE user_id = $1 AND period = 'monthly'`,
		userID,
	)
	if err == nil {
		defer bRows.Close()
		for bRows.Next() {
			var cat string
			var amount int64
			if bRows.Scan(&cat, &amount) == nil {
				limitMap[cat] = amount
			}
		}
	}

	// ── Thresholds from user preferences ─────────────────────────────────
	warningThreshold := 70
	dangerThreshold := 90
	var prefsJSON []byte
	if h.db.QueryRowContext(ctx,
		`SELECT COALESCE(preferences, '{}') FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON) == nil {
		var prefs map[string]json.RawMessage
		if json.Unmarshal(prefsJSON, &prefs) == nil {
			if budgetRaw, ok := prefs["budget"]; ok {
				var bp struct {
					W int `json:"warning_threshold"`
					D int `json:"danger_threshold"`
				}
				if json.Unmarshal(budgetRaw, &bp) == nil {
					if bp.W > 0 {
						warningThreshold = bp.W
					}
					if bp.D > 0 {
						dangerThreshold = bp.D
					}
				}
			}
		}
	}

	// ── Build budget items (union of categories with spend or limit) ──────
	// Exclude "전체" — it's a UI-level total, not a real category.
	delete(spendMap, "전체")
	delete(limitMap, "전체")

	seen := map[string]bool{}
	var budgets []map[string]any
	for cat, spent := range spendMap {
		seen[cat] = true
		budget := limitMap[cat]
		var percent float64
		if budget > 0 {
			percent = float64(spent) / float64(budget) * 100
		}
		budgets = append(budgets, map[string]any{
			"category": cat,
			"budget":   budget,
			"spent":    spent,
			"percent":  percent,
		})
	}
	for cat, budget := range limitMap {
		if !seen[cat] {
			budgets = append(budgets, map[string]any{
				"category": cat,
				"budget":   budget,
				"spent":    int64(0),
				"percent":  float64(0),
			})
		}
	}
	if budgets == nil {
		budgets = []map[string]any{}
	}

	// ── Aggregates ────────────────────────────────────────────────────────
	var totalBudget, totalSpent int64
	for _, b := range budgets {
		totalBudget += b["budget"].(int64)
		totalSpent += b["spent"].(int64)
	}
	totalRemaining := totalBudget - totalSpent
	var totalPercent float64
	if totalBudget > 0 {
		totalPercent = float64(totalSpent) / float64(totalBudget) * 100
	}

	// ── Monthly spend chart: 6 months ending at selected month ───────────
	chartRows, err := h.db.QueryContext(ctx,
		`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
		        ABS(SUM(amount)) AS spent
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) BETWEEN
		       DATE_TRUNC('month', MAKE_DATE($2, $3, 1)) - INTERVAL '5 months'
		       AND DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY 1 ORDER BY 1`,
		userID, year, month,
	)
	monthlyChart := []map[string]any{}
	if err == nil {
		defer chartRows.Close()
		for chartRows.Next() {
			var mo string
			var spent int64
			if chartRows.Scan(&mo, &spent) == nil {
				monthlyChart = append(monthlyChart, map[string]any{"month": mo, "spent": spent})
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"budgets":             budgets,
		"total_budget":        totalBudget,
		"total_spent":         totalSpent,
		"total_remaining":     totalRemaining,
		"total_percent":       totalPercent,
		"warning_threshold":   warningThreshold,
		"danger_threshold":    dangerThreshold,
		"monthly_spend_chart": monthlyChart,
	})
}

// UpdateBudget saves per-category budget limits and alert thresholds.
// PUT /api/v1/budget
// Body: { "budgets": {"식비": 300000, "교통": 100000}, "warning_threshold": 70, "danger_threshold": 90 }
func (h *BudgetHandler) UpdateBudget(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Budgets          map[string]int64 `json:"budgets"`
		WarningThreshold int              `json:"warning_threshold"`
		DangerThreshold  int              `json:"danger_threshold"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := c.Request().Context()

	// Upsert / delete each category budget
	for cat, amount := range req.Budgets {
		if len(cat) > 100 {
			continue
		}
		if amount > 0 {
			_, _ = h.db.ExecContext(ctx,
				`INSERT INTO budgets (user_id, category, amount, period)
				 VALUES ($1, $2, $3, 'monthly')
				 ON CONFLICT (user_id, category, period) DO UPDATE
				   SET amount = EXCLUDED.amount, updated_at = NOW()`,
				userID, cat, amount,
			)
		} else {
			// amount == 0 means the user cleared the budget for this category
			_, _ = h.db.ExecContext(ctx,
				`DELETE FROM budgets WHERE user_id = $1 AND category = $2 AND period = 'monthly'`,
				userID, cat,
			)
		}
	}

	// Persist thresholds in user preferences JSONB
	if req.WarningThreshold <= 0 {
		req.WarningThreshold = 70
	}
	if req.DangerThreshold <= 0 {
		req.DangerThreshold = 90
	}
	budgetPrefsJSON, _ := json.Marshal(map[string]int{
		"warning_threshold": req.WarningThreshold,
		"danger_threshold":  req.DangerThreshold,
	})
	_, _ = h.db.ExecContext(ctx,
		`UPDATE users
		 SET preferences = jsonb_set(COALESCE(preferences, '{}'), '{budget}', $1::jsonb),
		     updated_at  = NOW()
		 WHERE id = $2`,
		string(budgetPrefsJSON), userID,
	)

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}
