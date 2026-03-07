package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// SearchHandler handles saved search CRUD.
type SearchHandler struct {
	db           *sql.DB
	agentHTTPURL string // e.g. "http://agent:8082"
}

func NewSearchHandler(db *sql.DB, agentHTTPURL string) *SearchHandler {
	return &SearchHandler{db: db, agentHTTPURL: agentHTTPURL}
}

type searchItem struct {
	ID        int64  `json:"id"`
	Query     string `json:"query"`
	Result    string `json:"result"`
	CreatedAt string `json:"created_at"`
}

// ListSearches GET /api/v1/searches?user_id=&limit=&offset=
func (h *SearchHandler) ListSearches(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	limit := 50
	offset := 0
	if v, err := strconv.Atoi(c.QueryParam("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	if v, err := strconv.Atoi(c.QueryParam("offset")); err == nil && v >= 0 {
		offset = v
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	rows, err := h.db.QueryContext(ctx, `
		SELECT id, query, result, created_at
		FROM searches
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("list searches failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	items := []searchItem{}
	for rows.Next() {
		var item searchItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.Query, &item.Result, &createdAt); err != nil {
			continue
		}
		item.CreatedAt = createdAt.In(kstLoc()).Format("2006-01-02 15:04")
		items = append(items, item)
	}
	return c.JSON(http.StatusOK, items)
}

// SaveSearch POST /api/v1/searches
func (h *SearchHandler) SaveSearch(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		Query  string `json:"query"`
		Result string `json:"result"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and query are required"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	var id int64
	err := h.db.QueryRowContext(ctx, `
		INSERT INTO searches (user_id, query, result)
		VALUES ($1, $2, $3)
		RETURNING id
	`, req.UserID, req.Query, req.Result).Scan(&id)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("save search failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "save failed"})
	}

	// Fire-and-forget: ask the Python agent to embed this search result.
	if h.agentHTTPURL != "" {
		go h.embedSearch(req.UserID, id)
	}

	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

// embedSearch calls POST /embed-search on the agent's HTTP server (port 8082).
func (h *SearchHandler) embedSearch(userID string, searchID int64) {
	body, _ := json.Marshal(map[string]any{
		"user_id":   userID,
		"search_id": searchID,
	})
	resp, err := http.Post(h.agentHTTPURL+"/embed-search", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Warn().Err(err).Int64("search_id", searchID).Msg("embed-search request failed")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		log.Warn().Int("status", resp.StatusCode).Int64("search_id", searchID).Msg("embed-search unexpected status")
	}
}

// HybridSearch GET /api/v1/search/hybrid?q=&user_id=&limit=
// Proxies to the Python agent's GET /search endpoint on port 8082.
func (h *SearchHandler) HybridSearch(c echo.Context) error {
	userID := c.QueryParam("user_id")
	q := c.QueryParam("q")
	if userID == "" || q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and q are required"})
	}

	limit := 10
	if v, err := strconv.Atoi(c.QueryParam("limit")); err == nil && v > 0 && v <= 50 {
		limit = v
	}

	if h.agentHTTPURL == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "agent not configured"})
	}

	agentURL := fmt.Sprintf("%s/search?user_id=%s&q=%s&limit=%d",
		h.agentHTTPURL,
		url.QueryEscape(userID),
		url.QueryEscape(q),
		limit,
	)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(agentURL)
	if err != nil {
		log.Error().Err(err).Str("q", q).Msg("hybrid search agent request failed")
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "agent unavailable"})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "read failed"})
	}

	return c.JSONBlob(resp.StatusCode, body)
}

// DeleteSearch DELETE /api/v1/searches/:id?user_id=
func (h *SearchHandler) DeleteSearch(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	res, err := h.db.ExecContext(ctx,
		`DELETE FROM searches WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
