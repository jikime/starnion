package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type DiaryHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewDiaryHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *DiaryHandler {
	return &DiaryHandler{db: db, config: cfg, logger: logger}
}

func (h *DiaryHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 500 {
		limit = 50
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit
	year, _ := strconv.Atoi(c.QueryParam("year"))
	month, _ := strconv.Atoi(c.QueryParam("month"))

	var args []any
	args = append(args, userID)
	query := `SELECT id, title, content, mood, tags, entry_date, created_at
	          FROM diary_entries WHERE user_id = $1`
	if year > 0 && month > 0 {
		args = append(args, year, month)
		query += ` AND EXTRACT(YEAR FROM entry_date) = $2 AND EXTRACT(MONTH FROM entry_date) = $3`
	} else if year > 0 {
		args = append(args, year)
		query += ` AND EXTRACT(YEAR FROM entry_date) = $2`
	}
	args = append(args, limit, offset)
	query += ` ORDER BY entry_date DESC, created_at DESC LIMIT $` + strconv.Itoa(len(args)-1) + ` OFFSET $` + strconv.Itoa(len(args))

	rows, err := h.db.QueryContext(c.Request().Context(), query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch diary entries"})
	}
	defer rows.Close()

	var entries []map[string]any
	for rows.Next() {
		var id, title, content string
		var mood *string
		var tagsStr string
		var entryDate time.Time
		var createdAt string
		if err := rows.Scan(&id, &title, &content, &mood, &tagsStr, &entryDate, &createdAt); err != nil {
			continue
		}
		entries = append(entries, map[string]any{
			"id":         id,
			"title":      title,
			"content":    content,
			"mood":       mood,
			"tags":       parsePostgresArray(tagsStr),
			"entry_date": entryDate.Format("2006-01-02"),
			"created_at": createdAt,
		})
	}

	if entries == nil {
		entries = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"entries": entries})
}

type CreateDiaryRequest struct {
	Content   string  `json:"content" validate:"required"`
	Mood      *string `json:"mood"`
	EntryDate *string `json:"entry_date"`
}

func (h *DiaryHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req CreateDiaryRequest
	if err := c.Bind(&req); err != nil || req.Content == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content is required"})
	}
	if len(req.Content) > 10000 {
		req.Content = req.Content[:10000]
	}

	entryDate := time.Now().Format("2006-01-02")
	if req.EntryDate != nil && *req.EntryDate != "" {
		entryDate = *req.EntryDate
	}

	id := uuid.New()
	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO diary_entries (id, user_id, content, mood, entry_date) VALUES ($1, $2, $3, $4, $5)`,
		id, userID, req.Content, req.Mood, entryDate,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save diary entry"})
	}

	// Generate embedding asynchronously.
	go func() {
		ctx := context.Background()
		vec, err := generateEmbeddingAuto(ctx, h.db, userID.String(), h.config.EncryptionKey, req.Content)
		if err != nil {
			h.logger.Warn("diary embedding failed", zap.Error(err))
			return
		}
		_, err = h.db.ExecContext(ctx,
			`UPDATE diary_entries SET embedding = $1::vector WHERE id = $2`,
			vectorLiteral(vec), id,
		)
		if err != nil {
			h.logger.Warn("diary embedding update failed", zap.Error(err))
		}
	}()

	return c.JSON(http.StatusCreated, map[string]any{
		"id":         id.String(),
		"entry_date": entryDate,
	})
}

// GET /api/v1/diary/:id
func (h *DiaryHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	entryID := c.Param("id")
	if _, err := uuid.Parse(entryID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid diary entry id"})
	}
	var id, content, createdAt string
	var mood *string
	var entryDate time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, content, mood, entry_date, created_at FROM diary_entries WHERE id = $1 AND user_id = $2`,
		entryID, userID,
	).Scan(&id, &content, &mood, &entryDate, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "diary entry not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":         id,
		"content":    content,
		"mood":       mood,
		"entry_date": entryDate.Format("2006-01-02"),
		"created_at": createdAt,
	})
}

// parsePostgresArray converts a PostgreSQL array literal like {val1,val2} to []string.
func parsePostgresArray(s string) []string {
	if s == "" || s == "{}" {
		return []string{}
	}
	// Strip leading/trailing braces.
	if len(s) >= 2 && s[0] == '{' && s[len(s)-1] == '}' {
		s = s[1 : len(s)-1]
	}
	if s == "" {
		return []string{}
	}
	return strings.Split(s, ",")
}

// PUT /api/v1/diary/:id
func (h *DiaryHandler) Update(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	entryID := c.Param("id")
	if _, err := uuid.Parse(entryID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid diary entry id"})
	}
	var req struct {
		Content   string  `json:"content"`
		Mood      *string `json:"mood"`
		EntryDate *string `json:"entry_date"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if len(req.Content) > 10000 {
		req.Content = req.Content[:10000]
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE diary_entries SET
			content    = CASE WHEN $1 <> '' THEN $1 ELSE content END,
			mood       = COALESCE($2, mood),
			updated_at = NOW()
		 WHERE id = $3 AND user_id = $4`,
		req.Content, req.Mood, entryID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update diary entry"})
	}

	// Re-generate embedding if content changed.
	if req.Content != "" {
		newContent := req.Content
		go func() {
			ctx := context.Background()
			vec, err := generateEmbeddingAuto(ctx, h.db, userID.String(), h.config.EncryptionKey, newContent)
			if err != nil {
				h.logger.Warn("diary embedding update failed", zap.Error(err))
				return
			}
			_, err = h.db.ExecContext(ctx,
				`UPDATE diary_entries SET embedding = $1::vector WHERE id = $2 AND user_id = $3`,
				vectorLiteral(vec), entryID, userID,
			)
			if err != nil {
				h.logger.Warn("diary embedding db update failed", zap.Error(err))
			}
		}()
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/diary/:id
func (h *DiaryHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	entryID := c.Param("id")
	if _, err := uuid.Parse(entryID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid diary entry id"})
	}
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM diary_entries WHERE id = $1 AND user_id = $2`,
		entryID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete diary entry"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
