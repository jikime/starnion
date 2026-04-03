package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type KnowledgeHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewKnowledgeHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *KnowledgeHandler {
	return &KnowledgeHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/knowledge?q=...&prefix=...&page=1&limit=20
func (h *KnowledgeHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Support both ?q= (full text) and ?prefix= (key prefix filter)
	q := c.QueryParam("q")
	prefix := c.QueryParam("prefix")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit
	ctx := c.Request().Context()

	query := `SELECT id, key, value, source, created_at FROM knowledge_base WHERE user_id = $1`
	args := []any{userID}
	argIdx := 2

	if prefix != "" {
		query += ` AND key LIKE $` + strconv.Itoa(argIdx)
		args = append(args, prefix+"%")
		argIdx++
	} else if q != "" {
		query += ` AND (key ILIKE $` + strconv.Itoa(argIdx) + ` OR value ILIKE $` + strconv.Itoa(argIdx) + `)`
		args = append(args, "%"+q+"%")
		argIdx++
	}
	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch knowledge"})
	}
	defer rows.Close()

	var items []map[string]any
	for rows.Next() {
		var id int64
		var key, value string
		var source *string
		var createdAt time.Time
		if rows.Scan(&id, &key, &value, &source, &createdAt) != nil {
			continue
		}
		items = append(items, map[string]any{
			"id":         id,
			"key":        key,
			"value":      value,
			"source":     source,
			"created_at": createdAt,
		})
	}
	if items == nil {
		items = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM knowledge_base WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{
		"items": items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// POST /api/v1/knowledge  {"key": "...", "value": "...", "source": "..."}
func (h *KnowledgeHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Key    string `json:"key"`
		Value  string `json:"value"`
		Source string `json:"source"`
	}
	if err := c.Bind(&req); err != nil || req.Key == "" || req.Value == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "key and value are required"})
	}
	if len(req.Key) > 500 {
		req.Key = req.Key[:500]
	}
	if len(req.Value) > 10000 {
		req.Value = req.Value[:10000]
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO knowledge_base (user_id, key, value, source)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		userID, req.Key, req.Value, req.Source,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create knowledge item"})
	}

	// Generate embedding asynchronously so the HTTP response is immediate.
	itemID := id
	go func() {
		ctx := context.Background()
		text := req.Key + "\n" + req.Value
		vec, err := generateEmbeddingAuto(ctx, h.db, userID.String(), h.config.EncryptionKey, text)
		if err != nil {
			h.logger.Warn("knowledge embedding failed", zap.Error(err))
			return
		}
		_, err = h.db.ExecContext(ctx,
			`UPDATE knowledge_base SET embedding = $1::vector WHERE id = $2`,
			vectorLiteral(vec), itemID,
		)
		if err != nil {
			h.logger.Warn("knowledge embedding update failed", zap.Error(err))
		}
	}()

	return c.JSON(http.StatusCreated, map[string]any{"id": id, "key": req.Key, "value": req.Value})
}

// DELETE /api/v1/knowledge/:id
func (h *KnowledgeHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM knowledge_base WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete knowledge item"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
