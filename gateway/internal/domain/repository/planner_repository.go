package repository

import (
	"context"

	"github.com/newstarnion/gateway/internal/domain/entity"
)

// PlannerRepository owns every planner_* table plus the
// users.preferences.planner_mission key. Method names mirror the
// HTTP surface so the wiring stays mechanical.
type PlannerRepository interface {
	// ── Snapshot helpers (used by Snapshot usecase) ──────────────
	SnapshotRoles(ctx context.Context, userID string) ([]entity.PlannerRole, error)
	SnapshotTasksAround(ctx context.Context, userID, centerDate string) ([]entity.PlannerTask, error)
	SnapshotInbox(ctx context.Context, userID string) ([]entity.PlannerInboxItem, error)
	SnapshotWeeklyGoals(ctx context.Context, userID, weekStart string) ([]entity.PlannerWeeklyGoal, error)
	SnapshotActiveGoals(ctx context.Context, userID string) ([]entity.PlannerGoal, error)
	SnapshotDiary(ctx context.Context, userID, centerDate string) ([]entity.PlannerDiary, error)
	SnapshotReflections(ctx context.Context, userID, centerDate string) ([]entity.PlannerReflection, error)
	GetMission(ctx context.Context, userID string) (string, error)
	// WeeklyGoalCounts returns a map of weekly_goal_id -> (total,
	// done) for the given user so the snapshot can enrich wgoals.
	WeeklyGoalCounts(ctx context.Context, userID string) (map[int64][2]int, error)

	// ── Roles ────────────────────────────────────────────────────
	ListRoles(ctx context.Context, userID string) ([]entity.PlannerRole, error)
	CreateRole(ctx context.Context, userID string, r RoleCreate) (int64, error)
	UpdateRole(ctx context.Context, userID, id string, r RoleUpdate) error
	DeleteRole(ctx context.Context, userID, id string) error

	// ── Tasks ────────────────────────────────────────────────────
	ListTasksByDate(ctx context.Context, userID, date string) ([]entity.PlannerTask, error)
	CreateTask(ctx context.Context, userID string, t TaskCreate) (int64, error)
	UpdateTask(ctx context.Context, userID, id string, fields map[string]any) error
	DeleteTask(ctx context.Context, userID, id string) error
	ForwardTask(ctx context.Context, userID, id string) (int64, error)
	ReorderTasks(ctx context.Context, userID string, items []TaskReorderItem) error
	ListTasksByWeeklyGoal(ctx context.Context, userID, goalID string) ([]entity.PlannerTask, error)

	// ── Inbox ────────────────────────────────────────────────────
	ListInbox(ctx context.Context, userID string) ([]entity.PlannerInboxItem, error)
	CreateInbox(ctx context.Context, userID, title string) (int64, error)
	PromoteInbox(ctx context.Context, userID, id string, promote InboxPromote) error
	DeleteInbox(ctx context.Context, userID, id string) error

	// ── Weekly goals ─────────────────────────────────────────────
	ListWeeklyGoals(ctx context.Context, userID, weekStart string) ([]entity.PlannerWeeklyGoal, error)
	CreateWeeklyGoal(ctx context.Context, userID string, g WeeklyGoalCreate) (int64, error)
	ToggleWeeklyGoal(ctx context.Context, userID, id string) error
	DeleteWeeklyGoal(ctx context.Context, userID, id string) error

	// ── Goals ────────────────────────────────────────────────────
	ListGoals(ctx context.Context, userID string) ([]entity.PlannerGoal, error)
	CreateGoal(ctx context.Context, userID string, g GoalCreate) (int64, error)
	UpdateGoal(ctx context.Context, userID, id string, g GoalUpdate) error
	DeleteGoal(ctx context.Context, userID, id string) error

	// ── Diary / reflections / mission ────────────────────────────
	GetDiary(ctx context.Context, userID, date string) (entity.PlannerDiary, bool, error)
	UpsertDiary(ctx context.Context, userID string, d entity.PlannerDiary) error
	GetReflection(ctx context.Context, userID, date string) (entity.PlannerReflection, bool, error)
	UpsertReflection(ctx context.Context, userID, date string, notes []byte) error
	SetMission(ctx context.Context, userID, mission string) error
}

// ── Write DTOs ────────────────────────────────────────────────────

type RoleCreate struct {
	Name    string
	Color   string
	BigRock string
	Mission string
}

type RoleUpdate struct {
	Name    *string
	Color   *string
	BigRock *string
	Mission *string
}

type TaskCreate struct {
	Title        string
	Priority     string
	RoleID       *int64
	Date         string
	TimeStart    string
	TimeEnd      string
	Note         string
	WeeklyGoalID *int64
}

type TaskReorderItem struct {
	ID    int64
	Order int
}

type InboxPromote struct {
	Priority string
	RoleID   *int64
	Date     string
}

type WeeklyGoalCreate struct {
	RoleID    int64
	Title     string
	WeekStart string
}

type GoalCreate struct {
	Title       string
	RoleID      *int64
	DueDate     string
	Description string
}

type GoalUpdate struct {
	Title       *string
	DueDate     *string
	Description *string
	Status      *string
}
