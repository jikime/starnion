package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// GoalsHandler exposes goal management endpoints.
type GoalsHandler struct {
	db *sql.DB
}

// NewGoalsHandler creates a new GoalsHandler.
func NewGoalsHandler(db *sql.DB) *GoalsHandler {
	return &GoalsHandler{db: db}
}

// ── types ──────────────────────────────────────────────────────────────────────

type goalItem struct {
	ID            int64    `json:"id"`
	Title         string   `json:"title"`
	Icon          string   `json:"icon"`
	Category      string   `json:"category"`
	TargetValue   float64  `json:"target_value"`
	CurrentValue  float64  `json:"current_value"`
	Unit          string   `json:"unit"`
	Progress      float64  `json:"progress"`
	StartDate     string   `json:"start_date"`
	EndDate       *string  `json:"end_date"`
	Status        string   `json:"status"`
	Description   string   `json:"description"`
	DaysRemaining *int     `json:"days_remaining"`
	Streak        int      `json:"streak"`
	Checkins      []string `json:"checkins"` // "YYYY-MM-DD" list for current period
	CompletedDate *string  `json:"completed_date"`
	AbandonedDate *string  `json:"abandoned_date"`
	CreatedAt     string   `json:"created_at"`
}

// ── handlers ──────────────────────────────────────────────────────────────────

// ListGoals handles GET /api/v1/goals
// Query params: user_id, status (in_progress|completed|abandoned|all)
func (h *GoalsHandler) ListGoals(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	status := c.QueryParam("status")
	if status == "" {
		status = "all"
	}

	ctx := c.Request().Context()

	args := []any{userID}
	where := "WHERE user_id = $1"
	if status != "all" {
		args = append(args, status)
		where += " AND status = $2"
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT id, title, icon, category, target_value, current_value, unit,
		       start_date, end_date, status, COALESCE(description, ''),
		       completed_date, abandoned_date, created_at
		FROM goals
		`+where+`
		ORDER BY created_at DESC
	`, args...)
	if err != nil {
		log.Error().Err(err).Msg("goals: list failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	today := time.Now()
	goals := make([]goalItem, 0)
	goalIDs := make([]int64, 0)

	for rows.Next() {
		var g goalItem
		var startDate time.Time
		var endDate sql.NullTime
		var completedDate, abandonedDate sql.NullTime
		var createdAt time.Time

		if err := rows.Scan(
			&g.ID, &g.Title, &g.Icon, &g.Category,
			&g.TargetValue, &g.CurrentValue, &g.Unit,
			&startDate, &endDate, &g.Status, &g.Description,
			&completedDate, &abandonedDate, &createdAt,
		); err != nil {
			continue
		}

		g.StartDate = startDate.Format("2006-01-02")
		g.CreatedAt = createdAt.Format(time.RFC3339)

		if endDate.Valid {
			s := endDate.Time.Format("2006-01-02")
			g.EndDate = &s
			diff := int(endDate.Time.Sub(today).Hours()/24) + 1
			if diff > 0 {
				g.DaysRemaining = &diff
			}
		}
		if completedDate.Valid {
			s := completedDate.Time.Format("2006-01-02")
			g.CompletedDate = &s
		}
		if abandonedDate.Valid {
			s := abandonedDate.Time.Format("2006-01-02")
			g.AbandonedDate = &s
		}

		if g.TargetValue > 0 {
			g.Progress = g.CurrentValue / g.TargetValue * 100
			if g.Progress > 100 {
				g.Progress = 100
			}
		}
		g.Checkins = []string{}

		goals = append(goals, g)
		goalIDs = append(goalIDs, g.ID)
	}

	// Load checkins for in_progress goals (last 30 days)
	if len(goalIDs) > 0 {
		checkinMap := map[int64][]string{}
		cutoff := today.AddDate(0, 0, -30).Format("2006-01-02")

		placeholders := make([]string, len(goalIDs))
		checkinArgs := []any{cutoff}
		for i, id := range goalIDs {
			placeholders[i] = "$" + strconv.Itoa(i+2)
			checkinArgs = append(checkinArgs, id)
		}

		cRows, err := h.db.QueryContext(ctx, `
			SELECT goal_id, check_date::text
			FROM goal_checkins
			WHERE check_date >= $1
			  AND goal_id IN (`+strings.Join(placeholders, ",")+`)
			ORDER BY check_date ASC
		`, checkinArgs...)
		if err == nil {
			defer cRows.Close()
			for cRows.Next() {
				var gid int64
				var d string
				if err := cRows.Scan(&gid, &d); err == nil {
					checkinMap[gid] = append(checkinMap[gid], d)
				}
			}
		}

		// Compute streak and attach checkins
		for i := range goals {
			checkins := checkinMap[goals[i].ID]
			goals[i].Checkins = checkins

			// Streak: consecutive days ending today (or yesterday)
			if len(checkins) > 0 {
				goals[i].Streak = computeStreak(checkins, today)
				// For habit goals: current_value = number of check-ins if current_value matches
				if goals[i].Unit == "일" || goals[i].Unit == "회" {
					goals[i].CurrentValue = float64(len(checkins))
					if goals[i].TargetValue > 0 {
						goals[i].Progress = goals[i].CurrentValue / goals[i].TargetValue * 100
						if goals[i].Progress > 100 {
							goals[i].Progress = 100
						}
					}
				}
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{"goals": goals})
}

// GetGoal handles GET /api/v1/goals/:id
func (h *GoalsHandler) GetGoal(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id := c.Param("id")

	var g goalItem
	var startDate time.Time
	var endDate sql.NullTime
	var completedDate, abandonedDate sql.NullTime
	var createdAt time.Time

	err := h.db.QueryRowContext(c.Request().Context(), `
		SELECT id, title, icon, category, target_value, current_value, unit,
		       start_date, end_date, status, COALESCE(description, ''),
		       completed_date, abandoned_date, created_at
		FROM goals WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&g.ID, &g.Title, &g.Icon, &g.Category,
		&g.TargetValue, &g.CurrentValue, &g.Unit,
		&startDate, &endDate, &g.Status, &g.Description,
		&completedDate, &abandonedDate, &createdAt,
	)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	g.StartDate = startDate.Format("2006-01-02")
	g.CreatedAt = createdAt.Format(time.RFC3339)
	g.Checkins = []string{}

	today := time.Now()
	if endDate.Valid {
		s := endDate.Time.Format("2006-01-02")
		g.EndDate = &s
		diff := int(endDate.Time.Sub(today).Hours()/24) + 1
		if diff > 0 {
			g.DaysRemaining = &diff
		}
	}
	if completedDate.Valid {
		s := completedDate.Time.Format("2006-01-02")
		g.CompletedDate = &s
	}
	if abandonedDate.Valid {
		s := abandonedDate.Time.Format("2006-01-02")
		g.AbandonedDate = &s
	}
	if g.TargetValue > 0 {
		g.Progress = g.CurrentValue / g.TargetValue * 100
		if g.Progress > 100 {
			g.Progress = 100
		}
	}

	return c.JSON(http.StatusOK, g)
}

// CreateGoal handles POST /api/v1/goals
func (h *GoalsHandler) CreateGoal(c echo.Context) error {
	var req struct {
		UserID      string  `json:"user_id"`
		Title       string  `json:"title"`
		Icon        string  `json:"icon"`
		Category    string  `json:"category"`
		TargetValue float64 `json:"target_value"`
		Unit        string  `json:"unit"`
		StartDate   string  `json:"start_date"`
		EndDate     string  `json:"end_date"`
		Description string  `json:"description"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if req.UserID == "" || strings.TrimSpace(req.Title) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and title required"})
	}
	if req.Icon == "" {
		req.Icon = "🎯"
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if req.StartDate == "" {
		req.StartDate = time.Now().Format("2006-01-02")
	}

	var id int64
	var endDateArg any
	if req.EndDate != "" {
		endDateArg = req.EndDate
	}

	err := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO goals (user_id, title, icon, category, target_value, unit, start_date, end_date, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, req.UserID, req.Title, req.Icon, req.Category,
		req.TargetValue, req.Unit, req.StartDate, endDateArg, req.Description,
	).Scan(&id)
	if err != nil {
		log.Error().Err(err).Msg("goals: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

// UpdateGoal handles PUT /api/v1/goals/:id
func (h *GoalsHandler) UpdateGoal(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id := c.Param("id")

	var req struct {
		Title        string   `json:"title"`
		Icon         string   `json:"icon"`
		Category     string   `json:"category"`
		TargetValue  *float64 `json:"target_value"`
		CurrentValue *float64 `json:"current_value"`
		Unit         string   `json:"unit"`
		StartDate    string   `json:"start_date"`
		EndDate      string   `json:"end_date"`
		Status       string   `json:"status"`
		Description  string   `json:"description"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	// Determine completed/abandoned dates based on status
	var completedDateExpr, abandonedDateExpr string
	switch req.Status {
	case "completed":
		completedDateExpr = "completed_date = CURRENT_DATE,"
		abandonedDateExpr = ""
	case "abandoned":
		completedDateExpr = ""
		abandonedDateExpr = "abandoned_date = CURRENT_DATE,"
	default:
		completedDateExpr = ""
		abandonedDateExpr = ""
	}

	var endDateArg any
	if req.EndDate != "" {
		endDateArg = req.EndDate
	}

	query := `
		UPDATE goals SET
			title = COALESCE(NULLIF($1,''), title),
			icon = COALESCE(NULLIF($2,''), icon),
			category = COALESCE(NULLIF($3,''), category),
			target_value = COALESCE($4, target_value),
			current_value = COALESCE($5, current_value),
			unit = COALESCE(NULLIF($6,''), unit),
			start_date = COALESCE(NULLIF($7,'')::date, start_date),
			end_date = CASE WHEN $8::text IS NOT NULL THEN $8::date ELSE end_date END,
			status = COALESCE(NULLIF($9,''), status),
			description = COALESCE(NULLIF($10,''), description),
			` + completedDateExpr + abandonedDateExpr + `
			updated_at = NOW()
		WHERE id = $11 AND user_id = $12
	`

	result, err := h.db.ExecContext(c.Request().Context(), query,
		req.Title, req.Icon, req.Category,
		req.TargetValue, req.CurrentValue,
		req.Unit, req.StartDate, endDateArg,
		req.Status, req.Description,
		id, userID,
	)
	if err != nil {
		log.Error().Err(err).Msg("goals: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DeleteGoal handles DELETE /api/v1/goals/:id
func (h *GoalsHandler) DeleteGoal(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id := c.Param("id")

	result, err := h.db.ExecContext(c.Request().Context(),
		"DELETE FROM goals WHERE id = $1 AND user_id = $2", id, userID,
	)
	if err != nil {
		log.Error().Err(err).Msg("goals: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// AddCheckin handles POST /api/v1/goals/:id/checkin
func (h *GoalsHandler) AddCheckin(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id := c.Param("id")

	var req struct {
		Date string `json:"date"` // "YYYY-MM-DD", defaults to today
	}
	_ = c.Bind(&req)
	if req.Date == "" {
		req.Date = time.Now().Format("2006-01-02")
	}

	_, err := h.db.ExecContext(c.Request().Context(), `
		INSERT INTO goal_checkins (goal_id, user_id, check_date)
		VALUES ($1, $2, $3)
		ON CONFLICT (goal_id, check_date) DO NOTHING
	`, id, userID, req.Date)
	if err != nil {
		log.Error().Err(err).Msg("goals: checkin failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "checkin failed"})
	}

	// Update current_value for habit goals
	_, _ = h.db.ExecContext(c.Request().Context(), `
		UPDATE goals SET
			current_value = (SELECT COUNT(*) FROM goal_checkins WHERE goal_id = $1),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2 AND unit IN ('일','회')
	`, id, userID)

	return c.JSON(http.StatusOK, map[string]string{"status": "checked_in", "date": req.Date})
}

// RemoveCheckin handles DELETE /api/v1/goals/:id/checkin
func (h *GoalsHandler) RemoveCheckin(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id := c.Param("id")
	date := c.QueryParam("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	_, err := h.db.ExecContext(c.Request().Context(), `
		DELETE FROM goal_checkins
		WHERE goal_id = $1 AND user_id = $2 AND check_date = $3
	`, id, userID, date)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "remove failed"})
	}

	// Update current_value for habit goals
	_, _ = h.db.ExecContext(c.Request().Context(), `
		UPDATE goals SET
			current_value = (SELECT COUNT(*) FROM goal_checkins WHERE goal_id = $1),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2 AND unit IN ('일','회')
	`, id, userID)

	return c.JSON(http.StatusOK, map[string]string{"status": "removed", "date": date})
}

// computeStreak calculates the current consecutive-day streak ending on today or yesterday.
func computeStreak(checkins []string, today time.Time) int {
	if len(checkins) == 0 {
		return 0
	}
	// Build a set of check-in dates
	dateSet := make(map[string]bool, len(checkins))
	for _, d := range checkins {
		dateSet[d] = true
	}

	streak := 0
	day := today
	for {
		key := day.Format("2006-01-02")
		if !dateSet[key] {
			// Allow one gap (yesterday miss → check today)
			if streak == 0 {
				day = day.AddDate(0, 0, -1)
				key = day.Format("2006-01-02")
				if !dateSet[key] {
					break
				}
			} else {
				break
			}
		}
		streak++
		day = day.AddDate(0, 0, -1)
	}
	return streak
}
