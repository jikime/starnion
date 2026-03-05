package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// FinanceHandler exposes finance/ledger management as REST endpoints.
type FinanceHandler struct {
	db *sql.DB
}

// NewFinanceHandler creates a new FinanceHandler.
func NewFinanceHandler(db *sql.DB) *FinanceHandler {
	return &FinanceHandler{db: db}
}

// ── response types ────────────────────────────────────────────────────────────

type financeTransaction struct {
	ID          int64     `json:"id"`
	Amount      int       `json:"amount"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type monthlyPoint struct {
	Month   string `json:"month"`
	Income  int    `json:"income"`
	Expense int    `json:"expense"`
}

type categoryPoint struct {
	Category string `json:"category"`
	Amount   int    `json:"amount"`
}

type financeSummary struct {
	Income            int             `json:"income"`
	Expense           int             `json:"expense"`
	Net               int             `json:"net"`
	SavingsRate       float64         `json:"savings_rate"`
	MonthlyChart      []monthlyPoint  `json:"monthly_chart"`
	CategoryBreakdown []categoryPoint `json:"category_breakdown"`
}

// ── handlers ─────────────────────────────────────────────────────────────────

// GetSummary returns current-month totals, 6-month trend and category breakdown.
// GET /api/v1/finance/summary?user_id=...&year=YYYY&month=M
func (h *FinanceHandler) GetSummary(c echo.Context) error {
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

	// ── Current month income / expense ───────────────────────────────────────
	var income, expense int
	row := h.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
		FROM finances
		WHERE user_id = $1
		  AND EXTRACT(YEAR  FROM created_at) = $2
		  AND EXTRACT(MONTH FROM created_at) = $3
	`, userID, year, month)
	if err := row.Scan(&income, &expense); err != nil {
		log.Error().Err(err).Msg("finance: summary scan failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	net := income - expense
	var savingsRate float64
	if income > 0 {
		savingsRate = float64(net) / float64(income) * 100
	}

	// ── 6-month trend ─────────────────────────────────────────────────────────
	rows, err := h.db.QueryContext(ctx, `
		WITH months AS (
			SELECT generate_series(
				date_trunc('month', make_date($2, $3, 1)) - INTERVAL '5 months',
				date_trunc('month', make_date($2, $3, 1)),
				INTERVAL '1 month'
			) AS m
		)
		SELECT
			to_char(months.m, 'YYYY-MM') AS month,
			COALESCE(SUM(CASE WHEN f.amount > 0 THEN f.amount ELSE 0 END), 0) AS income,
			COALESCE(SUM(CASE WHEN f.amount < 0 THEN ABS(f.amount) ELSE 0 END), 0) AS expense
		FROM months
		LEFT JOIN finances f
			ON f.user_id = $1
			AND date_trunc('month', f.created_at) = months.m
		GROUP BY months.m
		ORDER BY months.m
	`, userID, year, month)
	if err != nil {
		log.Error().Err(err).Msg("finance: monthly chart query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var monthlyChart []monthlyPoint
	for rows.Next() {
		var p monthlyPoint
		if err := rows.Scan(&p.Month, &p.Income, &p.Expense); err != nil {
			continue
		}
		monthlyChart = append(monthlyChart, p)
	}
	if monthlyChart == nil {
		monthlyChart = []monthlyPoint{}
	}

	// ── Category breakdown (current month, expenses only) ────────────────────
	catRows, err := h.db.QueryContext(ctx, `
		SELECT category, SUM(ABS(amount)) AS total
		FROM finances
		WHERE user_id = $1
		  AND amount < 0
		  AND EXTRACT(YEAR  FROM created_at) = $2
		  AND EXTRACT(MONTH FROM created_at) = $3
		GROUP BY category
		ORDER BY total DESC
	`, userID, year, month)
	if err != nil {
		log.Error().Err(err).Msg("finance: category breakdown query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer catRows.Close()

	var breakdown []categoryPoint
	for catRows.Next() {
		var p categoryPoint
		if err := catRows.Scan(&p.Category, &p.Amount); err != nil {
			continue
		}
		breakdown = append(breakdown, p)
	}
	if breakdown == nil {
		breakdown = []categoryPoint{}
	}

	return c.JSON(http.StatusOK, financeSummary{
		Income:            income,
		Expense:           expense,
		Net:               net,
		SavingsRate:       savingsRate,
		MonthlyChart:      monthlyChart,
		CategoryBreakdown: breakdown,
	})
}

// ListTransactions returns paginated transactions for a user/month.
// GET /api/v1/finance/transactions?user_id=...&year=YYYY&month=M&category=...&type=expense|income&page=1&limit=20
func (h *FinanceHandler) ListTransactions(c echo.Context) error {
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

	page := 1
	limit := 50
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	offset := (page - 1) * limit

	category := c.QueryParam("category")
	txType := c.QueryParam("type") // "expense" | "income" | ""

	ctx := c.Request().Context()

	// Build WHERE clauses dynamically.
	args := []any{userID, year, month}
	where := `user_id = $1
		AND EXTRACT(YEAR  FROM created_at) = $2
		AND EXTRACT(MONTH FROM created_at) = $3`

	if category != "" {
		args = append(args, category)
		where += ` AND category = $` + strconv.Itoa(len(args))
	}
	if txType == "expense" {
		where += " AND amount < 0"
	} else if txType == "income" {
		where += " AND amount > 0"
	}

	// Total count.
	var total int
	if err := h.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM finances WHERE "+where, args...,
	).Scan(&total); err != nil {
		log.Error().Err(err).Msg("finance: count query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	// Paginated rows.
	args = append(args, limit, offset)
	rows, err := h.db.QueryContext(ctx,
		`SELECT id, amount, category, COALESCE(description,''), created_at
		FROM finances WHERE `+where+
			` ORDER BY created_at DESC
		LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)),
		args...,
	)
	if err != nil {
		log.Error().Err(err).Msg("finance: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var txs []financeTransaction
	for rows.Next() {
		var t financeTransaction
		if err := rows.Scan(&t.ID, &t.Amount, &t.Category, &t.Description, &t.CreatedAt); err != nil {
			continue
		}
		txs = append(txs, t)
	}
	if txs == nil {
		txs = []financeTransaction{}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"transactions": txs,
		"total":        total,
		"page":         page,
		"limit":        limit,
	})
}

// CreateTransaction inserts a new finance record.
// POST /api/v1/finance/transactions
func (h *FinanceHandler) CreateTransaction(c echo.Context) error {
	var req struct {
		UserID      string `json:"user_id"`
		Amount      int    `json:"amount"`
		Category    string `json:"category"`
		Description string `json:"description"`
		CreatedAt   string `json:"created_at"` // "YYYY-MM-DD", optional
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.UserID == "" || req.Amount == 0 || req.Category == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id, amount, category required"})
	}

	var createdAt time.Time
	if req.CreatedAt != "" {
		if t, err := time.Parse("2006-01-02", req.CreatedAt); err == nil {
			createdAt = t
		}
	}
	if createdAt.IsZero() {
		createdAt = time.Now()
	}

	ctx := c.Request().Context()
	var id int64
	err := h.db.QueryRowContext(ctx,
		`INSERT INTO finances (user_id, amount, category, description, created_at)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.UserID, req.Amount, req.Category, req.Description, createdAt,
	).Scan(&id)
	if err != nil {
		log.Error().Err(err).Msg("finance: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "insert failed"})
	}

	return c.JSON(http.StatusCreated, financeTransaction{
		ID:          id,
		Amount:      req.Amount,
		Category:    req.Category,
		Description: req.Description,
		CreatedAt:   createdAt,
	})
}

// UpdateTransaction updates a finance record by id (user-scoped).
// PUT /api/v1/finance/transactions/:id?user_id=...
func (h *FinanceHandler) UpdateTransaction(c echo.Context) error {
	userID := c.QueryParam("user_id")
	idStr := c.Param("id")
	if userID == "" || idStr == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and id required"})
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var req struct {
		Amount      int    `json:"amount"`
		Category    string `json:"category"`
		Description string `json:"description"`
		CreatedAt   string `json:"created_at"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := c.Request().Context()

	var createdAt *time.Time
	if req.CreatedAt != "" {
		if t, err := time.Parse("2006-01-02", req.CreatedAt); err == nil {
			createdAt = &t
		}
	}

	var res sql.Result
	if createdAt != nil {
		res, err = h.db.ExecContext(ctx,
			`UPDATE finances SET amount=$1, category=$2, description=$3, created_at=$4
			WHERE id=$5 AND user_id=$6`,
			req.Amount, req.Category, req.Description, *createdAt, id, userID,
		)
	} else {
		res, err = h.db.ExecContext(ctx,
			`UPDATE finances SET amount=$1, category=$2, description=$3
			WHERE id=$4 AND user_id=$5`,
			req.Amount, req.Category, req.Description, id, userID,
		)
	}
	if err != nil {
		log.Error().Err(err).Msg("finance: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": id, "updated": true})
}

// DeleteTransaction removes a finance record by id (user-scoped).
// DELETE /api/v1/finance/transactions/:id?user_id=...
func (h *FinanceHandler) DeleteTransaction(c echo.Context) error {
	userID := c.QueryParam("user_id")
	idStr := c.Param("id")
	if userID == "" || idStr == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and id required"})
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	ctx := c.Request().Context()
	res, err := h.db.ExecContext(ctx,
		`DELETE FROM finances WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		log.Error().Err(err).Msg("finance: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": id, "deleted": true})
}
