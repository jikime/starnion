package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type DdayHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewDdayHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *DdayHandler {
	return &DdayHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/dday
func (h *DdayHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, title, target_date, icon, description, recurring, created_at
		 FROM ddays WHERE user_id = $1
		 ORDER BY target_date ASC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch ddays"})
	}
	defer rows.Close()

	var ddays []map[string]any
	for rows.Next() {
		var id int64
		var title, icon, description string
		var targetDate time.Time
		var recurring bool
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &targetDate, &icon, &description, &recurring, &createdAt); err != nil {
			continue
		}
		ddays = append(ddays, map[string]any{
			"id":          id,
			"title":       title,
			"target_date": targetDate.Format("2006-01-02"),
			"icon":        icon,
			"description": description,
			"recurring":   recurring,
			"created_at":  createdAt,
		})
	}
	if ddays == nil {
		ddays = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"ddays": ddays})
}

// POST /api/v1/dday
func (h *DdayHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title       string `json:"title"`
		TargetDate  string `json:"target_date"`
		Icon        string `json:"icon"`
		Description string `json:"description"`
		Recurring   bool   `json:"recurring"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.TargetDate == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title and target_date are required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.Description) > 1000 {
		req.Description = req.Description[:1000]
	}
	if len(req.Icon) > 10 {
		req.Icon = req.Icon[:10]
	}
	if req.Icon == "" {
		req.Icon = "📅"
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO ddays (user_id, title, target_date, icon, description, recurring)
		 VALUES ($1, $2, $3::date, $4, $5, $6) RETURNING id`,
		userID, req.Title, req.TargetDate, req.Icon, req.Description, req.Recurring,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create dday"})
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":          id,
		"title":       req.Title,
		"target_date": req.TargetDate,
	})
}

// PUT /api/v1/dday/:id
func (h *DdayHandler) Update(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ddayID := c.Param("id")
	var req struct {
		Title       string `json:"title"`
		TargetDate  string `json:"target_date"`
		Icon        string `json:"icon"`
		Description string `json:"description"`
		Recurring   *bool  `json:"recurring"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE ddays SET
			title       = CASE WHEN $1 <> '' THEN $1 ELSE title END,
			target_date = CASE WHEN $2 <> '' THEN $2::date ELSE target_date END,
			icon        = CASE WHEN $3 <> '' THEN $3 ELSE icon END,
			description = CASE WHEN $4 <> '' THEN $4 ELSE description END,
			updated_at  = NOW()
		 WHERE id = $5 AND user_id = $6`,
		req.Title, req.TargetDate, req.Icon, req.Description, ddayID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update dday"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/dday/:id
func (h *DdayHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ddayID := c.Param("id")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM ddays WHERE id = $1 AND user_id = $2`,
		ddayID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete dday"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
