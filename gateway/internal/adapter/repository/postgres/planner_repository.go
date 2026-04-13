package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type PlannerRepository struct {
	db *database.DB
}

func NewPlannerRepository(db *database.DB) *PlannerRepository {
	return &PlannerRepository{db: db}
}

// ── Snapshot helpers ──────────────────────────────────────────────

func (r *PlannerRepository) SnapshotRoles(ctx context.Context, userID string) ([]entity.PlannerRole, error) {
	return r.queryRoles(ctx,
		`SELECT id, name, color, big_rock, COALESCE(mission,'') AS mission, sort_order
		 FROM planner_roles WHERE user_id = $1 ORDER BY sort_order`, userID)
}

func (r *PlannerRepository) SnapshotTasksAround(ctx context.Context, userID, centerDate string) ([]entity.PlannerTask, error) {
	return r.queryTasks(ctx,
		`SELECT id, title, status, priority, sort_order, COALESCE(role_id,0),
		        COALESCE(time_start,''), COALESCE(time_end,''),
		        COALESCE(delegatee,''), COALESCE(note,''), task_date::text,
		        COALESCE(forwarded_from_id,0), COALESCE(weekly_goal_id,0)
		 FROM planner_tasks
		 WHERE user_id = $1 AND is_inbox = FALSE
		   AND task_date BETWEEN ($2::date - 7) AND ($2::date + 7)
		 ORDER BY task_date, priority, sort_order`,
		userID, centerDate)
}

func (r *PlannerRepository) SnapshotInbox(ctx context.Context, userID string) ([]entity.PlannerInboxItem, error) {
	return r.queryInbox(ctx,
		`SELECT id, title, priority, sort_order FROM planner_tasks
		 WHERE user_id = $1 AND is_inbox = TRUE ORDER BY sort_order`, userID)
}

func (r *PlannerRepository) SnapshotWeeklyGoals(ctx context.Context, userID, weekStart string) ([]entity.PlannerWeeklyGoal, error) {
	return r.queryWeeklyGoals(ctx,
		`SELECT id, role_id, title, done, week_start::text FROM planner_weekly_goals
		 WHERE user_id = $1 AND week_start = $2 ORDER BY id`, userID, weekStart)
}

func (r *PlannerRepository) SnapshotActiveGoals(ctx context.Context, userID string) ([]entity.PlannerGoal, error) {
	return r.queryGoals(ctx,
		`SELECT id, title, COALESCE(role_id,0), due_date::text, COALESCE(description,''), status
		 FROM planner_goals WHERE user_id = $1 AND status = 'active' ORDER BY due_date`, userID)
}

func (r *PlannerRepository) SnapshotDiary(ctx context.Context, userID, centerDate string) ([]entity.PlannerDiary, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT entry_date::text, one_liner, mood, COALESCE(full_note,'')
		 FROM planner_diary
		 WHERE user_id = $1 AND entry_date >= ($2::date - 7)
		 ORDER BY entry_date DESC`, userID, centerDate)
	if err != nil {
		return nil, fmt.Errorf("postgres planner diary: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerDiary
	for rows.Next() {
		var d entity.PlannerDiary
		if err := rows.Scan(&d.Date, &d.OneLiner, &d.Mood, &d.FullNote); err != nil {
			return nil, fmt.Errorf("postgres planner diary scan: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) SnapshotReflections(ctx context.Context, userID, centerDate string) ([]entity.PlannerReflection, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT note_date::text, notes FROM planner_reflection_notes
		 WHERE user_id = $1 AND note_date >= ($2::date - 7)
		 ORDER BY note_date DESC`, userID, centerDate)
	if err != nil {
		return nil, fmt.Errorf("postgres planner reflections: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerReflection
	for rows.Next() {
		var rf entity.PlannerReflection
		if err := rows.Scan(&rf.Date, &rf.Notes); err != nil {
			return nil, fmt.Errorf("postgres planner reflections scan: %w", err)
		}
		out = append(out, rf)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) GetMission(ctx context.Context, userID string) (string, error) {
	var raw []byte
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences,'{}') FROM users WHERE id = $1`, userID,
	).Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("postgres planner mission: %w", err)
	}
	var prefs map[string]json.RawMessage
	if json.Unmarshal(raw, &prefs) != nil {
		return "", nil
	}
	rawM, ok := prefs["planner_mission"]
	if !ok {
		return "", nil
	}
	var mission string
	_ = json.Unmarshal(rawM, &mission)
	return mission, nil
}

func (r *PlannerRepository) WeeklyGoalCounts(ctx context.Context, userID string) (map[int64][2]int, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT weekly_goal_id, COUNT(*) AS total,
		        COUNT(*) FILTER (WHERE status = 'done') AS done_count
		 FROM planner_tasks
		 WHERE user_id = $1 AND weekly_goal_id IS NOT NULL
		 GROUP BY weekly_goal_id`, userID)
	if err != nil {
		return nil, fmt.Errorf("postgres planner wgoal counts: %w", err)
	}
	defer rows.Close()
	out := map[int64][2]int{}
	for rows.Next() {
		var id int64
		var total, done int
		if err := rows.Scan(&id, &total, &done); err != nil {
			return nil, fmt.Errorf("postgres planner wgoal counts scan: %w", err)
		}
		out[id] = [2]int{total, done}
	}
	return out, rows.Err()
}

// ── Roles ─────────────────────────────────────────────────────────

func (r *PlannerRepository) ListRoles(ctx context.Context, userID string) ([]entity.PlannerRole, error) {
	return r.SnapshotRoles(ctx, userID)
}

func (r *PlannerRepository) CreateRole(ctx context.Context, userID string, req repository.RoleCreate) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_roles (user_id, name, color, big_rock, mission, sort_order)
		 VALUES ($1,$2,$3,$4,$5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_roles WHERE user_id=$1))
		 RETURNING id`,
		userID, req.Name, req.Color, req.BigRock, req.Mission,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres planner role create: %w", err)
	}
	return id, nil
}

func (r *PlannerRepository) UpdateRole(ctx context.Context, userID, id string, req repository.RoleUpdate) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE planner_roles SET name=COALESCE($1,name), color=COALESCE($2,color),
		        big_rock=COALESCE($3,big_rock), mission=COALESCE($4,mission),
		        updated_at=NOW()
		 WHERE id=$5 AND user_id=$6`,
		req.Name, req.Color, req.BigRock, req.Mission, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner role update: %w", err)
	}
	return nil
}

func (r *PlannerRepository) DeleteRole(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM planner_roles WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner role delete: %w", err)
	}
	return nil
}

// ── Tasks ─────────────────────────────────────────────────────────

func (r *PlannerRepository) ListTasksByDate(ctx context.Context, userID, date string) ([]entity.PlannerTask, error) {
	return r.queryTasks(ctx,
		`SELECT id, title, status, priority, sort_order, COALESCE(role_id,0),
		        COALESCE(time_start,''), COALESCE(time_end,''),
		        COALESCE(delegatee,''), COALESCE(note,''), task_date::text,
		        COALESCE(forwarded_from_id,0), COALESCE(weekly_goal_id,0)
		 FROM planner_tasks
		 WHERE user_id=$1 AND is_inbox=FALSE AND task_date=$2
		 ORDER BY priority, sort_order`, userID, date)
}

func (r *PlannerRepository) CreateTask(ctx context.Context, userID string, t repository.TaskCreate) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_tasks (user_id, title, priority, role_id, task_date,
		                            time_start, time_end, note, weekly_goal_id, sort_order)
		 VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),$9,
		         (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks
		          WHERE user_id=$1 AND task_date=$5 AND priority=$3 AND is_inbox=FALSE))
		 RETURNING id`,
		userID, t.Title, t.Priority, t.RoleID, t.Date,
		t.TimeStart, t.TimeEnd, t.Note, t.WeeklyGoalID,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres planner task create: %w", err)
	}
	return id, nil
}

// taskUpdateColumns maps legacy JSON field names to SQL columns for
// the UpdateTask dynamic-SET builder.
var taskUpdateColumns = map[string]string{
	"title":        "title",
	"status":       "status",
	"priority":     "priority",
	"order":        "sort_order",
	"timeStart":    "time_start",
	"timeEnd":      "time_end",
	"delegatee":    "delegatee",
	"note":         "note",
	"date":         "task_date",
	"roleId":       "role_id",
	"weeklyGoalId": "weekly_goal_id",
}

func (r *PlannerRepository) UpdateTask(ctx context.Context, userID, id string, fields map[string]any) error {
	sets := ""
	args := []any{}
	idx := 1
	for jsonKey, col := range taskUpdateColumns {
		v, ok := fields[jsonKey]
		if !ok {
			continue
		}
		if sets != "" {
			sets += ", "
		}
		sets += col + " = $" + strconv.Itoa(idx)
		args = append(args, v)
		idx++
	}
	if sets == "" {
		return fmt.Errorf("postgres planner task update: no fields")
	}
	sets += ", updated_at = NOW()"
	args = append(args, id, userID)
	query := "UPDATE planner_tasks SET " + sets +
		" WHERE id = $" + strconv.Itoa(idx) +
		" AND user_id = $" + strconv.Itoa(idx+1)
	_, err := r.db.Pool().Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("postgres planner task update: %w", err)
	}
	return nil
}

func (r *PlannerRepository) DeleteTask(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM planner_tasks WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner task delete: %w", err)
	}
	return nil
}

func (r *PlannerRepository) ForwardTask(ctx context.Context, userID, oldID string) (int64, error) {
	if _, err := r.db.Pool().Exec(ctx,
		`UPDATE planner_tasks SET status='forwarded', updated_at=NOW() WHERE id=$1 AND user_id=$2`,
		oldID, userID,
	); err != nil {
		return 0, fmt.Errorf("postgres planner task forward mark: %w", err)
	}
	var newID int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_tasks (user_id, title, priority, role_id, time_start, time_end,
		                            note, sort_order, task_date, forwarded_from_id)
		 SELECT user_id, title, priority, role_id, time_start, time_end,
		        note, sort_order, task_date + 1, id
		 FROM planner_tasks WHERE id=$1 AND user_id=$2
		 RETURNING id`, oldID, userID,
	).Scan(&newID)
	if err != nil {
		return 0, fmt.Errorf("postgres planner task forward insert: %w", err)
	}
	return newID, nil
}

func (r *PlannerRepository) ReorderTasks(ctx context.Context, userID string, items []repository.TaskReorderItem) error {
	tx, err := r.db.Pool().BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("postgres planner reorder begin: %w", err)
	}
	for _, item := range items {
		if _, err := tx.Exec(ctx,
			`UPDATE planner_tasks SET sort_order=$1, updated_at=NOW()
			 WHERE id=$2 AND user_id=$3`,
			item.Order, item.ID, userID,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("postgres planner reorder exec: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres planner reorder commit: %w", err)
	}
	return nil
}

func (r *PlannerRepository) ListTasksByWeeklyGoal(ctx context.Context, userID, goalID string) ([]entity.PlannerTask, error) {
	return r.queryTasks(ctx,
		`SELECT id, title, status, priority, sort_order, COALESCE(role_id,0),
		        COALESCE(time_start,''), COALESCE(time_end,''),
		        COALESCE(delegatee,''), COALESCE(note,''), task_date::text,
		        COALESCE(forwarded_from_id,0), COALESCE(weekly_goal_id,0)
		 FROM planner_tasks
		 WHERE user_id=$1 AND weekly_goal_id=$2
		 ORDER BY task_date, priority, sort_order`, userID, goalID)
}

// ── Inbox ─────────────────────────────────────────────────────────

func (r *PlannerRepository) ListInbox(ctx context.Context, userID string) ([]entity.PlannerInboxItem, error) {
	return r.SnapshotInbox(ctx, userID)
}

func (r *PlannerRepository) CreateInbox(ctx context.Context, userID, title string) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_tasks (user_id, title, is_inbox, task_date, sort_order)
		 VALUES ($1,$2,TRUE,CURRENT_DATE,
		         (SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks
		          WHERE user_id=$1 AND is_inbox=TRUE))
		 RETURNING id`, userID, title,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres planner inbox create: %w", err)
	}
	return id, nil
}

func (r *PlannerRepository) PromoteInbox(ctx context.Context, userID, id string, p repository.InboxPromote) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE planner_tasks SET is_inbox=FALSE, priority=$1, role_id=$2, task_date=$3,
		        updated_at=NOW()
		 WHERE id=$4 AND user_id=$5 AND is_inbox=TRUE`,
		p.Priority, p.RoleID, p.Date, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner inbox promote: %w", err)
	}
	return nil
}

func (r *PlannerRepository) DeleteInbox(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM planner_tasks WHERE id=$1 AND user_id=$2 AND is_inbox=TRUE`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner inbox delete: %w", err)
	}
	return nil
}

// ── Weekly goals ──────────────────────────────────────────────────

func (r *PlannerRepository) ListWeeklyGoals(ctx context.Context, userID, weekStart string) ([]entity.PlannerWeeklyGoal, error) {
	return r.SnapshotWeeklyGoals(ctx, userID, weekStart)
}

func (r *PlannerRepository) CreateWeeklyGoal(ctx context.Context, userID string, g repository.WeeklyGoalCreate) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_weekly_goals (user_id, role_id, title, week_start)
		 VALUES ($1,$2,$3,$4) RETURNING id`,
		userID, g.RoleID, g.Title, g.WeekStart,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres planner weekly goal create: %w", err)
	}
	return id, nil
}

func (r *PlannerRepository) ToggleWeeklyGoal(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE planner_weekly_goals SET done = NOT done, updated_at=NOW()
		 WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner weekly goal toggle: %w", err)
	}
	return nil
}

func (r *PlannerRepository) DeleteWeeklyGoal(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM planner_weekly_goals WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner weekly goal delete: %w", err)
	}
	return nil
}

// ── Goals ─────────────────────────────────────────────────────────

func (r *PlannerRepository) ListGoals(ctx context.Context, userID string) ([]entity.PlannerGoal, error) {
	return r.queryGoals(ctx,
		`SELECT id, title, COALESCE(role_id,0), due_date::text, COALESCE(description,''), status
		 FROM planner_goals WHERE user_id=$1 ORDER BY due_date`, userID)
}

func (r *PlannerRepository) CreateGoal(ctx context.Context, userID string, g repository.GoalCreate) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO planner_goals (user_id, title, role_id, due_date, description)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		userID, g.Title, g.RoleID, g.DueDate, g.Description,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres planner goal create: %w", err)
	}
	return id, nil
}

func (r *PlannerRepository) UpdateGoal(ctx context.Context, userID, id string, g repository.GoalUpdate) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE planner_goals
		 SET title=COALESCE($1,title), due_date=COALESCE($2::date,due_date),
		     description=COALESCE($3,description), status=COALESCE($4,status),
		     updated_at=NOW()
		 WHERE id=$5 AND user_id=$6`,
		g.Title, g.DueDate, g.Description, g.Status, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner goal update: %w", err)
	}
	return nil
}

func (r *PlannerRepository) DeleteGoal(ctx context.Context, userID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM planner_goals WHERE id=$1 AND user_id=$2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner goal delete: %w", err)
	}
	return nil
}

// ── Diary / reflections / mission ────────────────────────────────

func (r *PlannerRepository) GetDiary(ctx context.Context, userID, date string) (entity.PlannerDiary, bool, error) {
	var d entity.PlannerDiary
	d.Date = date
	err := r.db.Pool().QueryRow(ctx,
		`SELECT one_liner, mood, COALESCE(full_note,'')
		 FROM planner_diary WHERE user_id=$1 AND entry_date=$2`, userID, date,
	).Scan(&d.OneLiner, &d.Mood, &d.FullNote)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.PlannerDiary{}, false, nil
	}
	if err != nil {
		return entity.PlannerDiary{}, false, fmt.Errorf("postgres planner diary get: %w", err)
	}
	return d, true, nil
}

func (r *PlannerRepository) UpsertDiary(ctx context.Context, userID string, d entity.PlannerDiary) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO planner_diary (user_id, entry_date, one_liner, mood, full_note)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (user_id, entry_date) DO UPDATE
		   SET one_liner=$3, mood=$4, full_note=$5, updated_at=NOW()`,
		userID, d.Date, d.OneLiner, d.Mood, d.FullNote,
	)
	if err != nil {
		return fmt.Errorf("postgres planner diary upsert: %w", err)
	}
	return nil
}

func (r *PlannerRepository) GetReflection(ctx context.Context, userID, date string) (entity.PlannerReflection, bool, error) {
	var rf entity.PlannerReflection
	rf.Date = date
	err := r.db.Pool().QueryRow(ctx,
		`SELECT notes FROM planner_reflection_notes WHERE user_id=$1 AND note_date=$2`,
		userID, date,
	).Scan(&rf.Notes)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.PlannerReflection{}, false, nil
	}
	if err != nil {
		return entity.PlannerReflection{}, false, fmt.Errorf("postgres planner reflection get: %w", err)
	}
	return rf, true, nil
}

func (r *PlannerRepository) UpsertReflection(ctx context.Context, userID, date string, notes []byte) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO planner_reflection_notes (user_id, note_date, notes)
		 VALUES ($1,$2,$3)
		 ON CONFLICT (user_id, note_date) DO UPDATE
		   SET notes=$3, updated_at=NOW()`,
		userID, date, notes,
	)
	if err != nil {
		return fmt.Errorf("postgres planner reflection upsert: %w", err)
	}
	return nil
}

func (r *PlannerRepository) SetMission(ctx context.Context, userID, mission string) error {
	payload, err := json.Marshal(mission)
	if err != nil {
		return fmt.Errorf("postgres planner mission marshal: %w", err)
	}
	_, err = r.db.Pool().Exec(ctx,
		`UPDATE users
		 SET preferences = jsonb_set(COALESCE(preferences,'{}'), '{planner_mission}', $1::jsonb)
		 WHERE id = $2`,
		string(payload), userID,
	)
	if err != nil {
		return fmt.Errorf("postgres planner mission update: %w", err)
	}
	return nil
}

// ── Shared scanners ──────────────────────────────────────────────

func (r *PlannerRepository) queryRoles(ctx context.Context, query string, args ...any) ([]entity.PlannerRole, error) {
	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres planner roles: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerRole
	for rows.Next() {
		var r entity.PlannerRole
		if err := rows.Scan(&r.ID, &r.Name, &r.Color, &r.BigRock, &r.Mission, &r.SortOrder); err != nil {
			return nil, fmt.Errorf("postgres planner roles scan: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) queryTasks(ctx context.Context, query string, args ...any) ([]entity.PlannerTask, error) {
	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres planner tasks: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerTask
	for rows.Next() {
		var t entity.PlannerTask
		if err := rows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.SortOrder,
			&t.RoleID, &t.TimeStart, &t.TimeEnd, &t.Delegatee, &t.Note,
			&t.Date, &t.ForwardedFromID, &t.WeeklyGoalID); err != nil {
			return nil, fmt.Errorf("postgres planner tasks scan: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) queryInbox(ctx context.Context, query string, args ...any) ([]entity.PlannerInboxItem, error) {
	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres planner inbox: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerInboxItem
	for rows.Next() {
		var i entity.PlannerInboxItem
		if err := rows.Scan(&i.ID, &i.Title, &i.Priority, &i.SortOrder); err != nil {
			return nil, fmt.Errorf("postgres planner inbox scan: %w", err)
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) queryWeeklyGoals(ctx context.Context, query string, args ...any) ([]entity.PlannerWeeklyGoal, error) {
	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres planner weekly goals: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerWeeklyGoal
	for rows.Next() {
		var g entity.PlannerWeeklyGoal
		if err := rows.Scan(&g.ID, &g.RoleID, &g.Title, &g.Done, &g.WeekStart); err != nil {
			return nil, fmt.Errorf("postgres planner weekly goals scan: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *PlannerRepository) queryGoals(ctx context.Context, query string, args ...any) ([]entity.PlannerGoal, error) {
	rows, err := r.db.Pool().Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("postgres planner goals: %w", err)
	}
	defer rows.Close()
	var out []entity.PlannerGoal
	for rows.Next() {
		var g entity.PlannerGoal
		if err := rows.Scan(&g.ID, &g.Title, &g.RoleID, &g.DueDate, &g.Description, &g.Status); err != nil {
			return nil, fmt.Errorf("postgres planner goals scan: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.PlannerRepository = (*PlannerRepository)(nil)
