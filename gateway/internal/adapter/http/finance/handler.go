// Package finance hosts the HTTP adapter for the finance domain.
// Sixth handler sub-package to migrate out of internal/adapter/handler.
//
// Dependencies flow inward:
//
//	http/finance  →  usecase/finance  →  domain/repository/finance_repository
//	                                        ↑
//	                                        └── adapter/repository/postgres (impl)
package finance

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain/entity"
	financeusecase "github.com/newstarnion/gateway/internal/usecase/finance"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *financeusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *financeusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

// Register mounts the finance routes under the given JWT-protected group.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/finance/summary", h.summary)
	protected.GET("/finance/transactions", h.listTransactions)
	protected.POST("/finance/transactions", h.createTransaction)
	protected.PUT("/finance/transactions/:id", h.updateTransaction)
	protected.DELETE("/finance/transactions/:id", h.deleteTransaction)
	protected.GET("/finance/map", h.mapTransactions)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

func resolveYearMonth(c echo.Context) (year, month int) {
	now := time.Now()
	year = now.Year()
	month = int(now.Month())
	if y, e := strconv.Atoi(c.QueryParam("year")); e == nil && y > 0 {
		year = y
	}
	if m, e := strconv.Atoi(c.QueryParam("month")); e == nil && m >= 1 && m <= 12 {
		month = m
	}
	return year, month
}

func (h *Handler) summary(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	year, month := resolveYearMonth(c)
	summary, err := h.uc.GetSummary(c.Request().Context(), userID, year, month)
	if err != nil {
		h.logger.Warn("finance summary failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load summary"})
	}
	return c.JSON(http.StatusOK, summary)
}

func (h *Handler) listTransactions(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	filter := entity.TransactionFilter{
		Category: c.QueryParam("category"),
		Type:     c.QueryParam("type"),
	}
	filter.Page, _ = strconv.Atoi(c.QueryParam("page"))
	filter.Limit, _ = strconv.Atoi(c.QueryParam("limit"))
	if y, e := strconv.Atoi(c.QueryParam("year")); e == nil {
		filter.Year = y
	}
	if m, e := strconv.Atoi(c.QueryParam("month")); e == nil {
		filter.Month = m
	}

	rows, total, err := h.uc.ListTransactions(c.Request().Context(), userID, filter)
	if err != nil {
		h.logger.Warn("finance list failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch transactions"})
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	out := make([]map[string]any, 0, len(rows))
	for _, tx := range rows {
		out = append(out, transactionToMap(tx))
	}
	return c.JSON(http.StatusOK, map[string]any{
		"transactions": out,
		"total":        total,
		"page":         page,
		"limit":        limit,
	})
}

func (h *Handler) createTransaction(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Amount      int64            `json:"amount"`
		Category    string           `json:"category"`
		Description string           `json:"description"`
		CreatedAt   string           `json:"created_at"`
		Location    *json.RawMessage `json:"location"`
	}
	if err := c.Bind(&req); err != nil || req.Category == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "amount and category are required"})
	}

	var locationRaw json.RawMessage
	if req.Location != nil {
		locationRaw = *req.Location
	}

	tx, err := h.uc.CreateTransaction(c.Request().Context(), userID, financeusecase.CreateCommand{
		Amount:        req.Amount,
		Category:      req.Category,
		Description:   req.Description,
		CreatedAtText: req.CreatedAt,
		Location:      locationRaw,
	})
	if err != nil {
		h.logger.Warn("finance create failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create transaction"})
	}
	return c.JSON(http.StatusCreated, transactionToMap(tx))
}

func (h *Handler) updateTransaction(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	txID := c.Param("id")

	var req struct {
		Amount        int64            `json:"amount"`
		Category      string           `json:"category"`
		Description   string           `json:"description"`
		CreatedAt     string           `json:"created_at"`
		Location      *json.RawMessage `json:"location"`
		ClearLocation bool             `json:"clear_location"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	var locationRaw json.RawMessage
	if req.Location != nil {
		locationRaw = *req.Location
	}

	// Description is always rewritten (matches legacy semantics: allows
	// clearing it by sending an empty string).
	err = h.uc.UpdateTransaction(c.Request().Context(), userID, txID, financeusecase.UpdateCommand{
		Amount:         req.Amount,
		Category:       req.Category,
		Description:    req.Description,
		HasDescription: true,
		CreatedAtText:  req.CreatedAt,
		Location:       locationRaw,
		HasLocation:    req.Location != nil,
		ClearLocation:  req.ClearLocation,
	})
	if err != nil {
		h.logger.Warn("finance update failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update transaction"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) deleteTransaction(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	txID := c.Param("id")
	if err := h.uc.DeleteTransaction(c.Request().Context(), userID, txID); err != nil {
		h.logger.Warn("finance delete failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete transaction"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) mapTransactions(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	year, _ := strconv.Atoi(c.QueryParam("year"))
	month, _ := strconv.Atoi(c.QueryParam("month"))
	rows, err := h.uc.MapTransactions(c.Request().Context(), userID, year, month)
	if err != nil {
		h.logger.Warn("finance map failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch map data"})
	}
	out := make([]map[string]any, 0, len(rows))
	for _, tx := range rows {
		out = append(out, transactionToMap(tx))
	}
	return c.JSON(http.StatusOK, map[string]any{"transactions": out})
}

func transactionToMap(tx entity.Transaction) map[string]any {
	m := map[string]any{
		"id":          tx.ID,
		"amount":      tx.Amount,
		"category":    tx.Category,
		"description": tx.Description,
		"created_at":  tx.CreatedAt,
	}
	if len(tx.Location) > 0 {
		m["location"] = tx.Location
	}
	return m
}
