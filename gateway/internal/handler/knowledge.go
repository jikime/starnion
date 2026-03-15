package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// KnowledgeHandler exposes read-only AI memory endpoints for the knowledge_base table.
type KnowledgeHandler struct {
	db *sql.DB
}

// NewKnowledgeHandler creates a new KnowledgeHandler.
func NewKnowledgeHandler(db *sql.DB) *KnowledgeHandler {
	return &KnowledgeHandler{db: db}
}

type knowledgeItem struct {
	ID        int64  `json:"id"`
	Key       string `json:"key"`
	Value     string `json:"value"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
}

// ListKnowledge handles GET /api/v1/knowledge
// Query params: prefix (key prefix filter, e.g. "conversation:analysis:", "pattern:", "memory:weekly_summary:")
func (h *KnowledgeHandler) ListKnowledge(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	prefix := c.QueryParam("prefix")

	var (
		rows *sql.Rows
		err  error
	)

	if prefix != "" {
		rows, err = h.db.QueryContext(c.Request().Context(), `
			SELECT id, key, value, COALESCE(source, ''), created_at
			FROM knowledge_base
			WHERE user_id = $1 AND key LIKE $2
			ORDER BY key DESC
		`, userID, prefix+"%")
	} else {
		rows, err = h.db.QueryContext(c.Request().Context(), `
			SELECT id, key, value, COALESCE(source, ''), created_at
			FROM knowledge_base
			WHERE user_id = $1
			ORDER BY created_at DESC
		`, userID)
	}

	if err != nil {
		log.Error().Err(err).Msg("knowledge: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []knowledgeItem{}
	for rows.Next() {
		var k knowledgeItem
		var createdAt time.Time
		if err := rows.Scan(&k.ID, &k.Key, &k.Value, &k.Source, &createdAt); err != nil {
			continue
		}
		k.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, k)
	}
	return c.JSON(http.StatusOK, items)
}

// DeleteKnowledge handles DELETE /api/v1/knowledge/:id
// Only memory:weekly_summary:* entries should be deletable from the UI.
func (h *KnowledgeHandler) DeleteKnowledge(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	result, err := h.db.ExecContext(c.Request().Context(), `
		DELETE FROM knowledge_base WHERE id = $1 AND user_id = $2
	`, id, userID)
	if err != nil {
		log.Error().Err(err).Msg("knowledge: delete failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
