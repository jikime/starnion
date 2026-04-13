// Package planner hosts the HTTP adapter for the /planner/* domain.
// Fifteenth handler sub-package to migrate out of
// internal/adapter/handler. Matches the legacy JSON shapes exactly
// so the UI keeps working unchanged.
package planner

import (
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	plannerusecase "github.com/newstarnion/gateway/internal/usecase/planner"
	"go.uber.org/zap"
)

type Handler struct {
	uc     *plannerusecase.UseCase
	logger *zap.Logger
}

func NewHandler(uc *plannerusecase.UseCase, logger *zap.Logger) *Handler {
	return &Handler{uc: uc, logger: logger}
}

func (h *Handler) Register(protected *echo.Group) {
	protected.GET("/planner/snapshot", h.snapshot)

	// Roles
	protected.GET("/planner/roles", h.listRoles)
	protected.POST("/planner/roles", h.createRole)
	protected.PUT("/planner/roles/:id", h.updateRole)
	protected.DELETE("/planner/roles/:id", h.deleteRole)

	// Tasks
	protected.GET("/planner/tasks", h.listTasks)
	protected.POST("/planner/tasks", h.createTask)
	protected.PUT("/planner/tasks/:id", h.updateTask)
	protected.DELETE("/planner/tasks/:id", h.deleteTask)
	protected.POST("/planner/tasks/:id/forward", h.forwardTask)
	protected.PUT("/planner/tasks/reorder", h.reorderTasks)

	// Inbox
	protected.GET("/planner/inbox", h.listInbox)
	protected.POST("/planner/inbox", h.createInbox)
	protected.POST("/planner/inbox/:id/promote", h.promoteInbox)
	protected.DELETE("/planner/inbox/:id", h.deleteInbox)

	// Weekly goals
	protected.GET("/planner/weekly-goals", h.listWeeklyGoals)
	protected.POST("/planner/weekly-goals", h.createWeeklyGoal)
	protected.GET("/planner/weekly-goals/:id/tasks", h.weeklyGoalTasks)
	protected.PATCH("/planner/weekly-goals/:id/toggle", h.toggleWeeklyGoal)
	protected.DELETE("/planner/weekly-goals/:id", h.deleteWeeklyGoal)

	// Goals
	protected.GET("/planner/goals", h.listGoals)
	protected.POST("/planner/goals", h.createGoal)
	protected.PUT("/planner/goals/:id", h.updateGoal)
	protected.DELETE("/planner/goals/:id", h.deleteGoal)

	// Diary / reflections / mission
	protected.GET("/planner/diary", h.getDiary)
	protected.PUT("/planner/diary", h.upsertDiary)
	protected.GET("/planner/reflections", h.getReflection)
	protected.PUT("/planner/reflections", h.upsertReflection)
	protected.GET("/planner/mission", h.getMission)
	protected.PUT("/planner/mission", h.updateMission)
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

// ── Snapshot ─────────────────────────────────────────────────────

func (h *Handler) snapshot(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	snap, err := h.uc.Snapshot(c.Request().Context(), userID)
	if err != nil {
		h.logger.Warn("planner snapshot failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "snapshot failed"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"roles":       rolesToJSON(snap.Roles),
		"tasks":       tasksToJSON(snap.Tasks),
		"inbox":       inboxToJSON(snap.Inbox),
		"weeklyGoals": weeklyGoalsToJSON(snap.WeeklyGoals),
		"goals":       goalsToJSON(snap.Goals),
		"diary":       diaryToJSON(snap.Diary),
		"reflections": reflectionsToJSON(snap.Reflections),
		"mission":     snap.Mission,
	})
}

// ── Roles ─────────────────────────────────────────────────────────

func (h *Handler) listRoles(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListRoles(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list roles"})
	}
	return c.JSON(http.StatusOK, rolesToJSON(rows))
}

func (h *Handler) createRole(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Name    string `json:"name"`
		Color   string `json:"color"`
		BigRock string `json:"bigRock"`
		Mission string `json:"mission"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	id, err := h.uc.CreateRole(c.Request().Context(), userID, repository.RoleCreate{
		Name: req.Name, Color: req.Color, BigRock: req.BigRock, Mission: req.Mission,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create role"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) updateRole(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Name    *string `json:"name"`
		Color   *string `json:"color"`
		BigRock *string `json:"bigRock"`
		Mission *string `json:"mission"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if err := h.uc.UpdateRole(c.Request().Context(), userID, c.Param("id"), repository.RoleUpdate{
		Name: req.Name, Color: req.Color, BigRock: req.BigRock, Mission: req.Mission,
	}); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update role"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) deleteRole(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteRole(c.Request().Context(), userID, c.Param("id")); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete role"})
	}
	return c.NoContent(http.StatusNoContent)
}

// ── Tasks ─────────────────────────────────────────────────────────

func (h *Handler) listTasks(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListTasksByDate(c.Request().Context(), userID, c.QueryParam("date"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list tasks"})
	}
	return c.JSON(http.StatusOK, tasksToJSON(rows))
}

func (h *Handler) createTask(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title        string `json:"title"`
		Priority     string `json:"priority"`
		RoleID       *int64 `json:"roleId"`
		Date         string `json:"date"`
		TimeStart    string `json:"timeStart"`
		TimeEnd      string `json:"timeEnd"`
		Note         string `json:"note"`
		WeeklyGoalID *int64 `json:"weekly_goal_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	id, err := h.uc.CreateTask(c.Request().Context(), userID, repository.TaskCreate{
		Title: req.Title, Priority: req.Priority, RoleID: req.RoleID,
		Date: req.Date, TimeStart: req.TimeStart, TimeEnd: req.TimeEnd,
		Note: req.Note, WeeklyGoalID: req.WeeklyGoalID,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create task"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) updateTask(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var fields map[string]any
	if err := c.Bind(&fields); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if err := h.uc.UpdateTask(c.Request().Context(), userID, c.Param("id"), fields); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update task"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) deleteTask(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	if err := h.uc.DeleteTask(c.Request().Context(), userID, c.Param("id")); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete task"})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) forwardTask(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	id, err := h.uc.ForwardTask(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to forward"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) reorderTasks(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Items []struct {
			ID    int64 `json:"id"`
			Order int   `json:"order"`
		} `json:"items"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	items := make([]repository.TaskReorderItem, 0, len(req.Items))
	for _, it := range req.Items {
		items = append(items, repository.TaskReorderItem{ID: it.ID, Order: it.Order})
	}
	if err := h.uc.ReorderTasks(c.Request().Context(), userID, items); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "reorder failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "reordered"})
}

// ── Inbox ─────────────────────────────────────────────────────────

func (h *Handler) listInbox(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListInbox(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, inboxToJSON(rows))
}

func (h *Handler) createInbox(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title string `json:"title"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.CreateInbox(c.Request().Context(), userID, req.Title)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) promoteInbox(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Priority string `json:"priority"`
		RoleID   *int64 `json:"roleId"`
		Date     string `json:"date"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.PromoteInbox(c.Request().Context(), userID, c.Param("id"), repository.InboxPromote{
		Priority: req.Priority, RoleID: req.RoleID, Date: req.Date,
	}); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "promoted"})
}

func (h *Handler) deleteInbox(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	_ = h.uc.DeleteInbox(c.Request().Context(), userID, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// ── Weekly goals ──────────────────────────────────────────────────

func (h *Handler) listWeeklyGoals(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListWeeklyGoals(c.Request().Context(), userID, c.QueryParam("week"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, weeklyGoalsToJSON(rows))
}

func (h *Handler) createWeeklyGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		RoleID    int64  `json:"roleId"`
		Title     string `json:"title"`
		WeekStart string `json:"weekStart"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.CreateWeeklyGoal(c.Request().Context(), userID, repository.WeeklyGoalCreate{
		RoleID: req.RoleID, Title: req.Title, WeekStart: req.WeekStart,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) toggleWeeklyGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	_ = h.uc.ToggleWeeklyGoal(c.Request().Context(), userID, c.Param("id"))
	return c.JSON(http.StatusOK, map[string]string{"status": "toggled"})
}

func (h *Handler) deleteWeeklyGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	_ = h.uc.DeleteWeeklyGoal(c.Request().Context(), userID, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) weeklyGoalTasks(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListTasksByWeeklyGoal(c.Request().Context(), userID, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list tasks for weekly goal"})
	}
	return c.JSON(http.StatusOK, tasksToJSON(rows))
}

// ── Goals ─────────────────────────────────────────────────────────

func (h *Handler) listGoals(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	rows, err := h.uc.ListGoals(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, goalsToJSON(rows))
}

func (h *Handler) createGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title       string `json:"title"`
		RoleID      *int64 `json:"roleId"`
		DueDate     string `json:"dueDate"`
		Description string `json:"description"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := h.uc.CreateGoal(c.Request().Context(), userID, repository.GoalCreate{
		Title: req.Title, RoleID: req.RoleID, DueDate: req.DueDate, Description: req.Description,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) updateGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Title       *string `json:"title"`
		DueDate     *string `json:"dueDate"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	_ = h.uc.UpdateGoal(c.Request().Context(), userID, c.Param("id"), repository.GoalUpdate{
		Title: req.Title, DueDate: req.DueDate, Description: req.Description, Status: req.Status,
	})
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) deleteGoal(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	_ = h.uc.DeleteGoal(c.Request().Context(), userID, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// ── Diary / reflections / mission ────────────────────────────────

func (h *Handler) getDiary(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	d, err := h.uc.GetDiary(c.Request().Context(), userID, c.QueryParam("date"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"date": d.Date, "oneLiner": d.OneLiner, "mood": d.Mood, "fullNote": d.FullNote,
	})
}

func (h *Handler) upsertDiary(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Date     string `json:"date"`
		OneLiner string `json:"oneLiner"`
		Mood     string `json:"mood"`
		FullNote string `json:"fullNote"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.UpsertDiary(c.Request().Context(), userID, entity.PlannerDiary{
		Date: req.Date, OneLiner: req.OneLiner, Mood: req.Mood, FullNote: req.FullNote,
	}); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

func (h *Handler) getReflection(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	r, err := h.uc.GetReflection(c.Request().Context(), userID, c.QueryParam("date"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	var notes any = []any{}
	if len(r.Notes) > 0 {
		_ = json.Unmarshal(r.Notes, &notes)
	}
	return c.JSON(http.StatusOK, map[string]any{"date": r.Date, "notes": notes})
}

func (h *Handler) upsertReflection(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Date  string          `json:"date"`
		Notes json.RawMessage `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.UpsertReflection(c.Request().Context(), userID, req.Date, req.Notes); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

func (h *Handler) getMission(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	mission, err := h.uc.GetMission(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"mission": mission})
}

func (h *Handler) updateMission(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}
	var req struct {
		Mission string `json:"mission"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.uc.SetMission(c.Request().Context(), userID, req.Mission); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

// ── JSON mappers ─────────────────────────────────────────────────
// Each mapper preserves the legacy response shape exactly — the UI
// depends on camelCase keys and selective field omission for zero
// values (roleId, forwardedFromId, weeklyGoalId).

func rolesToJSON(rows []entity.PlannerRole) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"id": r.ID, "name": r.Name, "color": r.Color,
			"bigRock": r.BigRock, "mission": r.Mission, "sortOrder": r.SortOrder,
		})
	}
	return out
}

func tasksToJSON(rows []entity.PlannerTask) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, t := range rows {
		row := map[string]any{
			"id": t.ID, "title": t.Title, "status": t.Status, "priority": t.Priority,
			"order": t.SortOrder, "timeStart": t.TimeStart, "timeEnd": t.TimeEnd,
			"delegatee": t.Delegatee, "note": t.Note, "date": t.Date,
		}
		if t.RoleID != 0 {
			row["roleId"] = t.RoleID
		}
		if t.ForwardedFromID != 0 {
			row["forwardedFromId"] = t.ForwardedFromID
		}
		if t.WeeklyGoalID != 0 {
			row["weeklyGoalId"] = t.WeeklyGoalID
		}
		out = append(out, row)
	}
	return out
}

func inboxToJSON(rows []entity.PlannerInboxItem) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, i := range rows {
		out = append(out, map[string]any{
			"id": i.ID, "title": i.Title, "priority": i.Priority, "order": i.SortOrder,
		})
	}
	return out
}

func weeklyGoalsToJSON(rows []entity.PlannerWeeklyGoal) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, g := range rows {
		row := map[string]any{
			"id": g.ID, "roleId": g.RoleID, "title": g.Title,
			"done": g.Done, "weekStart": g.WeekStart,
		}
		if g.TaskCount > 0 || g.DoneCount > 0 {
			row["taskCount"] = g.TaskCount
			row["doneCount"] = g.DoneCount
		}
		out = append(out, row)
	}
	return out
}

func goalsToJSON(rows []entity.PlannerGoal) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, g := range rows {
		row := map[string]any{
			"id": g.ID, "title": g.Title, "dueDate": g.DueDate,
			"description": g.Description, "status": g.Status,
		}
		if g.RoleID != 0 {
			row["roleId"] = g.RoleID
		}
		out = append(out, row)
	}
	return out
}

func diaryToJSON(rows []entity.PlannerDiary) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, d := range rows {
		out = append(out, map[string]any{
			"date": d.Date, "oneLiner": d.OneLiner, "mood": d.Mood, "fullNote": d.FullNote,
		})
	}
	return out
}

func reflectionsToJSON(rows []entity.PlannerReflection) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var notes any
		_ = json.Unmarshal(r.Notes, &notes)
		out = append(out, map[string]any{"date": r.Date, "notes": notes})
	}
	return out
}
