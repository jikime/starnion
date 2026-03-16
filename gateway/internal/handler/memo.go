package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// MemoHandler exposes memo management endpoints.
type MemoHandler struct {
	db *sql.DB
}

// NewMemoHandler creates a new MemoHandler.
func NewMemoHandler(db *sql.DB) *MemoHandler {
	return &MemoHandler{db: db}
}

type memoItem struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Tag       string `json:"tag"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// ListMemos handles GET /api/v1/memos
// Query params: user_id, tag, q (search)
func (h *MemoHandler) ListMemos(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	tag := c.QueryParam("tag")
	q := c.QueryParam("q")

	query := `SELECT id, title, content, tag, created_at, updated_at FROM memos WHERE user_id = $1`
	args := []any{userID}
	idx := 2

	if tag != "" && tag != "전체" {
		query += ` AND tag = $` + strconv.Itoa(idx)
		args = append(args, tag)
		idx++
	}
	if q != "" {
		query += ` AND (title ILIKE $` + strconv.Itoa(idx) + ` OR content ILIKE $` + strconv.Itoa(idx) + `)`
		args = append(args, "%"+q+"%")
		idx++
	}
	_ = idx
	query += ` ORDER BY updated_at DESC LIMIT 500`

	rows, err := h.db.QueryContext(c.Request().Context(), query, args...)
	if err != nil {
		log.Error().Err(err).Msg("memos: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []memoItem{}
	for rows.Next() {
		var m memoItem
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&m.ID, &m.Title, &m.Content, &m.Tag, &createdAt, &updatedAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format("2006-01-02")
		m.UpdatedAt = updatedAt.Format("2006-01-02")
		items = append(items, m)
	}
	return c.JSON(http.StatusOK, items)
}

// CreateMemo handles POST /api/v1/memos
func (h *MemoHandler) CreateMemo(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Tag     string `json:"tag"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if body.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title required"})
	}
	if body.Tag == "" {
		body.Tag = "개인"
	}

	var m memoItem
	var createdAt, updatedAt time.Time
	err := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO memos (user_id, title, content, tag)
		VALUES ($1, $2, $3, $4)
		RETURNING id, title, content, tag, created_at, updated_at
	`, userID, body.Title, body.Content, body.Tag).Scan(
		&m.ID, &m.Title, &m.Content, &m.Tag, &createdAt, &updatedAt,
	)
	if err != nil {
		log.Error().Err(err).Msg("memos: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}
	m.CreatedAt = createdAt.Format("2006-01-02")
	m.UpdatedAt = updatedAt.Format("2006-01-02")
	return c.JSON(http.StatusCreated, m)
}

// UpdateMemo handles PUT /api/v1/memos/:id
func (h *MemoHandler) UpdateMemo(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Tag     string `json:"tag"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	var m memoItem
	var createdAt, updatedAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(), `
		UPDATE memos SET title=$1, content=$2, tag=$3, updated_at=NOW()
		WHERE id=$4 AND user_id=$5
		RETURNING id, title, content, tag, created_at, updated_at
	`, body.Title, body.Content, body.Tag, id, userID).Scan(
		&m.ID, &m.Title, &m.Content, &m.Tag, &createdAt, &updatedAt,
	)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	if err != nil {
		log.Error().Err(err).Msg("memos: update failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	m.CreatedAt = createdAt.Format("2006-01-02")
	m.UpdatedAt = updatedAt.Format("2006-01-02")
	return c.JSON(http.StatusOK, m)
}

// DeleteMemo handles DELETE /api/v1/memos/:id
func (h *MemoHandler) DeleteMemo(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	result, err := h.db.ExecContext(c.Request().Context(), `
		DELETE FROM memos WHERE id=$1 AND user_id=$2
	`, id, userID)
	if err != nil {
		log.Error().Err(err).Msg("memos: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
