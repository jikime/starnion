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

type FinanceHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewFinanceHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *FinanceHandler {
	return &FinanceHandler{db: db, config: cfg, logger: logger}
}

// Summary returns income/expense totals, monthly chart (last 6 months), and category breakdown.
// GET /api/v1/finance/summary?year=2026&month=3
func (h *FinanceHandler) Summary(c echo.Context) error {
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

	// ── Totals for selected month ──────────────────────────────────────────
	var income, expense int64
	h.db.QueryRowContext(ctx,
		`SELECT
			COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0),
			COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)
		 FROM finances
		 WHERE user_id = $1
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))`,
		userID, year, month,
	).Scan(&income, &expense)

	net := income + expense // expense is negative
	var savingsRate float64
	if income > 0 {
		savingsRate = float64(net) / float64(income) * 100
	}

	// ── Monthly chart: 6 months ending at selected month ─────────────────
	chartRows, err := h.db.QueryContext(ctx,
		`SELECT
			TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
			COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS income,
			COALESCE(ABS(SUM(amount) FILTER (WHERE amount < 0)), 0) AS expense
		 FROM finances
		 WHERE user_id = $1
		   AND DATE_TRUNC('month', created_at) BETWEEN
		       DATE_TRUNC('month', MAKE_DATE($2, $3, 1)) - INTERVAL '5 months'
		       AND DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY 1
		 ORDER BY 1`,
		userID, year, month,
	)
	monthlyChart := []map[string]any{}
	if err == nil {
		defer chartRows.Close()
		for chartRows.Next() {
			var mo string
			var inc, exp int64
			if chartRows.Scan(&mo, &inc, &exp) == nil {
				monthlyChart = append(monthlyChart, map[string]any{
					"month": mo, "income": inc, "expense": exp,
				})
			}
		}
	}

	// ── Category breakdown: selected month ────────────────────────────────
	catRows, err := h.db.QueryContext(ctx,
		`SELECT category, ABS(SUM(amount)) AS amount
		 FROM finances
		 WHERE user_id = $1
		   AND amount < 0
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
		 GROUP BY category
		 ORDER BY amount DESC`,
		userID, year, month,
	)
	catBreakdown := []map[string]any{}
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var cat string
			var amt int64
			if catRows.Scan(&cat, &amt) == nil {
				catBreakdown = append(catBreakdown, map[string]any{
					"category": cat, "amount": amt,
				})
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"income":             income,
		"expense":            -expense, // return as positive
		"net":                net,
		"savings_rate":       savingsRate,
		"monthly_chart":      monthlyChart,
		"category_breakdown": catBreakdown,
	})
}

// ListTransactions returns paginated finance transactions.
// GET /api/v1/finance/transactions?year=2024&month=1&category=식비&type=expense&page=1&limit=20
func (h *FinanceHandler) ListTransactions(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	where := "WHERE user_id = $1"
	args := []any{userID}
	argIdx := 2

	if year := c.QueryParam("year"); year != "" {
		if month := c.QueryParam("month"); month != "" {
			where += " AND EXTRACT(YEAR FROM created_at) = $" + strconv.Itoa(argIdx) +
				" AND EXTRACT(MONTH FROM created_at) = $" + strconv.Itoa(argIdx+1)
			args = append(args, year, month)
			argIdx += 2
		}
	}
	if cat := c.QueryParam("category"); cat != "" {
		where += " AND category = $" + strconv.Itoa(argIdx)
		args = append(args, cat)
		argIdx++
	}
	switch c.QueryParam("type") {
	case "income":
		where += " AND amount > 0"
	case "expense":
		where += " AND amount < 0"
	}

	ctx := c.Request().Context()

	var total int
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM finances "+where, args...).Scan(&total)

	query := "SELECT id, amount, category, description, created_at, location FROM finances " + where +
		" ORDER BY created_at DESC LIMIT $" + strconv.Itoa(argIdx) + " OFFSET $" + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch transactions"})
	}
	defer rows.Close()

	var transactions []map[string]any
	for rows.Next() {
		var id int64
		var category string
		var description *string
		var amount int64
		var createdAt time.Time
		var location *string
		if err := rows.Scan(&id, &amount, &category, &description, &createdAt, &location); err != nil {
			continue
		}
		tx := map[string]any{
			"id":          id,
			"amount":      amount,
			"category":    category,
			"description": description,
			"created_at":  createdAt,
		}
		if location != nil {
			tx["location"] = json.RawMessage(*location)
		}
		transactions = append(transactions, tx)
	}
	if transactions == nil {
		transactions = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{
		"transactions": transactions,
		"total":        total,
		"page":         page,
		"limit":        limit,
	})
}

// CreateTransaction adds a new finance record.
// POST /api/v1/finance/transactions
func (h *FinanceHandler) CreateTransaction(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Amount      int64            `json:"amount"`
		Category    string           `json:"category"`
		Description string           `json:"description"`
		CreatedAt   string           `json:"created_at"` // YYYY-MM-DD, optional
		Location    *json.RawMessage `json:"location"`   // {lat, lng, name}
	}
	if err := c.Bind(&req); err != nil || req.Category == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "amount and category are required"})
	}
	if len(req.Category) > 100 {
		req.Category = req.Category[:100]
	}
	if len(req.Description) > 500 {
		req.Description = req.Description[:500]
	}

	createdAt := time.Now()
	if req.CreatedAt != "" {
		if t, err := time.Parse("2006-01-02", req.CreatedAt); err == nil {
			createdAt = t
		}
	}

	var locationJSON *string
	if req.Location != nil {
		s := string(*req.Location)
		locationJSON = &s
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO finances (user_id, amount, category, description, created_at, location)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
		userID, req.Amount, req.Category, req.Description, createdAt, locationJSON,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create transaction"})
	}

	resp := map[string]any{
		"id":          id,
		"amount":      req.Amount,
		"category":    req.Category,
		"description": req.Description,
		"created_at":  createdAt,
	}
	if req.Location != nil {
		resp["location"] = req.Location
	}
	return c.JSON(http.StatusCreated, resp)
}

// UpdateTransaction modifies an existing finance record.
// PUT /api/v1/finance/transactions/:id
func (h *FinanceHandler) UpdateTransaction(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	txID := c.Param("id")
	var req struct {
		Amount      int64            `json:"amount"`
		Category    string           `json:"category"`
		Description string           `json:"description"`
		CreatedAt   string           `json:"created_at"`  // YYYY-MM-DD, optional
		Location    *json.RawMessage `json:"location"`    // {lat, lng, name}, null to clear
		ClearLocation bool           `json:"clear_location"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Build dynamic SET clause
	set := ""
	args := []any{}
	argIdx := 1

	if req.Amount != 0 {
		set += "amount = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, req.Amount)
		argIdx++
	}
	if req.Category != "" {
		set += "category = $" + strconv.Itoa(argIdx) + ", "
		args = append(args, req.Category)
		argIdx++
	}
	// Always update description (allows clearing it)
	set += "description = $" + strconv.Itoa(argIdx) + ", "
	args = append(args, req.Description)
	argIdx++

	if req.CreatedAt != "" {
		if t, err := time.Parse("2006-01-02", req.CreatedAt); err == nil {
			set += "created_at = $" + strconv.Itoa(argIdx) + ", "
			args = append(args, t)
			argIdx++
		}
	}
	if req.Location != nil {
		set += "location = $" + strconv.Itoa(argIdx) + "::jsonb, "
		args = append(args, string(*req.Location))
		argIdx++
	} else if req.ClearLocation {
		set += "location = NULL, "
	}

	if set == "" {
		return c.JSON(http.StatusOK, map[string]string{"status": "no changes"})
	}

	// Trim trailing comma+space
	set = set[:len(set)-2]

	args = append(args, txID, userID)
	_, err = h.db.ExecContext(c.Request().Context(),
		"UPDATE finances SET "+set+" WHERE id = $"+strconv.Itoa(argIdx)+" AND user_id = $"+strconv.Itoa(argIdx+1),
		args...,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update transaction"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// MapTransactions returns finance transactions that have geolocation data.
// GET /api/v1/finance/map?year=2026&month=3
func (h *FinanceHandler) MapTransactions(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	where := "WHERE user_id = $1 AND location IS NOT NULL"
	args := []any{userID}
	argIdx := 2

	if year := c.QueryParam("year"); year != "" {
		if month := c.QueryParam("month"); month != "" {
			where += " AND EXTRACT(YEAR FROM created_at) = $" + strconv.Itoa(argIdx) +
				" AND EXTRACT(MONTH FROM created_at) = $" + strconv.Itoa(argIdx+1)
			args = append(args, year, month)
			argIdx += 2
		}
	}

	_ = argIdx // suppress unused variable warning
	rows, err := h.db.QueryContext(ctx,
		"SELECT id, amount, category, description, created_at, location FROM finances "+where+
			" ORDER BY created_at DESC LIMIT 500",
		args...,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch map data"})
	}
	defer rows.Close()

	var transactions []map[string]any
	for rows.Next() {
		var id int64
		var amount int64
		var category string
		var description *string
		var createdAt time.Time
		var locationStr *string
		if err := rows.Scan(&id, &amount, &category, &description, &createdAt, &locationStr); err != nil {
			continue
		}
		tx := map[string]any{
			"id":          id,
			"amount":      amount,
			"category":    category,
			"description": description,
			"created_at":  createdAt,
		}
		if locationStr != nil {
			tx["location"] = json.RawMessage(*locationStr)
		}
		transactions = append(transactions, tx)
	}
	if transactions == nil {
		transactions = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"transactions": transactions})
}

// DeleteTransaction removes a finance record.
// DELETE /api/v1/finance/transactions/:id
func (h *FinanceHandler) DeleteTransaction(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	txID := c.Param("id")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM finances WHERE id = $1 AND user_id = $2`,
		txID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete transaction"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
