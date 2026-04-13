package entity

// PlannerRole is one row in planner_roles.
type PlannerRole struct {
	ID        int64
	Name      string
	Color     string
	BigRock   string
	Mission   string
	SortOrder int
}

// PlannerTask is one row in planner_tasks where is_inbox = false.
// Zero values for RoleID/ForwardedFromID/WeeklyGoalID mean "unset"
// (the HTTP handler omits them from the JSON response).
type PlannerTask struct {
	ID              int64
	Title           string
	Status          string
	Priority        string
	SortOrder       int
	RoleID          int64
	TimeStart       string
	TimeEnd         string
	Delegatee       string
	Note            string
	Date            string // "YYYY-MM-DD"
	ForwardedFromID int64
	WeeklyGoalID    int64
}

// PlannerInboxItem is one row in planner_tasks where is_inbox = true.
type PlannerInboxItem struct {
	ID        int64
	Title     string
	Priority  string
	SortOrder int
}

// PlannerWeeklyGoal is one row in planner_weekly_goals. TaskCount /
// DoneCount are enrichment fields populated by the Snapshot usecase
// via a follow-up COUNT query.
type PlannerWeeklyGoal struct {
	ID        int64
	RoleID    int64
	Title     string
	Done      bool
	WeekStart string
	TaskCount int
	DoneCount int
}

// PlannerGoal is one row in planner_goals.
type PlannerGoal struct {
	ID          int64
	Title       string
	RoleID      int64
	DueDate     string
	Description string
	Status      string
}

// PlannerDiary is one row in planner_diary.
type PlannerDiary struct {
	Date     string
	OneLiner string
	Mood     string
	FullNote string
}

// PlannerReflection is one row in planner_reflection_notes. Notes is
// the raw JSONB blob — the handler marshals it into whatever shape
// the UI needs.
type PlannerReflection struct {
	Date  string
	Notes []byte // json.RawMessage equivalent
}

// PlannerSnapshot is the aggregate /planner/snapshot response.
type PlannerSnapshot struct {
	Roles       []PlannerRole
	Tasks       []PlannerTask
	Inbox       []PlannerInboxItem
	WeeklyGoals []PlannerWeeklyGoal
	Goals       []PlannerGoal
	Diary       []PlannerDiary
	Reflections []PlannerReflection
	Mission     string
}
