// Package cron hosts the /cron/* use cases: the system-job catalogue
// (builtin jobs + per-user toggles), the user-schedule CRUD workflow
// over the knowledge_base table, and the event-driven Wake /
// TriggerJob hooks that re-arm the live scheduler.
//
// The scheduler itself lives in internal/infrastructure/scheduler —
// the usecase depends on it via narrow ports (port.ScheduleWaker /
// port.JobTriggerer) so tests can fake them.
package cron

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/scheduler"
	"github.com/newstarnion/gateway/internal/port"
)

type UseCase struct {
	repo      repository.CronRepository
	sched     port.ScheduleWaker // nil-safe
	triggerer port.JobTriggerer  // nil-safe
}

func NewUseCase(repo repository.CronRepository) *UseCase {
	return &UseCase{repo: repo}
}

// SetScheduler wires the event-driven scheduler post-construction so
// CRUD operations immediately re-arm the timer. Called from
// server.New after the scheduler is built. The optional
// JobTriggerer interface is pulled out of the same value when
// supported.
func (u *UseCase) SetScheduler(w port.ScheduleWaker) {
	u.sched = w
	if jt, ok := w.(port.JobTriggerer); ok {
		u.triggerer = jt
	}
}

func (u *UseCase) wake() {
	if u.sched != nil {
		u.sched.Wake()
	}
}

// ── System jobs ───────────────────────────────────────────────────

// ListSystemJobs returns the merged system-job catalogue for the
// given user: scheduler.BuiltinJobs + jobMeta + per-user opt-in /
// opt-out state read from users.preferences.scheduler.
func (u *UseCase) ListSystemJobs(ctx context.Context, userID uuid.UUID, lang string) ([]entity.SystemJob, error) {
	prefs, err := u.repo.GetPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}
	if lang == "" {
		lang = "ko"
		if l, ok := prefs["language"].(string); ok && l != "" {
			lang = l
		}
	}
	translations := jobTranslations[lang] // nil for "ko"

	base := buildBaseSystemJobs()
	out := make([]entity.SystemJob, len(base))
	for i, job := range base {
		out[i] = job
		out[i].HumanSchedule = HumanizeCron(job.Schedule, lang)
		if t, ok := translations[job.ID]; ok {
			out[i].Name = t.Name
			out[i].Description = t.Description
		}
		if job.CanDisable {
			if job.Enabled {
				out[i].Enabled = !isJobDisabled(prefs, job.ID)
			} else {
				out[i].Enabled = isJobEnabled(prefs, job.ID)
			}
		}
	}
	return out, nil
}

// buildBaseSystemJobs merges scheduler.BuiltinJobs with jobMeta at
// call time. Appending user_schedules at the end mirrors the legacy
// handler's behaviour — it has no scheduler.Job entry because it is
// the scheduler's runner arm rather than a callable action.
func buildBaseSystemJobs() []entity.SystemJob {
	out := make([]entity.SystemJob, 0, len(scheduler.BuiltinJobs)+2)
	for _, j := range scheduler.BuiltinJobs {
		meta := jobMeta[j.ID]
		out = append(out, entity.SystemJob{
			ID:          j.ID,
			Name:        meta.Name,
			Description: meta.Description,
			Schedule:    j.CronExpr,
			Level:       meta.Level,
			Enabled:     j.DefaultEnabled,
			CanDisable:  meta.CanDisable,
		})
	}
	if meta, ok := jobMeta["user_schedules"]; ok {
		out = append(out, entity.SystemJob{
			ID:          "user_schedules",
			Name:        meta.Name,
			Description: meta.Description,
			Schedule:    "*/15 * * * *",
			Level:       meta.Level,
			Enabled:     true,
			CanDisable:  meta.CanDisable,
		})
	}
	return out
}

// ToggleSystemJob flips the enabled flag for the given system job
// by editing users.preferences.scheduler.{enabled_jobs,disabled_jobs}.
// Default-ON jobs use disabled_jobs (opt-out); default-OFF jobs use
// enabled_jobs (opt-in).
func (u *UseCase) ToggleSystemJob(ctx context.Context, userID uuid.UUID, jobID string) (bool, error) {
	var target *entity.SystemJob
	base := buildBaseSystemJobs()
	for i := range base {
		if base[i].ID == jobID {
			target = &base[i]
			break
		}
	}
	if target == nil {
		return false, fmt.Errorf("%w: job not found", domain.ErrNotFound)
	}
	if !target.CanDisable {
		return false, fmt.Errorf("%w: this job cannot be toggled", domain.ErrInvalidArgument)
	}

	prefs, err := u.repo.GetPreferences(ctx, userID)
	if err != nil {
		return false, err
	}
	schedMap, _ := prefs["scheduler"].(map[string]any)
	if schedMap == nil {
		schedMap = map[string]any{}
	}

	listKey := "disabled_jobs"
	if !target.Enabled {
		listKey = "enabled_jobs"
	}
	var current []string
	if arr, ok := schedMap[listKey].([]any); ok {
		for _, d := range arr {
			if s, ok := d.(string); ok {
				current = append(current, s)
			}
		}
	}
	found := false
	next := make([]string, 0, len(current))
	for _, d := range current {
		if d == jobID {
			found = true
		} else {
			next = append(next, d)
		}
	}
	enabled := true
	if listKey == "disabled_jobs" {
		if !found {
			next = append(next, jobID)
			enabled = false
		}
	} else {
		if !found {
			next = append(next, jobID)
			enabled = true
		} else {
			enabled = false
		}
	}
	schedMap[listKey] = next
	prefs["scheduler"] = schedMap
	if err := u.repo.UpdatePreferences(ctx, userID, prefs); err != nil {
		return false, err
	}
	return enabled, nil
}

// TriggerResult carries the output of a manual system-job fire.
type TriggerResult struct {
	Message   string
	Sent      bool
	Scheduled bool
}

// TriggerSystemJob fires a built-in job immediately for the given
// user via the injected JobTriggerer. Validates that the job exists
// and that a triggerer is wired — returns a domain error otherwise.
func (u *UseCase) TriggerSystemJob(ctx context.Context, userID uuid.UUID, jobID string) (TriggerResult, error) {
	base := buildBaseSystemJobs()
	var found bool
	var targetEnabled bool
	for _, j := range base {
		if j.ID == jobID {
			found = true
			targetEnabled = j.Enabled
			break
		}
	}
	if !found {
		return TriggerResult{}, fmt.Errorf("%w: job not found", domain.ErrNotFound)
	}
	if u.triggerer == nil {
		return TriggerResult{}, fmt.Errorf("%w: scheduler not available", domain.ErrUnavailable)
	}
	msg, sent, err := u.triggerer.TriggerJob(ctx, jobID, userID.String())
	if err != nil {
		return TriggerResult{}, err
	}
	scheduled := true
	if !targetEnabled {
		prefs, _ := u.repo.GetPreferences(ctx, userID)
		scheduled = isJobEnabled(prefs, jobID)
	}
	return TriggerResult{Message: msg, Sent: sent, Scheduled: scheduled}, nil
}

// isJobEnabled / isJobDisabled read the opt-in/opt-out lists inside
// prefs.scheduler. Both tolerate missing nested keys so brand-new
// users (empty prefs) return "not found".

func isJobEnabled(prefs map[string]any, jobID string) bool {
	list := prefSchedulerList(prefs, "enabled_jobs")
	for _, s := range list {
		if s == jobID {
			return true
		}
	}
	return false
}

func isJobDisabled(prefs map[string]any, jobID string) bool {
	list := prefSchedulerList(prefs, "disabled_jobs")
	for _, s := range list {
		if s == jobID {
			return true
		}
	}
	return false
}

func prefSchedulerList(prefs map[string]any, key string) []string {
	if prefs == nil {
		return nil
	}
	schedMap, ok := prefs["scheduler"].(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := schedMap[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, d := range raw {
		if s, ok := d.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// ── User schedules ────────────────────────────────────────────────

// ListSchedules returns every user-schedule row for the user.
func (u *UseCase) ListSchedules(ctx context.Context, userID uuid.UUID) ([]entity.UserSchedule, error) {
	rows, err := u.repo.ListSchedules(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []entity.UserSchedule{}
	}
	return rows, nil
}

// CreateCommand is the input DTO for POST /cron/schedules.
type CreateCommand struct {
	Title      string
	Type       string
	ReportType string
	Schedule   entity.SchedTime
	Message    string
	TaskPrompt string
	DeliverTo  string
}

// CreateSchedule validates, persists, and wakes the scheduler.
func (u *UseCase) CreateSchedule(ctx context.Context, userID uuid.UUID, cmd CreateCommand) (entity.UserSchedule, error) {
	if cmd.Title == "" {
		return entity.UserSchedule{}, fmt.Errorf("%w: title is required", domain.ErrInvalidArgument)
	}
	if cmd.DeliverTo != "" && cmd.DeliverTo != "telegram" {
		return entity.UserSchedule{}, fmt.Errorf("%w: deliver_to must be 'telegram' or empty", domain.ErrInvalidArgument)
	}
	cmd.Title = trim(cmd.Title, 200)
	cmd.Message = trim(cmd.Message, 1000)
	cmd.TaskPrompt = trim(cmd.TaskPrompt, 2000)
	if cmd.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(cmd.Schedule.Timezone); err != nil {
			cmd.Schedule.Timezone = "UTC"
		}
	}
	if cmd.Type == "" {
		cmd.Type = "recurring"
	}
	if cmd.ReportType == "" {
		cmd.ReportType = "custom_reminder"
	}

	schedID := uuid.New().String()
	schedule := entity.UserSchedule{
		ID:         schedID,
		Title:      cmd.Title,
		Type:       cmd.Type,
		ReportType: cmd.ReportType,
		Schedule:   cmd.Schedule,
		Status:     "active",
		Message:    cmd.Message,
		TaskPrompt: cmd.TaskPrompt,
		DeliverTo:  cmd.DeliverTo,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}
	value, _ := json.Marshal(toStored(schedule))
	rowID, err := u.repo.CreateSchedule(ctx, userID, schedID, string(value))
	if err != nil {
		return entity.UserSchedule{}, err
	}
	schedule.KBRowID = rowID
	u.wake()
	return schedule, nil
}

// InternalCreateCommand is the input DTO for POST /internal/cron-schedule.
// Used by the agent's cron_create tool — the gateway passes through
// a raw user id string because the caller may be an external process.
type InternalCreateCommand struct {
	UserID     string
	Title      string
	TaskPrompt string
	Schedule   entity.SchedTime
	DeliverTo  string
}

// InternalCreateResult is the response for /internal/cron-schedule.
type InternalCreateResult struct {
	ID        string
	KBRowID   int64
	Title     string
	CreatedAt string
}

// InternalCreateSchedule is the agent-facing create entrypoint.
// Unlike CreateSchedule this one does NOT require a JWT user id
// parameter — the user id comes from the request body.
func (u *UseCase) InternalCreateSchedule(ctx context.Context, cmd InternalCreateCommand) (InternalCreateResult, error) {
	if cmd.UserID == "" || cmd.Title == "" {
		return InternalCreateResult{}, fmt.Errorf("%w: user_id and title are required", domain.ErrInvalidArgument)
	}
	cmd.Title = trim(cmd.Title, 200)
	cmd.TaskPrompt = trim(cmd.TaskPrompt, 2000)
	if cmd.DeliverTo != "" && cmd.DeliverTo != "telegram" {
		cmd.DeliverTo = ""
	}
	schedID := uuid.New().String()
	createdAt := time.Now().Format(time.RFC3339)
	stored := storedSchedule{
		Title:      cmd.Title,
		Type:       "recurring",
		ReportType: "custom_reminder",
		Schedule:   cmd.Schedule,
		Status:     "active",
		TaskPrompt: cmd.TaskPrompt,
		DeliverTo:  cmd.DeliverTo,
		CreatedAt:  createdAt,
	}
	value, _ := json.Marshal(stored)
	rowID, err := u.repo.CreateScheduleForUserID(ctx, cmd.UserID, schedID, string(value))
	if err != nil {
		return InternalCreateResult{}, err
	}
	u.wake()
	return InternalCreateResult{
		ID:        schedID,
		KBRowID:   rowID,
		Title:     cmd.Title,
		CreatedAt: createdAt,
	}, nil
}

// UpdateCommand is the input DTO for PUT /cron/schedules/:id.
// Empty string fields mean "leave alone" (matches legacy semantics);
// Message/Schedule/TaskPrompt/DeliverTo are always rewritten.
type UpdateCommand struct {
	Title      string
	Type       string
	ReportType string
	Schedule   entity.SchedTime
	Message    string
	Status     string
	TaskPrompt string
	DeliverTo  string
}

// UpdateSchedule validates the request, merges it over the existing
// row, writes back, and wakes the scheduler.
func (u *UseCase) UpdateSchedule(ctx context.Context, userID uuid.UUID, schedID string, cmd UpdateCommand) (string, error) {
	if _, err := uuid.Parse(schedID); err != nil {
		return "", fmt.Errorf("%w: invalid schedule id", domain.ErrInvalidArgument)
	}
	if cmd.DeliverTo != "" && cmd.DeliverTo != "telegram" {
		return "", fmt.Errorf("%w: deliver_to must be 'telegram' or empty", domain.ErrInvalidArgument)
	}
	if cmd.Status != "" && cmd.Status != "active" && cmd.Status != "paused" {
		return "", fmt.Errorf("%w: status must be 'active' or 'paused'", domain.ErrInvalidArgument)
	}
	cmd.TaskPrompt = trim(cmd.TaskPrompt, 2000)
	if cmd.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(cmd.Schedule.Timezone); err != nil {
			cmd.Schedule.Timezone = "UTC"
		}
	}

	raw, ok, err := u.repo.GetSchedule(ctx, userID, schedID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.ErrNotFound
	}
	var existing storedSchedule
	_ = json.Unmarshal([]byte(raw), &existing)
	if cmd.Title != "" {
		existing.Title = cmd.Title
	}
	if cmd.Type != "" {
		existing.Type = cmd.Type
	}
	if cmd.ReportType != "" {
		existing.ReportType = cmd.ReportType
	}
	if cmd.Status != "" {
		existing.Status = cmd.Status
	}
	existing.Message = cmd.Message
	existing.Schedule = cmd.Schedule
	existing.TaskPrompt = cmd.TaskPrompt
	existing.DeliverTo = cmd.DeliverTo

	newValue, _ := json.Marshal(existing)
	if err := u.repo.UpdateSchedule(ctx, userID, schedID, string(newValue)); err != nil {
		return "", err
	}
	u.wake()
	return existing.Status, nil
}

// DeleteSchedule removes a row and wakes the scheduler. Returns
// domain.ErrNotFound when nothing was deleted.
func (u *UseCase) DeleteSchedule(ctx context.Context, userID uuid.UUID, schedID string) error {
	if _, err := uuid.Parse(schedID); err != nil {
		return fmt.Errorf("%w: invalid schedule id", domain.ErrInvalidArgument)
	}
	n, err := u.repo.DeleteSchedule(ctx, userID, schedID)
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	u.wake()
	return nil
}

// ToggleSchedule flips the status (active ↔ paused) on an existing
// user schedule and wakes the scheduler.
func (u *UseCase) ToggleSchedule(ctx context.Context, userID uuid.UUID, schedID string) (string, error) {
	if _, err := uuid.Parse(schedID); err != nil {
		return "", fmt.Errorf("%w: invalid schedule id", domain.ErrInvalidArgument)
	}
	raw, ok, err := u.repo.GetSchedule(ctx, userID, schedID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.ErrNotFound
	}
	var data storedSchedule
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return "", fmt.Errorf("%w: parse failed", domain.ErrInvalidArgument)
	}
	if data.Status == "active" {
		data.Status = "paused"
	} else {
		data.Status = "active"
	}
	newValue, _ := json.Marshal(data)
	if err := u.repo.UpdateSchedule(ctx, userID, schedID, string(newValue)); err != nil {
		return "", err
	}
	u.wake()
	return data.Status, nil
}

// ── helpers ───────────────────────────────────────────────────────

// storedSchedule mirrors the JSON blob persisted in knowledge_base.
// Duplicated from postgres.storedSchedule so the usecase does not
// import the adapter package (the two shapes are intentionally
// identical and maintained together).
type storedSchedule struct {
	Title      string           `json:"title"`
	Type       string           `json:"type"`
	ReportType string           `json:"report_type"`
	Schedule   entity.SchedTime `json:"schedule"`
	Status     string           `json:"status"`
	Message    string           `json:"message"`
	TaskPrompt string           `json:"task_prompt,omitempty"`
	LastOutput string           `json:"last_output,omitempty"`
	DeliverTo  string           `json:"deliver_to,omitempty"`
	LastSent   string           `json:"last_sent"`
	CreatedAt  string           `json:"created_at"`
}

func toStored(s entity.UserSchedule) storedSchedule {
	return storedSchedule{
		Title:      s.Title,
		Type:       s.Type,
		ReportType: s.ReportType,
		Schedule:   s.Schedule,
		Status:     s.Status,
		Message:    s.Message,
		TaskPrompt: s.TaskPrompt,
		LastOutput: s.LastOutput,
		DeliverTo:  s.DeliverTo,
		LastSent:   s.LastSent,
		CreatedAt:  s.CreatedAt,
	}
}

func trim(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}

// Compile-time reference so the import isn't dropped.
var _ = strings.HasPrefix
