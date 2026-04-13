// Package cron hosts the HTTP adapter for the /cron/* domain.
// Fourteenth handler sub-package to migrate out of
// internal/adapter/handler.
package cron

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	cronusecase "github.com/newstarnion/gateway/internal/usecase/cron"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *cronusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *cronusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/cron/schedules", h.listUserSchedules)
	protected.POST("/cron/schedules", h.createUserSchedule)
	protected.PUT("/cron/schedules/:id", h.updateUserSchedule)
	protected.DELETE("/cron/schedules/:id", h.deleteUserSchedule)
	protected.POST("/cron/schedules/:id/toggle", h.toggleUserSchedule)
	protected.GET("/cron/system", h.listSystemJobs)
	protected.POST("/cron/system/:id/toggle", h.toggleSystemJob)
	protected.POST("/cron/system/:id/trigger", h.triggerSystemJob)
}

// InternalCreateSchedule is the agent-facing entry point registered
// under /api/internal/cron-schedule by the router. It does NOT go
// through the JWT middleware (the router mounts it with the shared
// secret middleware instead).
func (h *Handler) InternalCreateSchedule(c echo.Context) error {
	var req struct {
		UserID     string           `json:"user_id"`
		Title      string           `json:"title"`
		TaskPrompt string           `json:"task_prompt"`
		Schedule   entity.SchedTime `json:"schedule"`
		DeliverTo  string           `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	result, err := h.uc.InternalCreateSchedule(c.Request().Context(), cronusecase.InternalCreateCommand{
		UserID:     req.UserID,
		Title:      req.Title,
		TaskPrompt: req.TaskPrompt,
		Schedule:   req.Schedule,
		DeliverTo:  req.DeliverTo,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("cron internal create failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}
	return c.JSON(http.StatusCreated, map[string]any{
		"id":         result.ID,
		"kb_row_id":  result.KBRowID,
		"title":      result.Title,
		"created_at": result.CreatedAt,
	})
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── User schedules ────────────────────────────────────────────────

func (h *Handler) listUserSchedules(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListSchedules(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("cron list schedules failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list schedules"})
	}
	return c.JSON(http.StatusOK, rows)
}

func (h *Handler) createUserSchedule(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title      string           `json:"title"`
		Type       string           `json:"type"`
		ReportType string           `json:"report_type"`
		Schedule   entity.SchedTime `json:"schedule"`
		Message    string           `json:"message"`
		TaskPrompt string           `json:"task_prompt"`
		DeliverTo  string           `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	s, err := h.uc.CreateSchedule(c.Request().Context(), userID, cronusecase.CreateCommand{
		Title:      req.Title,
		Type:       req.Type,
		ReportType: req.ReportType,
		Schedule:   req.Schedule,
		Message:    req.Message,
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("cron create schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}
	return c.JSON(http.StatusOK, s)
}

func (h *Handler) updateUserSchedule(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title      string           `json:"title"`
		Type       string           `json:"type"`
		ReportType string           `json:"report_type"`
		Schedule   entity.SchedTime `json:"schedule"`
		Message    string           `json:"message"`
		Status     string           `json:"status"`
		TaskPrompt string           `json:"task_prompt"`
		DeliverTo  string           `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	schedID := c.Param("id")
	status, err := h.uc.UpdateSchedule(c.Request().Context(), userID, schedID, cronusecase.UpdateCommand{
		Title:      req.Title,
		Type:       req.Type,
		ReportType: req.ReportType,
		Schedule:   req.Schedule,
		Message:    req.Message,
		Status:     req.Status,
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		h.logger.Error("cron update schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": schedID, "status": status})
}

func (h *Handler) deleteUserSchedule(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	schedID := c.Param("id")
	if err := h.uc.DeleteSchedule(c.Request().Context(), userID, schedID); err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		h.logger.Error("cron delete schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"id": schedID})
}

func (h *Handler) toggleUserSchedule(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	schedID := c.Param("id")
	status, err := h.uc.ToggleSchedule(c.Request().Context(), userID, schedID)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		h.logger.Error("cron toggle schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "toggle failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"id": schedID, "status": status})
}

// ── System jobs ───────────────────────────────────────────────────

func (h *Handler) listSystemJobs(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	lang := c.QueryParam("lang")
	jobs, err := h.uc.ListSystemJobs(c.Request().Context(), userID, lang)
	if err != nil {
		h.logger.Warn("cron list system jobs failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list system jobs"})
	}
	return c.JSON(http.StatusOK, jobs)
}

func (h *Handler) toggleSystemJob(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	jobID := c.Param("id")
	enabled, err := h.uc.ToggleSystemJob(c.Request().Context(), userID, jobID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "job not found"})
		}
		if errors.Is(err, domain.ErrInvalidArgument) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
		h.logger.Error("cron toggle system job failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	return c.JSON(http.StatusOK, map[string]any{"id": jobID, "enabled": enabled})
}

func (h *Handler) triggerSystemJob(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	jobID := c.Param("id")
	result, err := h.uc.TriggerSystemJob(c.Request().Context(), userID, jobID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "job not found"})
		}
		if errors.Is(err, domain.ErrUnavailable) {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "scheduler not available"})
		}
		h.logger.Warn("cron trigger system job failed", zap.String("job", jobID), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id":        jobID,
		"sent":      result.Sent,
		"message":   result.Message,
		"scheduled": result.Scheduled,
	})
}
