package entity

// SchedTime is the storage-layer schedule shape used by user
// schedules. It maps to the JSON blob stored inside the
// knowledge_base `value` column under `schedule:<uuid>` keys.
type SchedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
	Timezone  string `json:"timezone,omitempty"`
}

// UserSchedule is one row in the user-schedule list the UI renders
// under /settings/cron. The Kind/ReportType fields drive the
// scheduler dispatcher and are preserved as-is from the legacy
// storage shape.
type UserSchedule struct {
	ID         string    `json:"id"`
	KBRowID    int64     `json:"kb_row_id"`
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	ReportType string    `json:"report_type"`
	Schedule   SchedTime `json:"schedule"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	TaskPrompt string    `json:"task_prompt,omitempty"`
	LastOutput string    `json:"last_output,omitempty"`
	DeliverTo  string    `json:"deliver_to,omitempty"`
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

// SystemJob is one row in the /cron/system catalogue. It merges
// scheduler.BuiltinJobs (action + default enablement) with the
// jobUIMeta map (display name/description/level) at request time
// so the two sources never drift out of sync.
type SystemJob struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Schedule      string `json:"schedule"`
	HumanSchedule string `json:"human_schedule"`
	Level         string `json:"level"`
	Enabled       bool   `json:"enabled"`
	CanDisable    bool   `json:"can_disable"`
}
