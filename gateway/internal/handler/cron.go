package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

// CronHandler provides REST endpoints for cron job and user schedule management.
type CronHandler struct {
	db *sql.DB
}

// NewCronHandler creates a new CronHandler.
func NewCronHandler(db *sql.DB) *CronHandler {
	return &CronHandler{db: db}
}

// ── System Jobs ────────────────────────────────────────────────────────────────

type systemJobResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Schedule    string `json:"schedule"`
	Level       string `json:"level"`
	Enabled     bool   `json:"enabled"`
}

var systemJobs = []systemJobResponse{
	// Level 1: Rule-Based
	{ID: "weekly_report", Name: "주간 리포트", Description: "활성 사용자에게 주간 재정 리포트를 전송합니다", Schedule: "0 9 * * 1", Level: "rule", Enabled: true},
	{ID: "budget_warning", Name: "예산 경고", Description: "예산 초과 임박 시 경고 알림을 전송합니다", Schedule: "0 * * * *", Level: "rule", Enabled: true},
	{ID: "daily_summary", Name: "일간 요약", Description: "매일 저녁 일일 지출 요약을 전송합니다", Schedule: "0 21 * * *", Level: "rule", Enabled: true},
	{ID: "inactive_reminder", Name: "비활성 리마인더", Description: "장기간 미활동 사용자에게 리마인더를 전송합니다", Schedule: "0 20 * * *", Level: "rule", Enabled: true},
	{ID: "monthly_closing", Name: "월말 정산", Description: "월말 지출 정산 및 요약을 전송합니다", Schedule: "0 21 28-31 * *", Level: "rule", Enabled: true},
	// Level 2: Pattern-Learning
	{ID: "pattern_analysis", Name: "패턴 분석", Description: "사용자 소비 패턴을 분석합니다", Schedule: "0 6 * * *", Level: "pattern", Enabled: true},
	{ID: "spending_anomaly", Name: "이상 소비 감지", Description: "비정상적인 소비 패턴을 감지합니다", Schedule: "0 */3 * * *", Level: "pattern", Enabled: true},
	{ID: "pattern_insight", Name: "패턴 인사이트", Description: "패턴 기반 인사이트를 전송합니다", Schedule: "0 14 * * *", Level: "pattern", Enabled: true},
	{ID: "conversation_analysis", Name: "대화 분석", Description: "대화 비활성 감지 및 분석을 수행합니다", Schedule: "*/10 * * * *", Level: "pattern", Enabled: true},
	// Level 3: Autonomous
	{ID: "goal_evaluation", Name: "목표 평가", Description: "사용자 목표 달성 여부를 평가합니다", Schedule: "0 7 * * *", Level: "autonomous", Enabled: true},
	{ID: "goal_status", Name: "목표 현황", Description: "매주 수요일 목표 현황 보고서를 전송합니다", Schedule: "0 12 * * 3", Level: "autonomous", Enabled: true},
	{ID: "dday_notification", Name: "디데이 알림", Description: "D-30/7/3/1/0 임박 시 디데이 알림을 전송합니다", Schedule: "0 8 * * *", Level: "autonomous", Enabled: true},
	// Level 4: User Schedules (runner)
	{ID: "user_schedules", Name: "사용자 일정 실행기", Description: "15분마다 사용자 생성 일정을 확인하고 실행합니다", Schedule: "*/15 * * * *", Level: "runner", Enabled: true},
	// Level 5: Maintenance
	{ID: "memory_compaction", Name: "메모리 압축", Description: "시스템 메모리 최적화 작업을 수행합니다", Schedule: "0 5 * * 1", Level: "maintenance", Enabled: true},
}

// ListSystemJobs returns all hardcoded system cron jobs.
// GET /api/v1/cron/system
func (h *CronHandler) ListSystemJobs(c echo.Context) error {
	return c.JSON(http.StatusOK, systemJobs)
}

// ── User Schedules ─────────────────────────────────────────────────────────────

type schedTime struct {
	Hour      int    `json:"hour"`
	Minute    int    `json:"minute"`
	DayOfWeek string `json:"day_of_week,omitempty"`
	Date      string `json:"date,omitempty"`
}

type scheduleJSON struct {
	Title      string    `json:"title"`
	Type       string    `json:"type"`        // one_time | recurring
	ReportType string    `json:"report_type"` // custom_reminder | daily | weekly | monthly | ...
	Schedule   schedTime `json:"schedule"`
	Status     string    `json:"status"` // active | completed
	Message    string    `json:"message"`
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
	LastSent   string    `json:"last_sent"`
	CreatedAt  string    `json:"created_at"`
}

// ListUserSchedules returns all user-created schedules.
// GET /api/v1/cron/schedules
func (h *CronHandler) ListUserSchedules(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, key, value
		FROM knowledge_base
		WHERE user_id = $1 AND key LIKE 'schedule:%'
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("cron: list schedules failed")
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
		var data scheduleJSON
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
			LastSent:   data.LastSent,
			CreatedAt:  data.CreatedAt,
		})
	}

	return c.JSON(http.StatusOK, result)
}

// CreateUserSchedule inserts a new schedule into knowledge_base.
// POST /api/v1/cron/schedules
func (h *CronHandler) CreateUserSchedule(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}
	if req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title required"})
	}
	if req.Type == "" {
		req.Type = "recurring"
	}
	if req.ReportType == "" {
		req.ReportType = "custom_reminder"
	}

	schedID := uuid.New().String()
	key := "schedule:" + schedID
	data := scheduleJSON{
		Title:      req.Title,
		Type:       req.Type,
		ReportType: req.ReportType,
		Schedule:   req.Schedule,
		Status:     "active",
		Message:    req.Message,
		CreatedAt:  time.Now().Format(time.RFC3339),
	}

	value, err := json.Marshal(data)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "marshal failed"})
	}

	ctx := c.Request().Context()
	var rowID int64
	err = h.db.QueryRowContext(ctx,
		`INSERT INTO knowledge_base (user_id, key, value) VALUES ($1, $2, $3) RETURNING id`,
		userID, key, string(value),
	).Scan(&rowID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("cron: create schedule failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	return c.JSON(http.StatusOK, scheduleResponse{
		ID:         schedID,
		KBRowID:    rowID,
		Title:      data.Title,
		Type:       data.Type,
		ReportType: data.ReportType,
		Schedule:   data.Schedule,
		Status:     data.Status,
		Message:    data.Message,
		CreatedAt:  data.CreatedAt,
	})
}

// UpdateUserSchedule replaces a schedule's data.
// PUT /api/v1/cron/schedules/:id
func (h *CronHandler) UpdateUserSchedule(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	schedID := c.Param("id")
	if schedID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "id required"})
	}

	var req struct {
		Title      string    `json:"title"`
		Type       string    `json:"type"`
		ReportType string    `json:"report_type"`
		Schedule   schedTime `json:"schedule"`
		Message    string    `json:"message"`
		Status     string    `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
	}

	ctx := c.Request().Context()
	key := "schedule:" + schedID

	// Load current value to preserve CreatedAt and LastSent.
	var rawValue string
	err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var existing scheduleJSON
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

	newValue, err := json.Marshal(existing)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "marshal failed"})
	}

	_, err = h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	)
	if err != nil {
		log.Error().Err(err).Msg("cron: update schedule failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	return c.JSON(http.StatusOK, map[string]any{"id": schedID, "status": existing.Status})
}

// DeleteUserSchedule removes a schedule from knowledge_base.
// DELETE /api/v1/cron/schedules/:id
func (h *CronHandler) DeleteUserSchedule(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	schedID := c.Param("id")
	if schedID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "id required"})
	}

	ctx := c.Request().Context()
	key := "schedule:" + schedID
	res, err := h.db.ExecContext(ctx,
		`DELETE FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	)
	if err != nil {
		log.Error().Err(err).Msg("cron: delete schedule failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}

	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
	}

	return c.JSON(http.StatusOK, map[string]string{"id": schedID})
}

// ToggleUserSchedule flips a schedule between active and completed.
// POST /api/v1/cron/schedules/:id/toggle
func (h *CronHandler) ToggleUserSchedule(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	schedID := c.Param("id")
	if schedID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "id required"})
	}

	ctx := c.Request().Context()
	key := "schedule:" + schedID

	var rawValue string
	err := h.db.QueryRowContext(ctx,
		`SELECT value FROM knowledge_base WHERE user_id = $1 AND key = $2`,
		userID, key,
	).Scan(&rawValue)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "fetch failed"})
	}

	var data scheduleJSON
	if err := json.Unmarshal([]byte(rawValue), &data); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "parse failed"})
	}

	if data.Status == "active" {
		data.Status = "paused"
	} else {
		data.Status = "active"
	}

	newValue, err := json.Marshal(data)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "marshal failed"})
	}

	_, err = h.db.ExecContext(ctx,
		`UPDATE knowledge_base SET value = $1 WHERE user_id = $2 AND key = $3`,
		string(newValue), userID, key,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("toggle failed: %v", err)})
	}

	return c.JSON(http.StatusOK, map[string]string{"id": schedID, "status": data.Status})
}
