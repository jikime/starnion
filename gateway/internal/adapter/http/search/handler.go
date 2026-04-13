// Package search hosts the HTTP adapter for the search domain.
// Seventh handler sub-package to migrate out of internal/adapter/handler.
//
// Dependencies flow inward:
//
//	http/search  →  usecase/search  →  domain/repository/search_repository
//	                                        ↑
//	                                        └── adapter/repository/postgres (impl)
//
// The embedding client is supplied via a small adapter below so the
// usecase doesn't have to know about Gemini/OpenAI provider config.
package search

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"github.com/newstarnion/gateway/internal/infrastructure/embedding"
	searchusecase "github.com/newstarnion/gateway/internal/usecase/search"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *searchusecase.UseCase
	logger *zap.Logger
}

// NewHandler builds the handler over a pre-constructed usecase.
func NewHandler(uc *searchusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

// Register mounts the search routes under the given JWT-protected group.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/searches", h.listSaved)
	protected.POST("/searches", h.createSaved)
	protected.GET("/searches/:id", h.getSaved)
	protected.DELETE("/searches/:id", h.deleteSaved)
	protected.GET("/search/hybrid", h.hybrid)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

func (h *Handler) listSaved(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))

	page_, err := h.uc.ListSaved(c.Request().Context(), userID, c.QueryParam("q"), page, limit)
	if err != nil {
		h.logger.Warn("search list failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch searches"})
	}

	out := make([]map[string]any, 0, len(page_.Searches))
	for _, s := range page_.Searches {
		out = append(out, savedToMap(s))
	}
	return c.JSON(http.StatusOK, map[string]any{
		"searches": out,
		"total":    page_.Total,
		"page":     page_.Page,
		"limit":    page_.Limit,
	})
}

func (h *Handler) createSaved(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Query  string `json:"query"`
		Result string `json:"result"`
	}
	if err := c.Bind(&req); err != nil || req.Query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "query is required"})
	}
	id, err := h.uc.CreateSaved(c.Request().Context(), userID, req.Query, req.Result)
	if err != nil {
		h.logger.Warn("search create failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save search"})
	}
	// Return the trimmed query so the client sees the exact value persisted.
	return c.JSON(http.StatusCreated, map[string]any{"id": id, "query": trimForResponse(req.Query)})
}

func (h *Handler) getSaved(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	s, err := h.uc.GetSaved(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "search not found"})
		}
		h.logger.Warn("search get failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch search"})
	}
	return c.JSON(http.StatusOK, savedToMap(s))
}

func (h *Handler) deleteSaved(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteSaved(c.Request().Context(), userID, c.Param("id")); err != nil {
		h.logger.Warn("search delete failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete search"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) hybrid(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	q := c.QueryParam("q")
	if q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q is required"})
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))

	hits, err := h.uc.Hybrid(c.Request().Context(), userID, q, limit)
	if err != nil {
		h.logger.Warn("hybrid search failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "search failed"})
	}
	out := make([]map[string]any, 0, len(hits))
	for _, hit := range hits {
		out = append(out, map[string]any{
			"id":    hit.ID,
			"type":  hit.Type,
			"title": hit.Title,
			"text":  hit.Text,
			"date":  hit.Date,
			"score": hit.Score,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"results": out,
		"query":   q,
		"total":   len(out),
	})
}

func savedToMap(s entity.SavedSearch) map[string]any {
	return map[string]any{
		"id":         s.ID,
		"query":      s.Query,
		"result":     s.Result,
		"created_at": s.CreatedAt.Format(time.RFC3339Nano),
	}
}

func trimForResponse(s string) string {
	const maxQueryLen = 1000
	if len(s) > maxQueryLen {
		return s[:maxQueryLen]
	}
	return s
}

// EmbedderAdapter is the Embedder the search usecase requires,
// implemented against the infrastructure/embedding client. It resolves
// the per-user config on every call so a user who rotates their
// provider key sees the change immediately.
type EmbedderAdapter struct {
	db            *database.DB
	encryptionKey string
}

// NewEmbedderAdapter returns an adapter ready for the search usecase.
func NewEmbedderAdapter(db *database.DB, encryptionKey string) *EmbedderAdapter {
	return &EmbedderAdapter{db: db, encryptionKey: encryptionKey}
}

func (e *EmbedderAdapter) Generate(ctx context.Context, userID uuid.UUID, text string) ([]float32, error) {
	return embedding.GenerateAuto(ctx, e.db, userID.String(), e.encryptionKey, text)
}

func (e *EmbedderAdapter) VectorLiteral(vec []float32) string {
	return embedding.VectorLiteral(vec)
}
