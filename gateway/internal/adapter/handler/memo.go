package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type MemoHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewMemoHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *MemoHandler {
	return &MemoHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/memo
func (h *MemoHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	tag := c.QueryParam("tag")
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close() error
	}
	if tag != "" {
		rows, err = h.db.QueryContext(c.Request().Context(),
			`SELECT id, title, content, tag, created_at, updated_at
			 FROM memos WHERE user_id = $1 AND tag = $2
			 ORDER BY updated_at DESC LIMIT 100`,
			userID, tag,
		)
	} else {
		rows, err = h.db.QueryContext(c.Request().Context(),
			`SELECT id, title, content, tag, created_at, updated_at
			 FROM memos WHERE user_id = $1
			 ORDER BY updated_at DESC LIMIT 100`,
			userID,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch memos"})
	}
	defer rows.Close()

	var memos []map[string]any
	for rows.Next() {
		var id int64
		var title, content, tag string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &title, &content, &tag, &createdAt, &updatedAt); err != nil {
			continue
		}
		memos = append(memos, map[string]any{
			"id":         id,
			"title":      title,
			"content":    content,
			"tag":        tag,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}
	if memos == nil {
		memos = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"memos": memos})
}

// POST /api/v1/memo
func (h *MemoHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Tag     string `json:"tag"`
	}
	if err := c.Bind(&req); err != nil || req.Content == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content is required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.Content) > 10000 {
		req.Content = req.Content[:10000]
	}
	if len(req.Tag) > 50 {
		req.Tag = req.Tag[:50]
	}
	if req.Tag == "" {
		req.Tag = "개인"
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO memos (user_id, title, content, tag) VALUES ($1, $2, $3, $4) RETURNING id`,
		userID, req.Title, req.Content, req.Tag,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create memo"})
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":      id,
		"title":   req.Title,
		"content": req.Content,
		"tag":     req.Tag,
	})
}

// GET /api/v1/memo/:id
func (h *MemoHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	memoID := c.Param("id")
	var id int64
	var title, content, tag string
	var createdAt, updatedAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, title, content, tag, created_at, updated_at FROM memos WHERE id = $1 AND user_id = $2`,
		memoID, userID,
	).Scan(&id, &title, &content, &tag, &createdAt, &updatedAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "memo not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":         id,
		"title":      title,
		"content":    content,
		"tag":        tag,
		"created_at": createdAt,
		"updated_at": updatedAt,
	})
}

// PUT /api/v1/memo/:id
func (h *MemoHandler) Update(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	memoID := c.Param("id")
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Tag     string `json:"tag"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE memos SET
			title   = CASE WHEN $1 <> '' THEN $1 ELSE title END,
			content = CASE WHEN $2 <> '' THEN $2 ELSE content END,
			tag     = CASE WHEN $3 <> '' THEN $3 ELSE tag END,
			updated_at = NOW()
		 WHERE id = $4 AND user_id = $5`,
		req.Title, req.Content, req.Tag, memoID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update memo"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/memo/:id
func (h *MemoHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	memoID := c.Param("id")
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM memos WHERE id = $1 AND user_id = $2`,
		memoID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete memo"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
