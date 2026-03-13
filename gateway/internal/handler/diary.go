package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lib/pq"
	"github.com/rs/zerolog/log"
)

// DiaryHandler exposes diary/journal management as REST endpoints.
type DiaryHandler struct {
	db *sql.DB
}

// NewDiaryHandler creates a new DiaryHandler.
func NewDiaryHandler(db *sql.DB) *DiaryHandler {
	return &DiaryHandler{db: db}
}

// ── response types ─────────────────────────────────────────────────────────────

type diaryEntry struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Mood      string    `json:"mood"`
	Tags      []string  `json:"tags"`
	EntryDate string    `json:"entry_date"` // "YYYY-MM-DD"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ── handlers ──────────────────────────────────────────────────────────────────

// ListEntries handles GET /api/v1/diary/entries
// Query params: user_id, year, month, page, limit
func (h *DiaryHandler) ListEntries(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	args := []any{userID}
	where := "WHERE user_id = $1"
	argIdx := 2

	if y := c.QueryParam("year"); y != "" {
		where += " AND EXTRACT(YEAR FROM entry_date) = $" + strconv.Itoa(argIdx)
		args = append(args, y)
		argIdx++
	}
	if m := c.QueryParam("month"); m != "" {
		where += " AND EXTRACT(MONTH FROM entry_date) = $" + strconv.Itoa(argIdx)
		args = append(args, m)
		argIdx++
	}

	// Total count
	var total int
	err := h.db.QueryRowContext(c.Request().Context(),
		"SELECT COUNT(*) FROM diary_entries "+where, args...,
	).Scan(&total)
	if err != nil {
		log.Error().Err(err).Msg("diary: count failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	// Paginated rows
	rows, err := h.db.QueryContext(c.Request().Context(),
		"SELECT id, title, content, mood, tags, entry_date, created_at, updated_at "+
			"FROM diary_entries "+where+
			" ORDER BY entry_date DESC "+
			" LIMIT $"+strconv.Itoa(argIdx)+" OFFSET $"+strconv.Itoa(argIdx+1),
		append(args, limit, offset)...,
	)
	if err != nil {
		log.Error().Err(err).Msg("diary: list failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	entries := make([]diaryEntry, 0)
	for rows.Next() {
		var e diaryEntry
		var d time.Time
		var tags pq.StringArray
		if err := rows.Scan(&e.ID, &e.Title, &e.Content, &e.Mood, &tags, &d, &e.CreatedAt, &e.UpdatedAt); err != nil {
			continue
		}
		e.Tags = []string(tags)
		e.EntryDate = d.Format("2006-01-02")
		entries = append(entries, e)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"entries": entries,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

// GetEntry handles GET /api/v1/diary/entries/:id
func (h *DiaryHandler) GetEntry(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id := c.Param("id")

	var e diaryEntry
	var d time.Time
	var tags pq.StringArray
	err := h.db.QueryRowContext(c.Request().Context(),
		"SELECT id, title, content, mood, tags, entry_date, created_at, updated_at "+
			"FROM diary_entries WHERE id = $1 AND user_id = $2",
		id, userID,
	).Scan(&e.ID, &e.Title, &e.Content, &e.Mood, &tags, &d, &e.CreatedAt, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	if err != nil {
		log.Error().Err(err).Msg("diary: get failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	e.Tags = []string(tags)
	e.EntryDate = d.Format("2006-01-02")
	return c.JSON(http.StatusOK, e)
}

// CreateEntry handles POST /api/v1/diary/entries
func (h *DiaryHandler) CreateEntry(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title     string   `json:"title"`
		Content   string   `json:"content"`
		Mood      string   `json:"mood"`
		Tags      []string `json:"tags"`
		EntryDate string   `json:"entry_date"` // "YYYY-MM-DD"
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if strings.TrimSpace(req.Content) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content required"})
	}
	if req.Mood == "" {
		req.Mood = "보통"
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	entryDate := time.Now().Format("2006-01-02")
	if req.EntryDate != "" {
		if _, err := time.Parse("2006-01-02", req.EntryDate); err == nil {
			entryDate = req.EntryDate
		}
	}

	var id int64
	err := h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO diary_entries (user_id, title, content, mood, tags, entry_date)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		userID, req.Title, req.Content, req.Mood, pq.Array(req.Tags), entryDate,
	).Scan(&id)
	if err != nil {
		log.Error().Err(err).Msg("diary: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

// UpdateEntry handles PUT /api/v1/diary/entries/:id
func (h *DiaryHandler) UpdateEntry(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id := c.Param("id")

	var req struct {
		Title     string   `json:"title"`
		Content   string   `json:"content"`
		Mood      string   `json:"mood"`
		Tags      []string `json:"tags"`
		EntryDate string   `json:"entry_date"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	var result sql.Result
	var err error

	if req.EntryDate != "" {
		if _, parseErr := time.Parse("2006-01-02", req.EntryDate); parseErr == nil {
			result, err = h.db.ExecContext(c.Request().Context(),
				`UPDATE diary_entries SET title=$1, content=$2, mood=$3, tags=$4, entry_date=$5, updated_at=NOW()
				 WHERE id=$6 AND user_id=$7`,
				req.Title, req.Content, req.Mood, pq.Array(req.Tags), req.EntryDate, id, userID,
			)
		}
	}
	if result == nil {
		result, err = h.db.ExecContext(c.Request().Context(),
			`UPDATE diary_entries SET title=$1, content=$2, mood=$3, tags=$4, updated_at=NOW()
			 WHERE id=$5 AND user_id=$6`,
			req.Title, req.Content, req.Mood, pq.Array(req.Tags), id, userID,
		)
	}
	if err != nil {
		log.Error().Err(err).Msg("diary: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DeleteEntry handles DELETE /api/v1/diary/entries/:id
func (h *DiaryHandler) DeleteEntry(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id := c.Param("id")

	result, err := h.db.ExecContext(c.Request().Context(),
		"DELETE FROM diary_entries WHERE id = $1 AND user_id = $2", id, userID,
	)
	if err != nil {
		log.Error().Err(err).Msg("diary: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
