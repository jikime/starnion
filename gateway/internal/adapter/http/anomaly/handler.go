// Package anomaly hosts the HTTP adapter for the anomaly detection
// domain. Eighth handler sub-package to migrate out of
// internal/adapter/handler.
package anomaly

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	anomalyusecase "github.com/newstarnion/gateway/internal/usecase/anomaly"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *anomalyusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *anomalyusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/anomalies", h.getAnomalies)
}

func (h *Handler) getAnomalies(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	reports := h.uc.Detect(c.Request().Context(), userID)
	return c.JSON(http.StatusOK, map[string]any{
		"anomalies":   reports,
		"count":       len(reports),
		"computed_at": time.Now().UTC(),
	})
}
