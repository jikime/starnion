package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type PlannerHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewPlannerHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *PlannerHandler {
	return &PlannerHandler{db: db, config: cfg, logger: logger}
}

// ── Snapshot (initial load) ──────────────────────────────────────────────────

func (h *PlannerHandler) Snapshot(c echo.Context) error {
	ctx := c.Request().Context()
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	uid := userID.String()

	today := time.Now().Format("2006-01-02")

	// Roles
	roles := []map[string]any{}
	rows, err := h.db.QueryContext(ctx, `SELECT id, name, color, big_rock, COALESCE(mission,'') as mission, sort_order FROM planner_roles WHERE user_id = $1 ORDER BY sort_order`, uid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var name, color, bigRock, mission string
			var sortOrder int
			if err := rows.Scan(&id, &name, &color, &bigRock, &mission, &sortOrder); err != nil {
				continue
			}
			roles = append(roles, map[string]any{"id": id, "name": name, "color": color, "bigRock": bigRock, "mission": mission, "sortOrder": sortOrder})
		}
	}

	// Tasks (today ± 7 days)
	tasks := []map[string]any{}
	tRows, err := h.db.QueryContext(ctx, `SELECT id, title, status, priority, sort_order, COALESCE(role_id,0), COALESCE(time_start,''), COALESCE(time_end,''), COALESCE(delegatee,''), COALESCE(note,''), task_date::text, COALESCE(forwarded_from_id,0) FROM planner_tasks WHERE user_id = $1 AND is_inbox = FALSE AND task_date BETWEEN ($2::date - 7) AND ($2::date + 7) ORDER BY task_date, priority, sort_order`, uid, today)
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var id, roleID, fwdID int64
			var title, status, priority, timeStart, timeEnd, delegatee, note, date string
			var sortOrder int
			if err := tRows.Scan(&id, &title, &status, &priority, &sortOrder, &roleID, &timeStart, &timeEnd, &delegatee, &note, &date, &fwdID); err != nil {
				continue
			}
			t := map[string]any{"id": id, "title": title, "status": status, "priority": priority, "order": sortOrder, "timeStart": timeStart, "timeEnd": timeEnd, "delegatee": delegatee, "note": note, "date": date}
			if roleID != 0 {
				t["roleId"] = roleID
			}
			if fwdID != 0 {
				t["forwardedFromId"] = fwdID
			}
			tasks = append(tasks, t)
		}
	}

	// Inbox
	inbox := []map[string]any{}
	iRows, err := h.db.QueryContext(ctx, `SELECT id, title, priority, sort_order FROM planner_tasks WHERE user_id = $1 AND is_inbox = TRUE ORDER BY sort_order`, uid)
	if err == nil {
		defer iRows.Close()
		for iRows.Next() {
			var id int64
			var title, priority string
			var sortOrder int
			if err := iRows.Scan(&id, &title, &priority, &sortOrder); err != nil {
				continue
			}
			inbox = append(inbox, map[string]any{"id": id, "title": title, "priority": priority, "order": sortOrder})
		}
	}

	// Weekly Goals (current week)
	monday := mondayOf(time.Now()).Format("2006-01-02")
	wgoals := []map[string]any{}
	wRows, err := h.db.QueryContext(ctx, `SELECT id, role_id, title, done, week_start::text FROM planner_weekly_goals WHERE user_id = $1 AND week_start = $2 ORDER BY id`, uid, monday)
	if err == nil {
		defer wRows.Close()
		for wRows.Next() {
			var id, roleID int64
			var title, weekStart string
			var done bool
			if err := wRows.Scan(&id, &roleID, &title, &done, &weekStart); err != nil {
				continue
			}
			wgoals = append(wgoals, map[string]any{"id": id, "roleId": roleID, "title": title, "done": done, "weekStart": weekStart})
		}
	}

	// Goals (active)
	goals := []map[string]any{}
	gRows, err := h.db.QueryContext(ctx, `SELECT id, title, COALESCE(role_id,0), due_date::text, COALESCE(description,''), status FROM planner_goals WHERE user_id = $1 AND status = 'active' ORDER BY due_date`, uid)
	if err == nil {
		defer gRows.Close()
		for gRows.Next() {
			var id, roleID int64
			var title, dueDate, description, status string
			if err := gRows.Scan(&id, &title, &roleID, &dueDate, &description, &status); err != nil {
				continue
			}
			g := map[string]any{"id": id, "title": title, "dueDate": dueDate, "description": description, "status": status}
			if roleID != 0 {
				g["roleId"] = roleID
			}
			goals = append(goals, g)
		}
	}

	// Diary (last 7 days)
	diary := []map[string]any{}
	dRows, err := h.db.QueryContext(ctx, `SELECT entry_date::text, one_liner, mood, COALESCE(full_note,'') FROM planner_diary WHERE user_id = $1 AND entry_date >= ($2::date - 7) ORDER BY entry_date DESC`, uid, today)
	if err == nil {
		defer dRows.Close()
		for dRows.Next() {
			var date, oneLiner, mood, fullNote string
			if err := dRows.Scan(&date, &oneLiner, &mood, &fullNote); err != nil {
				continue
			}
			diary = append(diary, map[string]any{"date": date, "oneLiner": oneLiner, "mood": mood, "fullNote": fullNote})
		}
	}

	// Reflections (last 7 days)
	reflections := []map[string]any{}
	rRows, err := h.db.QueryContext(ctx, `SELECT note_date::text, notes FROM planner_reflection_notes WHERE user_id = $1 AND note_date >= ($2::date - 7) ORDER BY note_date DESC`, uid, today)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var date string
			var notesJSON []byte
			if err := rRows.Scan(&date, &notesJSON); err != nil {
				continue
			}
			var notes any
			json.Unmarshal(notesJSON, &notes)
			reflections = append(reflections, map[string]any{"date": date, "notes": notes})
		}
	}

	// Mission
	mission := ""
	var prefsJSON []byte
	if err := h.db.QueryRowContext(ctx, `SELECT COALESCE(preferences,'{}') FROM users WHERE id = $1`, uid).Scan(&prefsJSON); err == nil {
		var prefs map[string]json.RawMessage
		if json.Unmarshal(prefsJSON, &prefs) == nil {
			if raw, ok := prefs["planner_mission"]; ok {
				json.Unmarshal(raw, &mission)
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"roles":       roles,
		"tasks":       tasks,
		"inbox":       inbox,
		"weeklyGoals": wgoals,
		"goals":       goals,
		"diary":       diary,
		"reflections": reflections,
		"mission":     mission,
	})
}

// ── Roles CRUD ───────────────────────────────────────────────────────────────

func (h *PlannerHandler) ListRoles(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	roles := []map[string]any{}
	rows, err := h.db.QueryContext(ctx, `SELECT id, name, color, big_rock, COALESCE(mission,''), sort_order FROM planner_roles WHERE user_id = $1 ORDER BY sort_order`, uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list roles"})
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name, color, bigRock, mission string
		var sortOrder int
		rows.Scan(&id, &name, &color, &bigRock, &mission, &sortOrder)
		roles = append(roles, map[string]any{"id": id, "name": name, "color": color, "bigRock": bigRock, "mission": mission, "sortOrder": sortOrder})
	}
	return c.JSON(http.StatusOK, roles)
}

func (h *PlannerHandler) CreateRole(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct {
		Name     string `json:"name"`
		Color    string `json:"color"`
		BigRock  string `json:"bigRock"`
		Mission  string `json:"mission"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	var id int64
	err = h.db.QueryRowContext(ctx, `INSERT INTO planner_roles (user_id, name, color, big_rock, mission, sort_order) VALUES ($1,$2,$3,$4,$5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_roles WHERE user_id=$1)) RETURNING id`, uid.String(), req.Name, req.Color, req.BigRock, req.Mission).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create role"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *PlannerHandler) UpdateRole(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	id := c.Param("id")
	var req struct {
		Name    *string `json:"name"`
		Color   *string `json:"color"`
		BigRock *string `json:"bigRock"`
		Mission *string `json:"mission"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	_, err = h.db.ExecContext(ctx, `UPDATE planner_roles SET name=COALESCE($1,name), color=COALESCE($2,color), big_rock=COALESCE($3,big_rock), mission=COALESCE($4,mission), updated_at=NOW() WHERE id=$5 AND user_id=$6`, req.Name, req.Color, req.BigRock, req.Mission, id, uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update role"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *PlannerHandler) DeleteRole(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	_, err = h.db.ExecContext(ctx, `DELETE FROM planner_roles WHERE id=$1 AND user_id=$2`, c.Param("id"), uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete role"})
	}
	return c.NoContent(http.StatusNoContent)
}

// ── Tasks CRUD ───────────────────────────────────────────────────────────────

func (h *PlannerHandler) ListTasks(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	date := c.QueryParam("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	tasks := []map[string]any{}
	rows, err := h.db.QueryContext(ctx, `SELECT id, title, status, priority, sort_order, COALESCE(role_id,0), COALESCE(time_start,''), COALESCE(time_end,''), COALESCE(delegatee,''), COALESCE(note,''), task_date::text, COALESCE(forwarded_from_id,0) FROM planner_tasks WHERE user_id=$1 AND is_inbox=FALSE AND task_date=$2 ORDER BY priority, sort_order`, uid.String(), date)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list tasks"})
	}
	defer rows.Close()
	for rows.Next() {
		var id, roleID, fwdID int64
		var title, status, priority, ts, te, del, note, d string
		var so int
		rows.Scan(&id, &title, &status, &priority, &so, &roleID, &ts, &te, &del, &note, &d, &fwdID)
		t := map[string]any{"id": id, "title": title, "status": status, "priority": priority, "order": so, "timeStart": ts, "timeEnd": te, "delegatee": del, "note": note, "date": d}
		if roleID != 0 { t["roleId"] = roleID }
		if fwdID != 0 { t["forwardedFromId"] = fwdID }
		tasks = append(tasks, t)
	}
	return c.JSON(http.StatusOK, tasks)
}

func (h *PlannerHandler) CreateTask(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct {
		Title     string `json:"title"`
		Priority  string `json:"priority"`
		RoleID    *int64 `json:"roleId"`
		Date      string `json:"date"`
		TimeStart string `json:"timeStart"`
		TimeEnd   string `json:"timeEnd"`
		Note      string `json:"note"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if req.Date == "" { req.Date = time.Now().Format("2006-01-02") }
	if req.Priority == "" { req.Priority = "C" }
	var id int64
	err = h.db.QueryRowContext(ctx, `INSERT INTO planner_tasks (user_id, title, priority, role_id, task_date, time_start, time_end, note, sort_order) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''), (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks WHERE user_id=$1 AND task_date=$5 AND priority=$3 AND is_inbox=FALSE)) RETURNING id`, uid.String(), req.Title, req.Priority, req.RoleID, req.Date, req.TimeStart, req.TimeEnd, req.Note).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create task"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *PlannerHandler) UpdateTask(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req map[string]any
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	id := c.Param("id")
	// Build dynamic update
	sets := ""
	args := []any{}
	idx := 1
	for _, field := range []struct{ json, col string }{
		{"title", "title"}, {"status", "status"}, {"priority", "priority"},
		{"order", "sort_order"}, {"timeStart", "time_start"}, {"timeEnd", "time_end"},
		{"delegatee", "delegatee"}, {"note", "note"}, {"date", "task_date"},
	} {
		if v, ok := req[field.json]; ok {
			if sets != "" { sets += ", " }
			sets += field.col + " = $" + strconv.Itoa(idx)
			args = append(args, v)
			idx++
		}
	}
	if v, ok := req["roleId"]; ok {
		if sets != "" { sets += ", " }
		sets += "role_id = $" + strconv.Itoa(idx)
		args = append(args, v)
		idx++
	}
	if sets == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no fields to update"})
	}
	sets += ", updated_at = NOW()"
	args = append(args, id, uid.String())
	query := "UPDATE planner_tasks SET " + sets + " WHERE id = $" + strconv.Itoa(idx) + " AND user_id = $" + strconv.Itoa(idx+1)
	_, err = h.db.ExecContext(ctx, query, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update task"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *PlannerHandler) DeleteTask(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	_, err = h.db.ExecContext(ctx, `DELETE FROM planner_tasks WHERE id=$1 AND user_id=$2`, c.Param("id"), uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete task"})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *PlannerHandler) ForwardTask(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	oldID := c.Param("id")
	// Mark old as forwarded
	_, err = h.db.ExecContext(ctx, `UPDATE planner_tasks SET status='forwarded', updated_at=NOW() WHERE id=$1 AND user_id=$2`, oldID, uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to forward"})
	}
	// Create copy for tomorrow
	var newID int64
	err = h.db.QueryRowContext(ctx, `INSERT INTO planner_tasks (user_id, title, priority, role_id, time_start, time_end, note, sort_order, task_date, forwarded_from_id) SELECT user_id, title, priority, role_id, time_start, time_end, note, sort_order, task_date + 1, id FROM planner_tasks WHERE id=$1 AND user_id=$2 RETURNING id`, oldID, uid.String()).Scan(&newID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create forwarded task"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": newID})
}

func (h *PlannerHandler) ReorderTasks(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
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
	for _, item := range req.Items {
		h.db.ExecContext(ctx, `UPDATE planner_tasks SET sort_order=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`, item.Order, item.ID, uid.String())
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "reordered"})
}

// ── Inbox ────────────────────────────────────────────────────────────────────

func (h *PlannerHandler) ListInbox(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	items := []map[string]any{}
	rows, err := h.db.QueryContext(ctx, `SELECT id, title, priority, sort_order FROM planner_tasks WHERE user_id=$1 AND is_inbox=TRUE ORDER BY sort_order`, uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	defer rows.Close()
	for rows.Next() {
		var id int64; var title, priority string; var so int
		rows.Scan(&id, &title, &priority, &so)
		items = append(items, map[string]any{"id": id, "title": title, "priority": priority, "order": so})
	}
	return c.JSON(http.StatusOK, items)
}

func (h *PlannerHandler) CreateInbox(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Title string `json:"title"` }
	c.Bind(&req)
	var id int64
	h.db.QueryRowContext(ctx, `INSERT INTO planner_tasks (user_id, title, is_inbox, task_date, sort_order) VALUES ($1,$2,TRUE,CURRENT_DATE, (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks WHERE user_id=$1 AND is_inbox=TRUE)) RETURNING id`, uid.String(), req.Title).Scan(&id)
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *PlannerHandler) PromoteInbox(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Priority string `json:"priority"`; RoleID *int64 `json:"roleId"`; Date string `json:"date"` }
	c.Bind(&req)
	if req.Priority == "" { req.Priority = "C" }
	if req.Date == "" { req.Date = time.Now().Format("2006-01-02") }
	_, err = h.db.ExecContext(ctx, `UPDATE planner_tasks SET is_inbox=FALSE, priority=$1, role_id=$2, task_date=$3, updated_at=NOW() WHERE id=$4 AND user_id=$5 AND is_inbox=TRUE`, req.Priority, req.RoleID, req.Date, c.Param("id"), uid.String())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "promoted"})
}

func (h *PlannerHandler) DeleteInbox(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	h.db.ExecContext(ctx, `DELETE FROM planner_tasks WHERE id=$1 AND user_id=$2 AND is_inbox=TRUE`, c.Param("id"), uid.String())
	return c.NoContent(http.StatusNoContent)
}

// ── Weekly Goals ─────────────────────────────────────────────────────────────

func (h *PlannerHandler) ListWeeklyGoals(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	week := c.QueryParam("week")
	if week == "" { week = mondayOf(time.Now()).Format("2006-01-02") }
	goals := []map[string]any{}
	rows, err := h.db.QueryContext(ctx, `SELECT id, role_id, title, done, week_start::text FROM planner_weekly_goals WHERE user_id=$1 AND week_start=$2 ORDER BY id`, uid.String(), week)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed"})
	}
	defer rows.Close()
	for rows.Next() {
		var id, roleID int64; var title, ws string; var done bool
		rows.Scan(&id, &roleID, &title, &done, &ws)
		goals = append(goals, map[string]any{"id": id, "roleId": roleID, "title": title, "done": done, "weekStart": ws})
	}
	return c.JSON(http.StatusOK, goals)
}

func (h *PlannerHandler) CreateWeeklyGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { RoleID int64 `json:"roleId"`; Title string `json:"title"`; WeekStart string `json:"weekStart"` }
	c.Bind(&req)
	if req.WeekStart == "" { req.WeekStart = mondayOf(time.Now()).Format("2006-01-02") }
	var id int64
	h.db.QueryRowContext(ctx, `INSERT INTO planner_weekly_goals (user_id, role_id, title, week_start) VALUES ($1,$2,$3,$4) RETURNING id`, uid.String(), req.RoleID, req.Title, req.WeekStart).Scan(&id)
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *PlannerHandler) ToggleWeeklyGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	h.db.ExecContext(ctx, `UPDATE planner_weekly_goals SET done = NOT done, updated_at=NOW() WHERE id=$1 AND user_id=$2`, c.Param("id"), uid.String())
	return c.JSON(http.StatusOK, map[string]string{"status": "toggled"})
}

func (h *PlannerHandler) DeleteWeeklyGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	h.db.ExecContext(ctx, `DELETE FROM planner_weekly_goals WHERE id=$1 AND user_id=$2`, c.Param("id"), uid.String())
	return c.NoContent(http.StatusNoContent)
}

// ── Goals ────────────────────────────────────────────────────────────────────

func (h *PlannerHandler) ListGoals(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	goals := []map[string]any{}
	rows, _ := h.db.QueryContext(ctx, `SELECT id, title, COALESCE(role_id,0), due_date::text, COALESCE(description,''), status FROM planner_goals WHERE user_id=$1 ORDER BY due_date`, uid.String())
	defer rows.Close()
	for rows.Next() {
		var id, roleID int64; var title, due, desc, status string
		rows.Scan(&id, &title, &roleID, &due, &desc, &status)
		g := map[string]any{"id": id, "title": title, "dueDate": due, "description": desc, "status": status}
		if roleID != 0 { g["roleId"] = roleID }
		goals = append(goals, g)
	}
	return c.JSON(http.StatusOK, goals)
}

func (h *PlannerHandler) CreateGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Title string `json:"title"`; RoleID *int64 `json:"roleId"`; DueDate string `json:"dueDate"`; Description string `json:"description"` }
	c.Bind(&req)
	var id int64
	h.db.QueryRowContext(ctx, `INSERT INTO planner_goals (user_id, title, role_id, due_date, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`, uid.String(), req.Title, req.RoleID, req.DueDate, req.Description).Scan(&id)
	return c.JSON(http.StatusCreated, map[string]any{"id": id})
}

func (h *PlannerHandler) UpdateGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Title *string `json:"title"`; DueDate *string `json:"dueDate"`; Description *string `json:"description"`; Status *string `json:"status"` }
	c.Bind(&req)
	h.db.ExecContext(ctx, `UPDATE planner_goals SET title=COALESCE($1,title), due_date=COALESCE($2::date,due_date), description=COALESCE($3,description), status=COALESCE($4,status), updated_at=NOW() WHERE id=$5 AND user_id=$6`, req.Title, req.DueDate, req.Description, req.Status, c.Param("id"), uid.String())
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *PlannerHandler) DeleteGoal(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	h.db.ExecContext(ctx, `DELETE FROM planner_goals WHERE id=$1 AND user_id=$2`, c.Param("id"), uid.String())
	return c.NoContent(http.StatusNoContent)
}

// ── Diary ────────────────────────────────────────────────────────────────────

func (h *PlannerHandler) GetDiary(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	date := c.QueryParam("date")
	if date == "" { date = time.Now().Format("2006-01-02") }
	var oneLiner, mood, fullNote string
	err = h.db.QueryRowContext(ctx, `SELECT one_liner, mood, COALESCE(full_note,'') FROM planner_diary WHERE user_id=$1 AND entry_date=$2`, uid.String(), date).Scan(&oneLiner, &mood, &fullNote)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"date": date, "oneLiner": "", "mood": "neutral", "fullNote": ""})
	}
	return c.JSON(http.StatusOK, map[string]any{"date": date, "oneLiner": oneLiner, "mood": mood, "fullNote": fullNote})
}

func (h *PlannerHandler) UpsertDiary(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Date string `json:"date"`; OneLiner string `json:"oneLiner"`; Mood string `json:"mood"`; FullNote string `json:"fullNote"` }
	c.Bind(&req)
	if req.Date == "" { req.Date = time.Now().Format("2006-01-02") }
	if req.Mood == "" { req.Mood = "neutral" }
	h.db.ExecContext(ctx, `INSERT INTO planner_diary (user_id, entry_date, one_liner, mood, full_note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, entry_date) DO UPDATE SET one_liner=$3, mood=$4, full_note=$5, updated_at=NOW()`, uid.String(), req.Date, req.OneLiner, req.Mood, req.FullNote)
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

// ── Reflections ──────────────────────────────────────────────────────────────

func (h *PlannerHandler) GetReflection(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	date := c.QueryParam("date")
	if date == "" { date = time.Now().Format("2006-01-02") }
	var notesJSON []byte
	err = h.db.QueryRowContext(ctx, `SELECT notes FROM planner_reflection_notes WHERE user_id=$1 AND note_date=$2`, uid.String(), date).Scan(&notesJSON)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]any{"date": date, "notes": []any{}})
	}
	var notes any
	json.Unmarshal(notesJSON, &notes)
	return c.JSON(http.StatusOK, map[string]any{"date": date, "notes": notes})
}

func (h *PlannerHandler) UpsertReflection(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Date string `json:"date"`; Notes json.RawMessage `json:"notes"` }
	c.Bind(&req)
	if req.Date == "" { req.Date = time.Now().Format("2006-01-02") }
	h.db.ExecContext(ctx, `INSERT INTO planner_reflection_notes (user_id, note_date, notes) VALUES ($1,$2,$3) ON CONFLICT (user_id, note_date) DO UPDATE SET notes=$3, updated_at=NOW()`, uid.String(), req.Date, req.Notes)
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

// ── Mission ──────────────────────────────────────────────────────────────────

func (h *PlannerHandler) GetMission(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	mission := ""
	var prefsJSON []byte
	if err := h.db.QueryRowContext(ctx, `SELECT COALESCE(preferences,'{}') FROM users WHERE id=$1`, uid.String()).Scan(&prefsJSON); err == nil {
		var prefs map[string]json.RawMessage
		if json.Unmarshal(prefsJSON, &prefs) == nil {
			if raw, ok := prefs["planner_mission"]; ok {
				json.Unmarshal(raw, &mission)
			}
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"mission": mission})
}

func (h *PlannerHandler) UpdateMission(c echo.Context) error {
	ctx := c.Request().Context()
	uid, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	var req struct { Mission string `json:"mission"` }
	c.Bind(&req)
	mJSON, _ := json.Marshal(req.Mission)
	h.db.ExecContext(ctx, `UPDATE users SET preferences = jsonb_set(COALESCE(preferences,'{}'), '{planner_mission}', $1::jsonb) WHERE id = $2`, string(mJSON), uid.String())
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

// ── Helper ───────────────────────────────────────────────────────────────────

func mondayOf(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 { weekday = 7 }
	return t.AddDate(0, 0, -(weekday - 1))
}
