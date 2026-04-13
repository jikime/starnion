// Package planner hosts the planner domain use cases: roles, tasks,
// inbox, weekly goals, goals, diary, reflections, and mission. The
// handler layer is a thin pass-through — most routes have no
// business logic beyond defaulting missing fields — so the usecase
// shape mirrors the HTTP surface closely.
package planner

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"golang.org/x/sync/errgroup"
)

type UseCase struct {
	repo repository.PlannerRepository
}

func NewUseCase(repo repository.PlannerRepository) *UseCase {
	return &UseCase{repo: repo}
}

// ── Snapshot ─────────────────────────────────────────────────────

// Snapshot runs 8 read queries in parallel for the /planner/snapshot
// endpoint and enriches weekly goals with task counts.
func (u *UseCase) Snapshot(ctx context.Context, userID uuid.UUID) (entity.PlannerSnapshot, error) {
	uid := userID.String()
	today := time.Now().Format("2006-01-02")
	monday := MondayOf(time.Now()).Format("2006-01-02")

	var snap entity.PlannerSnapshot
	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		rows, err := u.repo.SnapshotRoles(gctx, uid)
		if err == nil {
			snap.Roles = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotTasksAround(gctx, uid, today)
		if err == nil {
			snap.Tasks = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotInbox(gctx, uid)
		if err == nil {
			snap.Inbox = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotWeeklyGoals(gctx, uid, monday)
		if err == nil {
			snap.WeeklyGoals = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotActiveGoals(gctx, uid)
		if err == nil {
			snap.Goals = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotDiary(gctx, uid, today)
		if err == nil {
			snap.Diary = rows
		}
		return nil
	})
	g.Go(func() error {
		rows, err := u.repo.SnapshotReflections(gctx, uid, today)
		if err == nil {
			snap.Reflections = rows
		}
		return nil
	})
	g.Go(func() error {
		m, err := u.repo.GetMission(gctx, uid)
		if err == nil {
			snap.Mission = m
		}
		return nil
	})
	_ = g.Wait()

	// Enrich weekly goals with task counts.
	if len(snap.WeeklyGoals) > 0 {
		counts, err := u.repo.WeeklyGoalCounts(ctx, uid)
		if err == nil {
			for i, wg := range snap.WeeklyGoals {
				if c, ok := counts[wg.ID]; ok {
					snap.WeeklyGoals[i].TaskCount = c[0]
					snap.WeeklyGoals[i].DoneCount = c[1]
				}
			}
		}
	}
	return snap, nil
}

// ── Roles ─────────────────────────────────────────────────────────

func (u *UseCase) ListRoles(ctx context.Context, userID uuid.UUID) ([]entity.PlannerRole, error) {
	return u.repo.ListRoles(ctx, userID.String())
}

func (u *UseCase) CreateRole(ctx context.Context, userID uuid.UUID, req repository.RoleCreate) (int64, error) {
	return u.repo.CreateRole(ctx, userID.String(), req)
}

func (u *UseCase) UpdateRole(ctx context.Context, userID uuid.UUID, id string, req repository.RoleUpdate) error {
	return u.repo.UpdateRole(ctx, userID.String(), id, req)
}

func (u *UseCase) DeleteRole(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteRole(ctx, userID.String(), id)
}

// ── Tasks ─────────────────────────────────────────────────────────

func (u *UseCase) ListTasksByDate(ctx context.Context, userID uuid.UUID, date string) ([]entity.PlannerTask, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	return u.repo.ListTasksByDate(ctx, userID.String(), date)
}

func (u *UseCase) CreateTask(ctx context.Context, userID uuid.UUID, req repository.TaskCreate) (int64, error) {
	if req.Date == "" {
		req.Date = time.Now().Format("2006-01-02")
	}
	if req.Priority == "" {
		req.Priority = "C"
	}
	return u.repo.CreateTask(ctx, userID.String(), req)
}

func (u *UseCase) UpdateTask(ctx context.Context, userID uuid.UUID, id string, fields map[string]any) error {
	return u.repo.UpdateTask(ctx, userID.String(), id, fields)
}

func (u *UseCase) DeleteTask(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteTask(ctx, userID.String(), id)
}

func (u *UseCase) ForwardTask(ctx context.Context, userID uuid.UUID, id string) (int64, error) {
	return u.repo.ForwardTask(ctx, userID.String(), id)
}

func (u *UseCase) ReorderTasks(ctx context.Context, userID uuid.UUID, items []repository.TaskReorderItem) error {
	return u.repo.ReorderTasks(ctx, userID.String(), items)
}

func (u *UseCase) ListTasksByWeeklyGoal(ctx context.Context, userID uuid.UUID, goalID string) ([]entity.PlannerTask, error) {
	return u.repo.ListTasksByWeeklyGoal(ctx, userID.String(), goalID)
}

// ── Inbox ─────────────────────────────────────────────────────────

func (u *UseCase) ListInbox(ctx context.Context, userID uuid.UUID) ([]entity.PlannerInboxItem, error) {
	return u.repo.ListInbox(ctx, userID.String())
}

func (u *UseCase) CreateInbox(ctx context.Context, userID uuid.UUID, title string) (int64, error) {
	return u.repo.CreateInbox(ctx, userID.String(), title)
}

func (u *UseCase) PromoteInbox(ctx context.Context, userID uuid.UUID, id string, p repository.InboxPromote) error {
	if p.Priority == "" {
		p.Priority = "C"
	}
	if p.Date == "" {
		p.Date = time.Now().Format("2006-01-02")
	}
	return u.repo.PromoteInbox(ctx, userID.String(), id, p)
}

func (u *UseCase) DeleteInbox(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteInbox(ctx, userID.String(), id)
}

// ── Weekly goals ──────────────────────────────────────────────────

func (u *UseCase) ListWeeklyGoals(ctx context.Context, userID uuid.UUID, week string) ([]entity.PlannerWeeklyGoal, error) {
	if week == "" {
		week = MondayOf(time.Now()).Format("2006-01-02")
	}
	return u.repo.ListWeeklyGoals(ctx, userID.String(), week)
}

func (u *UseCase) CreateWeeklyGoal(ctx context.Context, userID uuid.UUID, g repository.WeeklyGoalCreate) (int64, error) {
	if g.WeekStart == "" {
		g.WeekStart = MondayOf(time.Now()).Format("2006-01-02")
	}
	return u.repo.CreateWeeklyGoal(ctx, userID.String(), g)
}

func (u *UseCase) ToggleWeeklyGoal(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.ToggleWeeklyGoal(ctx, userID.String(), id)
}

func (u *UseCase) DeleteWeeklyGoal(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteWeeklyGoal(ctx, userID.String(), id)
}

// ── Goals ─────────────────────────────────────────────────────────

func (u *UseCase) ListGoals(ctx context.Context, userID uuid.UUID) ([]entity.PlannerGoal, error) {
	return u.repo.ListGoals(ctx, userID.String())
}

func (u *UseCase) CreateGoal(ctx context.Context, userID uuid.UUID, g repository.GoalCreate) (int64, error) {
	return u.repo.CreateGoal(ctx, userID.String(), g)
}

func (u *UseCase) UpdateGoal(ctx context.Context, userID uuid.UUID, id string, g repository.GoalUpdate) error {
	return u.repo.UpdateGoal(ctx, userID.String(), id, g)
}

func (u *UseCase) DeleteGoal(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteGoal(ctx, userID.String(), id)
}

// ── Diary / reflections / mission ────────────────────────────────

func (u *UseCase) GetDiary(ctx context.Context, userID uuid.UUID, date string) (entity.PlannerDiary, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	d, found, err := u.repo.GetDiary(ctx, userID.String(), date)
	if err != nil {
		return entity.PlannerDiary{}, err
	}
	if !found {
		return entity.PlannerDiary{Date: date, Mood: "neutral"}, nil
	}
	return d, nil
}

func (u *UseCase) UpsertDiary(ctx context.Context, userID uuid.UUID, d entity.PlannerDiary) error {
	if d.Date == "" {
		d.Date = time.Now().Format("2006-01-02")
	}
	if d.Mood == "" {
		d.Mood = "neutral"
	}
	return u.repo.UpsertDiary(ctx, userID.String(), d)
}

func (u *UseCase) GetReflection(ctx context.Context, userID uuid.UUID, date string) (entity.PlannerReflection, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	r, found, err := u.repo.GetReflection(ctx, userID.String(), date)
	if err != nil {
		return entity.PlannerReflection{}, err
	}
	if !found {
		return entity.PlannerReflection{Date: date}, nil
	}
	return r, nil
}

func (u *UseCase) UpsertReflection(ctx context.Context, userID uuid.UUID, date string, notes []byte) error {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	return u.repo.UpsertReflection(ctx, userID.String(), date, notes)
}

func (u *UseCase) GetMission(ctx context.Context, userID uuid.UUID) (string, error) {
	return u.repo.GetMission(ctx, userID.String())
}

func (u *UseCase) SetMission(ctx context.Context, userID uuid.UUID, mission string) error {
	return u.repo.SetMission(ctx, userID.String(), mission)
}

// ── Helpers ───────────────────────────────────────────────────────

// MondayOf returns the Monday of the week containing t. Exported
// for the HTTP handler to use in snapshot default window math.
func MondayOf(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return t.AddDate(0, 0, -(weekday - 1))
}
