package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// ScheduleWaker signals the scheduler to re-arm its event-driven timer.
// Implemented by *scheduler.Scheduler; may be nil before the scheduler starts.
type ScheduleWaker interface {
	Wake()
}

type CronHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
	sched  ScheduleWaker // optional; nil-safe
}

func NewCronHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *CronHandler {
	return &CronHandler{db: db, config: cfg, logger: logger}
}

// SetScheduler wires the event-driven scheduler into the cron handler so that
// create/update/delete operations immediately re-arm the user schedule timer.
func (h *CronHandler) SetScheduler(w ScheduleWaker) {
	h.sched = w
}

func (h *CronHandler) wake() {
	if h.sched != nil {
		h.sched.Wake()
	}
}

// ── System Jobs ────────────────────────────────────────────────────────────────

type systemJobResponse struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Schedule      string `json:"schedule"`
	HumanSchedule string `json:"human_schedule"`
	Level         string `json:"level"`
	Enabled       bool   `json:"enabled"`
	CanDisable    bool   `json:"can_disable"`
}

// humanizeCron converts a 5-field cron expression to a Korean human-readable string.
// Examples:
//
//	"0 7 * * *"   → "매일 오전 7시"
//	"0 21 * * *"  → "매일 오후 9시"
//	"0 20 * * 0"  → "매주 일요일 오후 8시"
//	"0 21 1 * *"  → "매월 1일 오후 9시"
//	"0 */3 * * *" → "3시간마다"
//	"*/15 * * * *"→ "15분마다"
func humanizeCron(expr string) string {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return expr
	}
	minF, hourF, domF, _, dowF := parts[0], parts[1], parts[2], parts[3], parts[4]

	// */N * * * * — every N minutes
	if strings.HasPrefix(minF, "*/") && hourF == "*" && domF == "*" && dowF == "*" {
		return strings.TrimPrefix(minF, "*/") + "분마다"
	}
	// 0 */N * * * — every N hours
	if minF == "0" && strings.HasPrefix(hourF, "*/") && domF == "*" && dowF == "*" {
		return strings.TrimPrefix(hourF, "*/") + "시간마다"
	}
	// 0 H * * DOW — weekly on specific day
	if minF == "0" && domF == "*" && dowF != "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			if d, errD := strconv.Atoi(dowF); errD == nil {
				return "매주 " + cronWeekdayKR(d) + " " + cronHourKR(h)
			}
		}
	}
	// 0 H D * * — monthly on day D
	if minF == "0" && dowF == "*" && domF != "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			if d, errD := strconv.Atoi(domF); errD == nil {
				return fmt.Sprintf("매월 %d일 %s", d, cronHourKR(h))
			}
		}
	}
	// 0 H * * * — daily at H
	if minF == "0" && domF == "*" && dowF == "*" {
		if h, errH := strconv.Atoi(hourF); errH == nil {
			return "매일 " + cronHourKR(h)
		}
	}
	return expr
}

func cronHourKR(h int) string {
	switch {
	case h == 0:
		return "오전 12시"
	case h < 12:
		return fmt.Sprintf("오전 %d시", h)
	case h == 12:
		return "오후 12시"
	default:
		return fmt.Sprintf("오후 %d시", h-12)
	}
}

func cronWeekdayKR(d int) string {
	switch d {
	case 0:
		return "일요일"
	case 1:
		return "월요일"
	case 2:
		return "화요일"
	case 3:
		return "수요일"
	case 4:
		return "목요일"
	case 5:
		return "금요일"
	case 6:
		return "토요일"
	default:
		return strconv.Itoa(d) + "요일"
	}
}

var builtinSystemJobs = []systemJobResponse{
	// Level 1: Rule-Based
	{ID: "daily_summary", Name: "오늘의 재정 요약", Description: "오늘 지출 내역을 카테고리별로 요약합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "weekly_report", Name: "주간 플래너 리뷰", Description: "이번 주 목표 달성률과 지출 현황을 요약합니다", Schedule: "0 20 * * 0", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "monthly_closing", Name: "월간 재정 정산", Description: "전월 수입/지출 총정리 및 저축률을 알려드립니다", Schedule: "0 21 1 * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "inactive_reminder", Name: "노트 리마인더", Description: "오늘 하루를 기록해보세요. 노트 작성을 유도합니다", Schedule: "0 20 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "budget_warning", Name: "예산 경고", Description: "예산 초과 임박 시 경고 알림을 전송합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	// Level 2: Pattern-Learning
	{ID: "planner_task_reminder", Name: "오늘의 할 일", Description: "오늘 마감인 작업과 우선순위 A 태스크를 알려드립니다", Schedule: "0 9 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "planner_goal_dday", Name: "목표 D-Day 알림", Description: "마감 7일 이내 목표의 남은 날짜를 알려드립니다", Schedule: "0 8 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "spending_anomaly", Name: "이상 소비 감지", Description: "비정상적인 소비 패턴을 감지합니다", Schedule: "0 */3 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "anomaly_insights", Name: "이상 지출 인사이트", Description: "다차원 지출 이상 신호를 종합 분석합니다", Schedule: "0 9 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "pattern_analysis", Name: "소비 패턴 분석", Description: "카테고리 지출 증가 패턴을 분석합니다", Schedule: "0 6 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "pattern_insight", Name: "주간 인사이트", Description: "지출·노트·목표를 종합한 주간 인사이트를 전송합니다", Schedule: "0 14 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "conversation_analysis", Name: "재방문 유도", Description: "3일 이상 대화가 없을 때 텔레그램으로 알림을 보냅니다", Schedule: "0 10 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	// Level 3: External Content (Naver Search API)
	{ID: "daily_news", Name: "오늘의 뉴스", Description: "네이버 검색으로 오늘의 주요 뉴스를 전송합니다", Schedule: "0 7 * * *", Level: "external", Enabled: true, CanDisable: true},
	{ID: "local_events", Name: "오늘의 지역 이벤트", Description: "네이버 지역 검색으로 오늘의 이벤트/행사를 전송합니다", Schedule: "0 12 * * *", Level: "external", Enabled: true, CanDisable: true},
	{ID: "it_blog_digest", Name: "IT 블로그 다이제스트", Description: "네이버 블로그 검색으로 오늘의 IT 관련 글을 전송합니다", Schedule: "0 18 * * *", Level: "external", Enabled: true, CanDisable: true},
	// Level 4: Runner
	{ID: "user_schedules", Name: "사용자 일정 실행기", Description: "15분마다 사용자 생성 일정을 확인하고 실행합니다", Schedule: "*/15 * * * *", Level: "runner", Enabled: true},
	// Level 5: Maintenance
	{ID: "memory_compaction", Name: "메모리 압축", Description: "오래된 지식베이스 항목을 정리합니다", Schedule: "0 5 * * 1", Level: "maintenance", Enabled: true},
}

// GET /api/v1/cron/system
func (h *CronHandler) ListSystemJobs(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var prefsJSON sql.NullString
	_ = h.db.QueryRowContext(c.Request().Context(),
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON)

	var prefs map[string]any
	if prefsJSON.Valid && prefsJSON.String != "" {
		_ = json.Unmarshal([]byte(prefsJSON.String), &prefs)
	}

	result := make([]systemJobResponse, len(builtinSystemJobs))
	for i, job := range builtinSystemJobs {
		result[i] = job
		result[i].HumanSchedule = humanizeCron(job.Schedule)
		if job.CanDisable {
			result[i].Enabled = !isJobDisabled(prefs, job.ID)
		}
	}
	return c.JSON(http.StatusOK, result)
}

// POST /api/v1/cron/system/:id/toggle
func (h *CronHandler) ToggleSystemJob(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	jobID := c.Param("id")

	var target *systemJobResponse
	for i := range builtinSystemJobs {
		if builtinSystemJobs[i].ID == jobID {
			target = &builtinSystemJobs[i]
			break
		}
	}
	if target == nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "job not found"})
	}
	if !target.CanDisable {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "this job cannot be toggled"})
	}

	ctx := c.Request().Context()
	var prefsJSON sql.NullString
	if err := h.db.QueryRowContext(ctx,
		`SELECT preferences FROM users WHERE id = $1`, userID,
	).Scan(&prefsJSON); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to load preferences"})
	}

	var prefs map[string]any
	if prefsJSON.Valid && prefsJSON.String != "" {
		_ = json.Unmarshal([]byte(prefsJSON.String), &prefs)
	}
	if prefs == nil {
		prefs = make(map[string]any)
	}

	schedulerRaw, _ := prefs["scheduler"]
	scheduler, _ := schedulerRaw.(map[string]any)
	if scheduler == nil {
		scheduler = make(map[string]any)
	}

	disabledRaw, _ := scheduler["disabled_jobs"]
	var current []string
	if arr, ok := disabledRaw.([]any); ok {
		for _, d := range arr {
			if s, ok := d.(string); ok {
				current = append(current, s)
			}
		}
	}

	enabled := true
	found := false
	next := make([]string, 0, len(current))
	for _, d := range current {
		if d == jobID {
			found = true
		} else {
			next = append(next, d)
		}
	}
	if !found {
		next = append(next, jobID)
		enabled = false
	}

	scheduler["disabled_jobs"] = next
	prefs["scheduler"] = scheduler

	newPrefsJSON, _ := json.Marshal(prefs)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE users SET preferences = $1 WHERE id = $2`, string(newPrefsJSON), userID,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": jobID, "enabled": enabled})
}

func isJobDisabled(prefs map[string]any, jobID string) bool {
	if prefs == nil {
		return false
	}
	schedulerRaw, ok := prefs["scheduler"]
	if !ok {
		return false
	}
	scheduler, ok := schedulerRaw.(map[string]any)
	if !ok {
		return false
	}
	disabledRaw, ok := scheduler["disabled_jobs"]
	if !ok {
		return false
	}
	disabled, ok := disabledRaw.([]any)
	if !ok {
		return false
	}
	for _, d := range disabled {
		if s, ok := d.(string); ok && s == jobID {
			return true
		}
	}
	return false
}

// ── User Schedules (stored in knowledge_base as JSON) ─────────────────────────

type schedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
	Timezone  string `json:"timezone,omitempty"` // IANA timezone, e.g. "Asia/Seoul"
}

type scheduleData struct {
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	ReportType string    `json:"report_type"`
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	TaskPrompt string    `json:"task_prompt,omitempty"` // AI task prompt — if set, agent runs this instead of static message
	LastOutput string    `json:"last_output,omitempty"` // last AI-generated result
	DeliverTo  string    `json:"deliver_to,omitempty"`  // delivery channel: "telegram" | "" (store only)
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

type scheduleResponse struct {
	ID         string    `json:"id"`
	KBRowID    int64     `json:"kb_row_id"`
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	ReportType string    `json:"report_type"`
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	TaskPrompt string    `json:"task_prompt,omitempty"`
	LastOutput string    `json:"last_output,omitempty"`
	DeliverTo  string    `json:"deliver_to,omitempty"`
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

// GET /api/v1/cron/schedules
func (h *CronHandler) ListUserSchedules(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, key, value FROM knowledge_base
		 WHERE user_id = $1 AND key LIKE 'schedule:%'
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to list schedules"})
	}
	defer rows.Close()

	result := []scheduleResponse{}
	for rows.Next() {
		var rowID int64
		var key, value string
		if err := rows.Scan(&rowID, &key, &value); err != nil {
			continue
		}
		var data scheduleData
		if err := json.Unmarshal([]byte(value), &data); err != nil {
			continue
		}
		schedID := strings.TrimPrefix(key, "schedule:")
		result = append(result, scheduleResponse{
			ID:         schedID,
			KBRowID:    rowID,
			Title:      data.Title,
			Type:       data.Type,
			ReportType: data.ReportType,
			Schedule:   data.Schedule,
			Status:     data.Status,
			Message:    data.Message,
			TaskPrompt: data.TaskPrompt,
			LastOutput: data.LastOutput,
			DeliverTo:  data.DeliverTo,
			LastSent:   data.LastSent,
			CreatedAt:  data.CreatedAt,
		})
	}
	return c.JSON(http.StatusOK, result)
}

// POST /api/v1/cron/schedules
func (h *CronHandler) CreateUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
		TaskPrompt string    `json:"task_prompt"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.Message) > 1000 {
		req.Message = req.Message[:1000]
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "deliver_to must be 'telegram' or empty"})
	}
	if req.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(req.Schedule.Timezone); err != nil {
			req.Schedule.Timezone = "UTC"
		}
	}
	if req.Type == "" {
		req.Type = "recurring"
	}
	if req.ReportType == "" {
		req.ReportType = "custom_reminder"
	}

	schedID := uuid.New().String()
	key := "schedule:" + schedID
	data := scheduleData{
		Title:      req.Title,
		Type:       req.Type,
		ReportType: req.ReportType,
		Schedule:   req.Schedule,
		Status:     "active",
		Message:    req.Message,
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}

	value, _ := json.Marshal(data)
	var rowID int64
	if err := h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		userID, key, string(value),
	).Scan(&rowID); err != nil {
		h.logger.Error("cron: create schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, scheduleResponse{
		ID: schedID, KBRowID: rowID,
		Title: data.Title, Type: data.Type, ReportType: data.ReportType,
		Schedule: data.Schedule, Status: data.Status, Message: data.Message,
		TaskPrompt: data.TaskPrompt, DeliverTo: data.DeliverTo,
		CreatedAt: data.CreatedAt,
	})
}

// POST /api/v1/internal/cron-schedule
// Internal endpoint — called by the agent (no JWT; protected by X-Internal-Secret).
func (h *CronHandler) InternalCreateSchedule(c echo.Context) error {
	var req struct {
		UserID     string    `json:"user_id"`
		Title      string    `json:"title"`
		TaskPrompt string    `json:"task_prompt"`
		Schedule   schedTime `json:"schedule"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id and title are required"})
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		req.DeliverTo = ""
	}

	schedID := uuid.New().String()
	key := "schedule:" + schedID
	data := scheduleData{
		Title:      req.Title,
		Type:       "recurring",
		ReportType: "custom_reminder",
		Schedule:   req.Schedule,
		Status:     "active",
		TaskPrompt: req.TaskPrompt,
		DeliverTo:  req.DeliverTo,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}

	value, _ := json.Marshal(data)
	var rowID int64
	if err := h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		req.UserID, key, string(value),
	).Scan(&rowID); err != nil {
		h.logger.Error("cron: internal create schedule failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	h.wake()
	return c.JSON(http.StatusCreated, map[string]any{
		"id": schedID, "kb_row_id": rowID,
		"title": data.Title, "created_at": data.CreatedAt,
	})
}

// PUT /api/v1/cron/schedules/:id
func (h *CronHandler) UpdateUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
		Status     string    `json:"status"`
		TaskPrompt string    `json:"task_prompt"`
		DeliverTo  string    `json:"deliver_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if len(req.TaskPrompt) > 2000 {
		req.TaskPrompt = req.TaskPrompt[:2000]
	}
	if req.DeliverTo != "" && req.DeliverTo != "telegram" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "deliver_to must be 'telegram' or empty"})
	}
	if req.Schedule.Timezone != "" {
		if _, err := time.LoadLocation(req.Schedule.Timezone); err != nil {
			req.Schedule.Timezone = "UTC"
		}
	}
	if req.Status != "" && req.Status != "active" && req.Status != "paused" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "status must be 'active' or 'paused'"})
	}

	ctx := c.Request().Context()
	key := "schedule:" + schedID

	var rawValue string
	if err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue); err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var existing scheduleData
	_ = json.Unmarshal([]byte(rawValue), &existing)

	if req.Title != "" {
		existing.Title = req.Title
	}
	if req.Type != "" {
		existing.Type = req.Type
	}
	if req.ReportType != "" {
		existing.ReportType = req.ReportType
	}
	if req.Status != "" {
		existing.Status = req.Status
	}
	existing.Message = req.Message
	existing.Schedule = req.Schedule
	existing.TaskPrompt = req.TaskPrompt
	existing.DeliverTo = req.DeliverTo

	newValue, _ := json.Marshal(existing)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, map[string]any{"id": schedID, "status": existing.Status})
}

// DELETE /api/v1/cron/schedules/:id
func (h *CronHandler) DeleteUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	key := "schedule:" + schedID
	res, err := h.db.ExecContext(c.Request().Context(),
		`DELETE FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
	}
	h.wake()
	return c.JSON(http.StatusOK, map[string]string{"id": schedID})
}

// POST /api/v1/cron/schedules/:id/toggle
func (h *CronHandler) ToggleUserSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	schedID := c.Param("id")
	if _, err := uuid.Parse(schedID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid schedule id"})
	}
	key := "schedule:" + schedID
	ctx := c.Request().Context()

	var rawValue string
	if err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue); err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var data scheduleData
	if err := json.Unmarshal([]byte(rawValue), &data); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "parse failed"})
	}

	if data.Status == "active" {
		data.Status = "paused"
	} else {
		data.Status = "active"
	}

	newValue, _ := json.Marshal(data)
	if _, err := h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "toggle failed"})
	}

	h.wake()
	return c.JSON(http.StatusOK, map[string]string{"id": schedID, "status": data.Status})
}
