// Package budget hosts the HTTP adapter for the budget domain. It is
// the first handler sub-package to live outside the monolithic
// `internal/adapter/handler` directory — the goal is that each migrated
// bounded context gets its own subpackage so the 14k-LOC handler blob
// can be broken up incrementally.
//
// Dependencies flow inward:
//
//	http/budget  →  usecase/budget  →  domain/repository/budget_repository
//	                                     ↑
//	                                     └── adapter/repository/postgres (impl)
//
// This package imports httpauth for JWT context extraction but nothing
// from the handler package; the route registration (see `Register`) is
// called from the router aggregate in `internal/adapter/handler`.
package budget

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	budgetusecase "github.com/newstarnion/gateway/internal/usecase/budget"
	"go.uber.org/zap"
)

// Handler is the HTTP adapter over the budget usecase.
type Handler struct {
	uc     *budgetusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *budgetusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

// Register mounts the budget routes under the given Echo group. The
// caller passes the JWT-protected group built in the main router.
func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/budget", h.getBudget)
	protected.PUT("/budget", h.updateBudget)
}

// getBudget — GET /api/v1/budget?year=2026&month=3
func (h *Handler) getBudget(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	now := time.Now()
	year := now.Year()
	month := int(now.Month())
	if y, e := strconv.Atoi(c.QueryParam("year")); e == nil && y > 0 {
		year = y
	}
	if m, e := strconv.Atoi(c.QueryParam("month")); e == nil && m >= 1 && m <= 12 {
		month = m
	}

	summary, err := h.uc.GetSummary(c.Request().Context(), userID, year, month)
	if err != nil {
		h.logger.Warn("budget summary failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load budget"})
	}
	return c.JSON(http.StatusOK, summary)
}

// updateBudget — PUT /api/v1/budget
func (h *Handler) updateBudget(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Budgets          map[string]int64 `json:"budgets"`
		WarningThreshold int              `json:"warning_threshold"`
		DangerThreshold  int              `json:"danger_threshold"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	if err := h.uc.UpdateLimits(c.Request().Context(), userID, budgetusecase.UpdateCommand{
		Limits:           req.Budgets,
		WarningThreshold: req.WarningThreshold,
		DangerThreshold:  req.DangerThreshold,
	}); err != nil {
		h.logger.Warn("budget update failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update budget"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}
