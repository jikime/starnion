// Package channels hosts the HTTP adapter for the telegram channel
// settings + pairing workflow. Ninth handler sub-package to migrate
// out of internal/adapter/handler.
package channels

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	channelsusecase "github.com/newstarnion/gateway/internal/usecase/channels"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *channelsusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *channelsusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/channels/telegram", h.getTelegram)
	protected.PUT("/channels/telegram", h.updateTelegram)
	protected.POST("/channels/telegram", h.updateTelegram)
	protected.GET("/channels/telegram/pairing", h.listPairings)
	protected.POST("/channels/telegram/pairing", h.createPairing)
	protected.POST("/channels/telegram/pairing/:id/approve", h.approvePairing)
	protected.POST("/channels/telegram/pairing/:id/deny", h.denyPairing)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

func (h *Handler) getTelegram(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	view, err := h.uc.GetTelegram(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("channels get failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load settings"})
	}
	resp := map[string]any{
		"channel":      "telegram",
		"enabled":      view.Enabled,
		"dm_policy":    view.DMPolicy,
		"group_policy": view.GroupPolicy,
	}
	if view.BotToken != "" {
		resp["bot_token"] = view.BotToken
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *Handler) updateTelegram(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Enabled     *bool  `json:"enabled"`
		BotToken    string `json:"bot_token"`
		DMPolicy    string `json:"dm_policy"`
		GroupPolicy string `json:"group_policy"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	result, err := h.uc.UpdateTelegram(c.Request().Context(), userID, channelsusecase.UpdateCommand{
		Enabled:     req.Enabled,
		BotToken:    req.BotToken,
		DMPolicy:    req.DMPolicy,
		GroupPolicy: req.GroupPolicy,
	})
	if err != nil {
		h.logger.Warn("channels update failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update channel settings"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"status":       result.Status,
		"webhook_mode": result.WebhookMode,
	})
}

func (h *Handler) listPairings(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	view, err := h.uc.ListPairings(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("channels list pairings failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load pairings"})
	}
	pairings := make([]map[string]any, 0, len(view.Pairings))
	for _, p := range view.Pairings {
		pairings = append(pairings, map[string]any{
			"id":           p.ID,
			"telegram_id":  p.TelegramID,
			"display_name": p.DisplayName,
			"status":       p.Status,
			"requested_at": p.RequestedAt,
		})
	}
	approved := make([]map[string]any, 0, len(view.Approved))
	for _, a := range view.Approved {
		approved = append(approved, map[string]any{
			"id":           a.ID,
			"telegram_id":  a.TelegramID,
			"display_name": a.DisplayName,
			"approved_at":  a.ApprovedAt,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"pairings": pairings,
		"approved": approved,
	})
}

func (h *Handler) createPairing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		TelegramID  string `json:"telegram_id"`
		DisplayName string `json:"display_name"`
		MessageText string `json:"message_text"`
	}
	if err := c.Bind(&req); err != nil || req.TelegramID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_id is required"})
	}
	id, err := h.uc.CreatePairing(c.Request().Context(), userID, channelsusecase.CreatePairingCommand{
		TelegramID:  req.TelegramID,
		DisplayName: req.DisplayName,
		MessageText: req.MessageText,
	})
	if err != nil {
		h.logger.Warn("channels create pairing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create pairing request"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id, "status": "pending"})
}

func (h *Handler) approvePairing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	result, ok, err := h.uc.ApprovePairing(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		h.logger.Warn("channels approve pairing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to approve pairing"})
	}
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "pairing request not found or already resolved"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"status":       "approved",
		"telegram_id":  result.TelegramID,
		"display_name": result.DisplayName,
	})
}

func (h *Handler) denyPairing(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DenyPairing(c.Request().Context(), userID, c.Param("id")); err != nil {
		h.logger.Warn("channels deny pairing failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to deny pairing"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "denied"})
}
