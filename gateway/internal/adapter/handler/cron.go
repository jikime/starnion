package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type CronHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewCronHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *CronHandler {
	return &CronHandler{db: db, config: cfg, logger: logger}
}

// ── System Jobs ────────────────────────────────────────────────────────────────

type systemJobResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Schedule    string `json:"schedule"`
	Level       string `json:"level"`
	Enabled     bool   `json:"enabled"`
	CanDisable  bool   `json:"can_disable"`
}

var builtinSystemJobs = []systemJobResponse{
	// Level 1: Rule-Based
	{ID: "weekly_report", Name: "주간 리포트", Description: "매주 월요일 주간 활동 리포트를 전송합니다", Schedule: "0 9 * * 1", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "budget_warning", Name: "예산 경고", Description: "예산 초과 임박 시 경고 알림을 전송합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "daily_summary", Name: "일간 요약", Description: "매일 저녁 일일 지출 요약을 전송합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "inactive_reminder", Name: "비활성 리마인더", Description: "장기간 미활동 사용자에게 리마인더를 전송합니다", Schedule: "0 20 * * *", Level: "rule", Enabled: true, CanDisable: true},
	{ID: "monthly_closing", Name: "월말 정산", Description: "매월 1일 전월 재정 지출 정산 및 요약을 전송합니다", Schedule: "0 21 1 * *", Level: "rule", Enabled: true, CanDisable: true},
	// Level 2: Pattern-Learning
	{ID: "pattern_analysis", Name: "패턴 분석", Description: "사용자 소비 패턴을 분석합니다", Schedule: "0 6 * * *", Level: "pattern", Enabled: true},
	{ID: "spending_anomaly", Name: "이상 소비 감지", Description: "비정상적인 소비 패턴을 감지합니다", Schedule: "0 */3 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "pattern_insight", Name: "패턴 인사이트", Description: "패턴 기반 인사이트를 전송합니다", Schedule: "0 14 * * *", Level: "pattern", Enabled: true, CanDisable: true},
	{ID: "conversation_analysis", Name: "대화 분석", Description: "대화 비활성 감지 및 분석을 수행합니다", Schedule: "*/10 * * * *", Level: "pattern", Enabled: true},
	// Level 3: Autonomous
	{ID: "goal_evaluation", Name: "목표 평가", Description: "사용자 목표 달성 여부를 평가합니다", Schedule: "0 7 * * *", Level: "autonomous", Enabled: true},
	{ID: "goal_status", Name: "목표 현황", Description: "매주 수요일 목표 현황 보고서를 전송합니다", Schedule: "0 12 * * 3", Level: "autonomous", Enabled: true, CanDisable: true},
	{ID: "dday_notification", Name: "디데이 알림", Description: "D-30/7/3/1/0 임박 시 디데이 알림을 전송합니다", Schedule: "0 8 * * *", Level: "autonomous", Enabled: true, CanDisable: true},
	// Level 4: Runner
	{ID: "user_schedules", Name: "사용자 일정 실행기", Description: "15분마다 사용자 생성 일정을 확인하고 실행합니다", Schedule: "*/15 * * * *", Level: "runner", Enabled: true},
	// Level 5: Maintenance
	{ID: "memory_compaction", Name: "메모리 압축", Description: "시스템 메모리 최적화 작업을 수행합니다", Schedule: "0 5 * * 1", Level: "maintenance", Enabled: true},
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

	return c.JSON(http.StatusOK, map[string]string{"id": schedID, "status": data.Status})
}
