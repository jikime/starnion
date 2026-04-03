package handler

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// snippetRune returns at most maxRunes runes from s, appending "..." if truncated.
// Safe for multibyte (Korean/CJK) text.
func snippetRune(s string, maxRunes int) string {
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "..."
}

type SearchHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewSearchHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *SearchHandler {
	return &SearchHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/searches?q=...&page=1&limit=20
func (h *SearchHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	q := c.QueryParam("q")
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

	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close() error
	}

	if q != "" {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, query, result, created_at FROM searches
			 WHERE user_id = $1 AND (query ILIKE $2 OR result ILIKE $2)
			 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
			userID, "%"+q+"%", limit, offset,
		)
	} else {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, query, result, created_at FROM searches
			 WHERE user_id = $1
			 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			userID, limit, offset,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch searches"})
	}
	defer rows.Close()

	var searches []map[string]any
	for rows.Next() {
		var id int64
		var query, result string
		var createdAt time.Time
		if rows.Scan(&id, &query, &result, &createdAt) != nil {
			continue
		}
		searches = append(searches, map[string]any{
			"id":         id,
			"query":      query,
			"result":     result,
			"created_at": createdAt,
		})
	}
	if searches == nil {
		searches = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM searches WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{
		"searches": searches,
		"total":    total,
		"page":     page,
		"limit":    limit,
	})
}

// POST /api/v1/searches
func (h *SearchHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Query  string `json:"query"`
		Result string `json:"result"`
	}
	if err := c.Bind(&req); err != nil || req.Query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "query is required"})
	}
	if len(req.Query) > 1000 {
		req.Query = req.Query[:1000]
	}
	if len(req.Result) > 50000 {
		req.Result = req.Result[:50000]
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO searches (user_id, query, result) VALUES ($1, $2, $3) RETURNING id`,
		userID, req.Query, req.Result,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save search"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id, "query": req.Query})
}

// GET /api/v1/searches/:id
func (h *SearchHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id int64
	var query, result string
	var createdAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, query, result, created_at FROM searches WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &query, &result, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "search not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": id, "query": query, "result": result, "created_at": createdAt,
	})
}

// DELETE /api/v1/searches/:id
func (h *SearchHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM searches WHERE id = $1 AND user_id = $2`, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete search"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /api/v1/search/hybrid?q=...&limit=20
// Hybrid search across diary entries, memos, and knowledge base.
// Uses PostgreSQL FTS (tsvector + ts_rank) AND, when the user has a Gemini API
// key stored, also runs pgvector cosine-similarity search to surface semantically
// related results. Deduplicates by (type, id) and sorts by descending score.
func (h *SearchHandler) HybridSearch(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	q := c.QueryParam("q")
	if q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q is required"})
	}
	if len(q) > 500 {
		q = q[:500]
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 50 {
		limit = 10
	}
	ctx := c.Request().Context()

	// Track results by (type+id) key for deduplication; keep highest score.
	seen := map[string]float64{}
	var results []map[string]any

	addResult := func(r map[string]any) {
		key := r["type"].(string) + ":" + r["id"].(string)
		score := r["score"].(float64)
		if prev, ok := seen[key]; ok {
			if score <= prev {
				return
			}
			// Update score for existing entry.
			for _, existing := range results {
				if existing["type"].(string)+":"+existing["id"].(string) == key {
					existing["score"] = score
					seen[key] = score
					return
				}
			}
		}
		seen[key] = score
		results = append(results, r)
	}

	ilike := "%" + q + "%"

	// ── FTS: Diary entries ─────────────────────────────────────────────────
	dRows, _ := h.db.QueryContext(ctx,
		`SELECT id::text, 'diary' AS type, title, content, entry_date::text AS date,
		        ts_rank(content_tsv, plainto_tsquery('simple', $2)) AS rank
		 FROM diary_entries
		 WHERE user_id = $1
		   AND (content_tsv @@ plainto_tsquery('simple', $2) OR content ILIKE $3)
		 ORDER BY rank DESC, entry_date DESC
		 LIMIT $4`,
		userID, q, ilike, limit,
	)
	if dRows != nil {
		defer dRows.Close()
		for dRows.Next() {
			var id, typ, title, content, date string
			var rank float64
			if dRows.Scan(&id, &typ, &title, &content, &date, &rank) == nil {
				snippet := snippetRune(content, 200)
				addResult(map[string]any{
					"id": id, "type": typ, "title": title,
					"text": snippet, "date": date, "score": rank,
				})
			}
		}
	}

	// ── FTS: Memos (ILIKE — no tsvector on memos table) ───────────────────
	mRows, _ := h.db.QueryContext(ctx,
		`SELECT id::text, 'memo' AS type, title, content, created_at::text AS date
		 FROM memos
		 WHERE user_id = $1 AND (title ILIKE $2 OR content ILIKE $2)
		 ORDER BY updated_at DESC
		 LIMIT $3`,
		userID, ilike, limit,
	)
	if mRows != nil {
		defer mRows.Close()
		for mRows.Next() {
			var id, typ, title, content, date string
			if mRows.Scan(&id, &typ, &title, &content, &date) == nil {
				snippet := snippetRune(content, 200)
				addResult(map[string]any{
					"id": id, "type": typ, "title": title,
					"text": snippet, "date": date, "score": 0.5,
				})
			}
		}
	}

	// ── FTS: Knowledge base ────────────────────────────────────────────────
	kRows, _ := h.db.QueryContext(ctx,
		`SELECT id::text, 'knowledge' AS type, key, value, created_at::text AS date,
		        ts_rank(content_tsv, plainto_tsquery('simple', $2)) AS rank
		 FROM knowledge_base
		 WHERE user_id = $1
		   AND (content_tsv @@ plainto_tsquery('simple', $2) OR key ILIKE $3 OR value ILIKE $3)
		 ORDER BY rank DESC
		 LIMIT $4`,
		userID, q, ilike, limit,
	)
	if kRows != nil {
		defer kRows.Close()
		for kRows.Next() {
			var id, typ, key, value, date string
			var rank float64
			if kRows.Scan(&id, &typ, &key, &value, &date, &rank) == nil {
				snippet := snippetRune(value, 200)
				addResult(map[string]any{
					"id": id, "type": typ, "title": key,
					"text": snippet, "date": date, "score": rank,
				})
			}
		}
	}

	// ── Vector search (requires embedding config) ───────────────────────────
	if vec, embErr := generateEmbeddingAuto(ctx, h.db, userID.String(), h.config.EncryptionKey, q); embErr == nil {
		vecLit := vectorLiteral(vec)

			// Vector search: diary entries (cosine similarity, lower distance = better match)
			dvRows, _ := h.db.QueryContext(ctx,
				`SELECT id::text, 'diary' AS type, title, content, entry_date::text AS date,
				        1 - (embedding <=> $2::vector) AS score
				 FROM diary_entries
				 WHERE user_id = $1 AND embedding IS NOT NULL
				 ORDER BY embedding <=> $2::vector
				 LIMIT $3`,
				userID, vecLit, limit,
			)
			if dvRows != nil {
				defer dvRows.Close()
				for dvRows.Next() {
					var id, typ, title, content, date string
					var score float64
					if dvRows.Scan(&id, &typ, &title, &content, &date, &score) == nil && score > 0.5 {
						snippet := content
						if len(snippet) > 200 {
							snippet = snippet[:200] + "..."
						}
						addResult(map[string]any{
							"id": id, "type": typ, "title": title,
							"text": snippet, "date": date, "score": score,
						})
					}
				}
			}

			// Vector search: knowledge base
			kvRows, _ := h.db.QueryContext(ctx,
				`SELECT id::text, 'knowledge' AS type, key, value, created_at::text AS date,
				        1 - (embedding <=> $2::vector) AS score
				 FROM knowledge_base
				 WHERE user_id = $1 AND embedding IS NOT NULL
				 ORDER BY embedding <=> $2::vector
				 LIMIT $3`,
				userID, vecLit, limit,
			)
			if kvRows != nil {
				defer kvRows.Close()
				for kvRows.Next() {
					var id, typ, key, value, date string
					var score float64
					if kvRows.Scan(&id, &typ, &key, &value, &date, &score) == nil && score > 0.5 {
						snippet := value
						if len(snippet) > 200 {
							snippet = snippet[:200] + "..."
						}
						addResult(map[string]any{
							"id": id, "type": typ, "title": key,
							"text": snippet, "date": date, "score": score,
						})
					}
				}
			}
	} else {
		h.logger.Warn("hybrid search embedding failed", zap.Error(embErr))
	}

	// Sort by descending score.
	sort.Slice(results, func(i, j int) bool {
		si, _ := results[i]["score"].(float64)
		sj, _ := results[j]["score"].(float64)
		return si > sj
	})

	if results == nil {
		results = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{
		"results": results,
		"query":   q,
		"total":   len(results),
	})
}
