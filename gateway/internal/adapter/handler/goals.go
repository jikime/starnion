package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type GoalsHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewGoalsHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *GoalsHandler {
	return &GoalsHandler{db: db, config: cfg, logger: logger}
}

func (h *GoalsHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	status := c.QueryParam("status")
	var args []any
	query := `SELECT g.id, g.title, g.icon, g.category, g.target_value, g.current_value, g.unit,
	                 g.progress, g.status, g.end_date, g.created_at,
	                 COUNT(gc.id) FILTER (
	                     WHERE gc.check_date >= CURRENT_DATE - INTERVAL '29 days'
	                 ) AS streak
	          FROM goals g
	          LEFT JOIN goal_checkins gc ON gc.goal_id = g.id
	          WHERE g.user_id = $1`
	args = append(args, userID)
	if status != "" {
		args = append(args, status)
		query += ` AND g.status = $2`
	}
	query += ` GROUP BY g.id ORDER BY g.created_at DESC`

	rows, err := h.db.QueryContext(c.Request().Context(), query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch goals"})
	}
	defer rows.Close()

	var goals []map[string]any
	for rows.Next() {
		var id, title, icon, category, unit, status, createdAt string
		var targetValue, currentValue float64
		var progress, streak int
		var endDate *string
		if err := rows.Scan(&id, &title, &icon, &category, &targetValue, &currentValue, &unit,
			&progress, &status, &endDate, &createdAt, &streak); err != nil {
			continue
		}
		goals = append(goals, map[string]any{
			"id":            id,
			"title":         title,
			"icon":          icon,
			"category":      category,
			"target_value":  targetValue,
			"current_value": currentValue,
			"unit":          unit,
			"progress":      progress,
			"status":        status,
			"target_date":   endDate,
			"streak":        streak,
			"created_at":    createdAt,
		})
	}

	if goals == nil {
		goals = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"goals": goals})
}

type CreateGoalRequest struct {
	Title       string  `json:"title" validate:"required"`
	Description *string `json:"description"`
	Category    *string `json:"category"`
	TargetDate  *string `json:"target_date"`
}

func (h *GoalsHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req CreateGoalRequest
	if err := c.Bind(&req); err != nil || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}

	id := uuid.New()
	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO goals (id, user_id, title, description, category, target_date)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, userID, req.Title, req.Description, req.Category, req.TargetDate,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create goal"})
	}

	return c.JSON(http.StatusCreated, map[string]any{"id": id.String(), "title": req.Title})
}

type UpdateProgressRequest struct {
	Progress int `json:"progress"`
}

func (h *GoalsHandler) UpdateProgress(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	if _, err := uuid.Parse(goalID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid goal id"})
	}
	var req UpdateProgressRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Progress < 0 {
		req.Progress = 0
	}
	if req.Progress > 100 {
		req.Progress = 100
	}

	status := "in_progress"
	if req.Progress == 100 {
		status = "completed"
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE goals SET progress = $1, status = $2, updated_at = NOW()
		 WHERE id = $3 AND user_id = $4`,
		req.Progress, status, goalID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update progress"})
	}

	return c.JSON(http.StatusOK, map[string]any{"progress": req.Progress, "status": status})
}

// GET /api/v1/goals/:id
func (h *GoalsHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	if _, err := uuid.Parse(goalID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid goal id"})
	}
	var id, title, status, createdAt string
	var description, category, endDate *string
	var progress int
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, title, description, category, end_date, progress, status, created_at
		 FROM goals WHERE id = $1 AND user_id = $2`,
		goalID, userID,
	).Scan(&id, &title, &description, &category, &endDate, &progress, &status, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "goal not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":          id,
		"title":       title,
		"description": description,
		"category":    category,
		"target_date": endDate,
		"progress":    progress,
		"status":      status,
		"created_at":  createdAt,
	})
}

// PUT /api/v1/goals/:id
func (h *GoalsHandler) Update(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	if _, err := uuid.Parse(goalID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid goal id"})
	}
	var req struct {
		Title       string  `json:"title"`
		Description *string `json:"description"`
		Category    *string `json:"category"`
		TargetDate  *string `json:"target_date"`
		Status      string  `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Status != "" {
		validStatuses := map[string]bool{"active": true, "in_progress": true, "completed": true, "paused": true}
		if !validStatuses[req.Status] {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid status"})
		}
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE goals SET
			title       = CASE WHEN $1 <> '' THEN $1 ELSE title END,
			description = COALESCE($2, description),
			category    = COALESCE($3, category),
			end_date    = COALESCE($4::date, end_date),
			status      = CASE WHEN $5 <> '' THEN $5 ELSE status END,
			updated_at  = NOW()
		 WHERE id = $6 AND user_id = $7`,
		req.Title, req.Description, req.Category, req.TargetDate, req.Status, goalID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update goal"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/goals/:id
func (h *GoalsHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	if _, err := uuid.Parse(goalID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid goal id"})
	}
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM goals WHERE id = $1 AND user_id = $2`,
		goalID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete goal"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
