package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// DdayHandler exposes D-Day management endpoints.
type DdayHandler struct {
	db *sql.DB
}

// NewDdayHandler creates a new DdayHandler.
func NewDdayHandler(db *sql.DB) *DdayHandler {
	return &DdayHandler{db: db}
}

type ddayItem struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	TargetDate  string `json:"target_date"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	DDayValue   int    `json:"dday_value"` // negative = days remaining, 0 = today, positive = days passed
	DDayLabel   string `json:"dday_label"` // "D-30", "D-Day!", "D+5"
	CreatedAt   string `json:"created_at"`
}

func computeDday(targetDate time.Time) (int, string) {
	now := time.Now().Truncate(24 * time.Hour)
	target := targetDate.Truncate(24 * time.Hour)
	diff := int(target.Sub(now).Hours() / 24)
	switch {
	case diff > 0:
		return -diff, "D-" + strconv.Itoa(diff)
	case diff == 0:
		return 0, "D-Day!"
	default:
		return -diff, "D+" + strconv.Itoa(-diff)
	}
}

func scanDday(rows interface {
	Scan(...any) error
}) (ddayItem, error) {
	var d ddayItem
	var targetDate time.Time
	var createdAt time.Time
	if err := rows.Scan(&d.ID, &d.Title, &targetDate, &d.Icon, &d.Description, &createdAt); err != nil {
		return d, err
	}
	d.TargetDate = targetDate.Format("2006-01-02")
	d.CreatedAt = createdAt.Format("2006-01-02")
	d.DDayValue, d.DDayLabel = computeDday(targetDate)
	return d, nil
}

// ListDdays handles GET /api/v1/ddays?user_id=
func (h *DdayHandler) ListDdays(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT id, title, target_date, icon, description, created_at
		FROM ddays WHERE user_id = $1
		ORDER BY target_date ASC
	`, userID)
	if err != nil {
		log.Error().Err(err).Msg("ddays: list failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []ddayItem{}
	for rows.Next() {
		d, err := scanDday(rows)
		if err != nil {
			continue
		}
		items = append(items, d)
	}
	return c.JSON(http.StatusOK, items)
}

// CreateDday handles POST /api/v1/ddays?user_id=
func (h *DdayHandler) CreateDday(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}

	var body struct {
		Title       string `json:"title"`
		TargetDate  string `json:"target_date"`
		Icon        string `json:"icon"`
		Description string `json:"description"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if body.Title == "" || body.TargetDate == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title and target_date required"})
	}
	if body.Icon == "" {
		body.Icon = "📅"
	}

	row := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO ddays (user_id, title, target_date, icon, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, title, target_date, icon, description, created_at
	`, userID, body.Title, body.TargetDate, body.Icon, body.Description)

	d, err := scanDday(row)
	if err != nil {
		log.Error().Err(err).Msg("ddays: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}
	return c.JSON(http.StatusCreated, d)
}

// UpdateDday handles PUT /api/v1/ddays/:id?user_id=
func (h *DdayHandler) UpdateDday(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var body struct {
		Title       string `json:"title"`
		TargetDate  string `json:"target_date"`
		Icon        string `json:"icon"`
		Description string `json:"description"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	row := h.db.QueryRowContext(c.Request().Context(), `
		UPDATE ddays
		SET title=$1, target_date=$2, icon=$3, description=$4, updated_at=NOW()
		WHERE id=$5 AND user_id=$6
		RETURNING id, title, target_date, icon, description, created_at
	`, body.Title, body.TargetDate, body.Icon, body.Description, id, userID)

	d, err := scanDday(row)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	if err != nil {
		log.Error().Err(err).Msg("ddays: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	return c.JSON(http.StatusOK, d)
}

// DeleteDday handles DELETE /api/v1/ddays/:id?user_id=
func (h *DdayHandler) DeleteDday(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id required"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	result, err := h.db.ExecContext(c.Request().Context(), `
		DELETE FROM ddays WHERE id=$1 AND user_id=$2
	`, id, userID)
	if err != nil {
		log.Error().Err(err).Msg("ddays: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
