package handler

// stub.go contains lightweight stub handlers for features not yet fully implemented.
// They return empty/valid responses so the UI doesn't error out when visiting those pages.

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
	"go.yaml.in/yaml/v3"
)

// ── StubHandler ───────────────────────────────────────────────────────────────

type StubHandler struct {
	db         *database.DB
	config     *config.Config
	logger     *zap.Logger
	botManager *tginfra.BotManager
}

func NewStubHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *StubHandler {
	return &StubHandler{db: db, config: cfg, logger: logger}
}

// SetBotManager sets the BotManager so UpdateChannelsTelegram can start pollers dynamically.
func (h *StubHandler) SetBotManager(bm *tginfra.BotManager) {
	h.botManager = bm
}

// empty returns a 200 with an empty result array or object.
func (h *StubHandler) empty(key string) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{key: []any{}})
	}
}

func (h *StubHandler) notImplemented(c echo.Context) error {
	return c.JSON(http.StatusNotImplemented, map[string]string{"error": "not yet implemented"})
}

// ── Budget ────────────────────────────────────────────────────────────────────
// Budget reuses the finance summary but also adds category limits stored in user preferences.

// GET /api/v1/budget — returns spending per category merged with user-defined limits
func (h *StubHandler) GetBudget(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	// Spending per category for current month
	spendMap := map[string]int64{}
	rows, err := h.db.QueryContext(ctx,
		`SELECT category, SUM(amount) AS total FROM finances
		 WHERE user_id = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
		 GROUP BY category ORDER BY total DESC`,
		userID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var total int64
			if rows.Scan(&cat, &total) == nil {
				spendMap[cat] = total
			}
		}
	}

	// User-defined budget limits
	type budgetLimit struct{ id int64; limit int64 }
	limits := map[string]budgetLimit{}
	bRows, err := h.db.QueryContext(ctx,
		`SELECT id, category, amount FROM budgets WHERE user_id = $1 AND period = 'monthly'`,
		userID,
	)
	if err == nil {
		defer bRows.Close()
		for bRows.Next() {
			var id, amount int64
			var cat string
			if bRows.Scan(&id, &cat, &amount) == nil {
				limits[cat] = budgetLimit{id: id, limit: amount}
			}
		}
	}

	// Merge: all categories with either spending or a limit
	seen := map[string]bool{}
	var budget []map[string]any
	for cat, spent := range spendMap {
		seen[cat] = true
		entry := map[string]any{"category": cat, "spent": spent}
		if bl, ok := limits[cat]; ok {
			entry["id"] = bl.id
			entry["limit"] = bl.limit
		}
		budget = append(budget, entry)
	}
	for cat, bl := range limits {
		if !seen[cat] {
			budget = append(budget, map[string]any{
				"id": bl.id, "category": cat, "spent": int64(0), "limit": bl.limit,
			})
		}
	}
	if budget == nil {
		budget = []map[string]any{}
	}

	return c.JSON(http.StatusOK, map[string]any{"budget": budget})
}

// POST /api/v1/budget  {"category":"식비","amount":300000,"period":"monthly"}
func (h *StubHandler) CreateBudget(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Category string `json:"category"`
		Amount   int64  `json:"amount"`
		Period   string `json:"period"`
	}
	if err := c.Bind(&req); err != nil || req.Category == "" || req.Amount <= 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "category and amount are required"})
	}
	if req.Period == "" {
		req.Period = "monthly"
	}
	validPeriods := map[string]bool{"monthly": true, "weekly": true, "yearly": true}
	if !validPeriods[req.Period] {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "period must be 'monthly', 'weekly', or 'yearly'"})
	}

	var id int64
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO budgets (user_id, category, amount, period)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, category, period) DO UPDATE
		   SET amount = EXCLUDED.amount, updated_at = NOW()
		 RETURNING id`,
		userID, req.Category, req.Amount, req.Period,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save budget"})
	}
	return c.JSON(http.StatusCreated, map[string]any{
		"id": id, "category": req.Category, "amount": req.Amount, "period": req.Period,
	})
}

// ── Goals Checkin ─────────────────────────────────────────────────────────────

// GET /api/v1/goals/:id/checkin — list check-in dates for a goal
func (h *StubHandler) GetGoalCheckins(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	ctx := c.Request().Context()

	rows, err := h.db.QueryContext(ctx,
		`SELECT id, check_date, created_at FROM goal_checkins
		 WHERE goal_id = $1 AND user_id = $2
		 ORDER BY check_date DESC`,
		goalID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch checkins"})
	}
	defer rows.Close()

	var checkins []map[string]any
	for rows.Next() {
		var id int64
		var checkDate, createdAt string
		if rows.Scan(&id, &checkDate, &createdAt) == nil {
			checkins = append(checkins, map[string]any{
				"id": id, "goal_id": goalID, "check_date": checkDate, "created_at": createdAt,
			})
		}
	}
	if checkins == nil {
		checkins = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"checkins": checkins})
}

// POST /api/v1/goals/:id/checkin — record today's check-in and update progress
func (h *StubHandler) CreateGoalCheckin(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	goalID := c.Param("id")
	var req struct {
		Progress  *float64 `json:"progress"`
		CheckDate string   `json:"check_date"`
	}
	c.Bind(&req)

	checkDate := time.Now().Format("2006-01-02")
	if req.CheckDate != "" {
		checkDate = req.CheckDate
	}

	ctx := c.Request().Context()

	// Upsert: same goal + same date = idempotent
	var id int64
	err = h.db.QueryRowContext(ctx,
		`INSERT INTO goal_checkins (goal_id, user_id, check_date)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (goal_id, check_date) DO UPDATE SET check_date = EXCLUDED.check_date
		 RETURNING id`,
		goalID, userID, checkDate,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save checkin"})
	}

	// Optionally update goal progress
	if req.Progress != nil {
		h.db.ExecContext(ctx,
			`UPDATE goals SET progress = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
			*req.Progress, goalID, userID,
		)
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id": id, "goal_id": goalID, "check_date": checkDate,
	})
}

// ── Cron Schedules ────────────────────────────────────────────────────────────

// GET /api/v1/cron/schedules
func (h *StubHandler) ListCronSchedules(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(),
		`SELECT id, name, description, cron_expr, action_type, action_data,
		        enabled, last_run_at, next_run_at, created_at
		 FROM cron_schedules WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch schedules"})
	}
	defer rows.Close()

	var schedules []map[string]any
	for rows.Next() {
		var id, name, desc, cronExpr, actionType string
		var actionData []byte
		var enabled bool
		var lastRunAt, nextRunAt, createdAt *string
		if rows.Scan(&id, &name, &desc, &cronExpr, &actionType, &actionData,
			&enabled, &lastRunAt, &nextRunAt, &createdAt) == nil {
			schedules = append(schedules, map[string]any{
				"id": id, "name": name, "description": desc,
				"cron_expr": cronExpr, "action_type": actionType,
				"action_data": string(actionData), "enabled": enabled,
				"last_run_at": lastRunAt, "next_run_at": nextRunAt, "created_at": createdAt,
			})
		}
	}
	if schedules == nil {
		schedules = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{"schedules": schedules})
}

// POST /api/v1/cron/schedules
func (h *StubHandler) CreateCronSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CronExpr    string `json:"cron_expr"`
		ActionType  string `json:"action_type"`
		ActionData  any    `json:"action_data"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.CronExpr == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "name and cron_expr are required"})
	}
	if len(req.Name) > 200 {
		req.Name = req.Name[:200]
	}
	if len(req.Description) > 1000 {
		req.Description = req.Description[:1000]
	}
	if len(req.CronExpr) > 100 {
		req.CronExpr = req.CronExpr[:100]
	}
	if req.ActionType == "" {
		req.ActionType = "notify"
	}
	if len(req.ActionType) > 50 {
		req.ActionType = req.ActionType[:50]
	}

	var id string
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO cron_schedules (user_id, name, description, cron_expr, action_type, action_data)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
		userID, req.Name, req.Description, req.CronExpr, req.ActionType,
		fmt.Sprintf("%v", "{}"),
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create schedule"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id, "name": req.Name, "cron_expr": req.CronExpr})
}

// GET /api/v1/cron/schedules/:id
func (h *StubHandler) GetCronSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var id, name, desc, cronExpr, actionType string
	var enabled bool
	var createdAt string
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, name, description, cron_expr, action_type, enabled, created_at
		 FROM cron_schedules WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	).Scan(&id, &name, &desc, &cronExpr, &actionType, &enabled, &createdAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "schedule not found"})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"id": id, "name": name, "description": desc,
		"cron_expr": cronExpr, "action_type": actionType,
		"enabled": enabled, "created_at": createdAt,
	})
}

// PUT /api/v1/cron/schedules/:id
func (h *StubHandler) UpdateCronSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CronExpr    string `json:"cron_expr"`
		ActionType  string `json:"action_type"`
	}
	c.Bind(&req)

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE cron_schedules SET
		   name        = CASE WHEN $1 <> '' THEN $1 ELSE name END,
		   description = CASE WHEN $2 <> '' THEN $2 ELSE description END,
		   cron_expr   = CASE WHEN $3 <> '' THEN $3 ELSE cron_expr END,
		   action_type = CASE WHEN $4 <> '' THEN $4 ELSE action_type END,
		   updated_at  = NOW()
		 WHERE id = $5 AND user_id = $6`,
		req.Name, req.Description, req.CronExpr, req.ActionType,
		c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update schedule"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// DELETE /api/v1/cron/schedules/:id
func (h *StubHandler) DeleteCronSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM cron_schedules WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete schedule"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/v1/cron/schedules/:id/toggle
func (h *StubHandler) ToggleCronSchedule(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	c.Bind(&req)

	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE cron_schedules SET enabled = $1, updated_at = NOW()
		 WHERE id = $2 AND user_id = $3`,
		req.Enabled, c.Param("id"), userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to toggle schedule"})
	}
	return c.JSON(http.StatusOK, map[string]any{"enabled": req.Enabled})
}

// GET /api/v1/cron/system — built-in system cron jobs (static list)
func (h *StubHandler) ListSystemCron(c echo.Context) error {
	systemCrons := []map[string]any{
		{"id": "daily-report", "name": "일일 리포트", "cron_expr": "0 21 * * *", "enabled": true, "description": "매일 오후 9시 자동 요약 생성"},
		{"id": "weekly-summary", "name": "주간 요약", "cron_expr": "0 9 * * 1", "enabled": true, "description": "매주 월요일 오전 9시 주간 요약"},
		{"id": "goal-reminder", "name": "목표 체크인 알림", "cron_expr": "0 20 * * *", "enabled": true, "description": "매일 오후 8시 목표 체크인 알림"},
		{"id": "finance-alert", "name": "지출 알림", "cron_expr": "0 23 * * *", "enabled": false, "description": "매일 오후 11시 당일 지출 현황"},
	}
	return c.JSON(http.StatusOK, map[string]any{"crons": systemCrons})
}

// POST /api/v1/cron/system/:id/toggle
func (h *StubHandler) ToggleSystemCron(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}
	jobID := c.Param("id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	c.Bind(&req)

	// Persist per-user override in users.preferences JSONB under key "system_cron".
	_, dbErr := h.db.ExecContext(c.Request().Context(),
		`UPDATE users
		 SET preferences = jsonb_set(
		     COALESCE(preferences, '{}')::jsonb,
		     ARRAY['system_cron', $2],
		     to_jsonb($3::bool)
		 )
		 WHERE id = $1`,
		userID, jobID, req.Enabled,
	)
	if dbErr != nil {
		h.logger.Warn("failed to persist system cron toggle", zap.Error(dbErr))
	}
	return c.JSON(http.StatusOK, map[string]any{"id": jobID, "enabled": req.Enabled})
}

// ── Channels / Telegram ───────────────────────────────────────────────────────

func (h *StubHandler) ListChannels(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{"channels": []any{}})
}

// GET /api/v1/channels/telegram — return the user's Telegram channel settings
func (h *StubHandler) GetChannelsTelegram(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()
	var botToken string
	var enabled bool
	var dmPolicy, groupPolicy string
	scanErr := h.db.QueryRowContext(ctx,
		`SELECT bot_token, enabled, dm_policy, group_policy
		 FROM channel_settings WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	).Scan(&botToken, &enabled, &dmPolicy, &groupPolicy)

	if scanErr != nil {
		// No row yet — return defaults
		return c.JSON(http.StatusOK, map[string]any{
			"channel": "telegram", "enabled": false,
			"dm_policy": "allow", "group_policy": "allow",
		})
	}

	// Decrypt before masking
	if plain, err := crypto.Decrypt(botToken, h.config.EncryptionKey); err == nil && plain != "" {
		botToken = plain
	}
	maskedToken := ""
	if len(botToken) > 6 {
		maskedToken = botToken[:6] + "***"
	}
	return c.JSON(http.StatusOK, map[string]any{
		"channel": "telegram", "enabled": enabled,
		"bot_token": maskedToken, "dm_policy": dmPolicy, "group_policy": groupPolicy,
	})
}

// PUT /api/v1/channels/telegram — upsert Telegram channel settings
func (h *StubHandler) UpdateChannelsTelegram(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Enabled     *bool  `json:"enabled"`
		BotToken    string `json:"bot_token"`
		DMPolicy    string `json:"dm_policy"`
		GroupPolicy string `json:"group_policy"`
	}
	c.Bind(&req)

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.DMPolicy == "" {
		req.DMPolicy = "allow"
	}
	if req.GroupPolicy == "" {
		req.GroupPolicy = "allow"
	}

	ctx := c.Request().Context()

	if req.BotToken != "" {
		encBotToken, encErr := crypto.Encrypt(req.BotToken, h.config.EncryptionKey)
		if encErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save channel settings"})
		}

		_, err = h.db.ExecContext(ctx,
			`INSERT INTO channel_settings (user_id, channel, bot_token, enabled, dm_policy, group_policy)
			 VALUES ($1, 'telegram', $2, $3, $4, $5)
			 ON CONFLICT (user_id, channel) DO UPDATE
			   SET bot_token = EXCLUDED.bot_token, enabled = EXCLUDED.enabled,
			       dm_policy = EXCLUDED.dm_policy, group_policy = EXCLUDED.group_policy,
			       updated_at = NOW()`,
			userID, encBotToken, enabled, req.DMPolicy, req.GroupPolicy,
		)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update channel settings"})
		}

		// ── Register webhook if TELEGRAM_WEBHOOK_URL is configured ──
		if wh := h.config.TelegramWebhookURL; wh != "" {
			tgClient := tginfra.NewClient(req.BotToken)
			webhookURL := strings.TrimRight(wh, "/") + "/webhook/" + req.BotToken
			if whErr := tgClient.SetWebhook(webhookURL); whErr != nil {
				h.logger.Warn("telegram SetWebhook failed (non-fatal)", zap.String("url", webhookURL), zap.Error(whErr))
			} else {
				h.logger.Info("telegram webhook registered", zap.String("url", webhookURL))
			}
		}

		// ── Start dynamic poller for this token ──────────────────────────────
		if h.botManager != nil {
			h.botManager.EnsurePoller(req.BotToken)
		}

		// ── Fetch bot username and store in channel_settings ─────────────────
		if username, err2 := tginfra.NewClient(req.BotToken).GetMe(); err2 == nil {
			h.db.ExecContext(ctx,
				`UPDATE channel_settings SET bot_username = $1 WHERE user_id = $2 AND channel = 'telegram'`,
				username, userID,
			)
		}
	} else {
		_, err = h.db.ExecContext(ctx,
			`INSERT INTO channel_settings (user_id, channel, enabled, dm_policy, group_policy)
			 VALUES ($1, 'telegram', $2, $3, $4)
			 ON CONFLICT (user_id, channel) DO UPDATE
			   SET enabled = EXCLUDED.enabled,
			       dm_policy = EXCLUDED.dm_policy, group_policy = EXCLUDED.group_policy,
			       updated_at = NOW()`,
			userID, enabled, req.DMPolicy, req.GroupPolicy,
		)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update channel settings"})
		}
	}

	webhookMode := h.config.TelegramWebhookURL != ""
	return c.JSON(http.StatusOK, map[string]any{
		"status":       "updated",
		"webhook_mode": webhookMode,
	})
}

// ── Telegram Pairing ──────────────────────────────────────────────────────────

// GET /api/v1/channels/telegram/pairing — list pending + approved pairings
func (h *StubHandler) ListPairings(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	ctx := c.Request().Context()

	// Pending requests
	pRows, _ := h.db.QueryContext(ctx,
		`SELECT id, telegram_id, display_name, status, requested_at
		 FROM telegram_pairing_requests
		 WHERE owner_user_id = $1 ORDER BY requested_at DESC`,
		userID,
	)
	var pairings []map[string]any
	if pRows != nil {
		defer pRows.Close()
		for pRows.Next() {
			var id, telegramID, displayName, status, requestedAt string
			if pRows.Scan(&id, &telegramID, &displayName, &status, &requestedAt) == nil {
				pairings = append(pairings, map[string]any{
					"id": id, "telegram_id": telegramID, "display_name": displayName,
					"status": status, "requested_at": requestedAt,
				})
			}
		}
	}
	if pairings == nil {
		pairings = []map[string]any{}
	}

	// Approved contacts
	aRows, _ := h.db.QueryContext(ctx,
		`SELECT id, telegram_id, display_name, approved_at
		 FROM telegram_approved_contacts
		 WHERE owner_user_id = $1 ORDER BY approved_at DESC`,
		userID,
	)
	var approved []map[string]any
	if aRows != nil {
		defer aRows.Close()
		for aRows.Next() {
			var id, telegramID, displayName, approvedAt string
			if aRows.Scan(&id, &telegramID, &displayName, &approvedAt) == nil {
				approved = append(approved, map[string]any{
					"id": id, "telegram_id": telegramID, "display_name": displayName,
					"approved_at": approvedAt,
				})
			}
		}
	}
	if approved == nil {
		approved = []map[string]any{}
	}

	return c.JSON(http.StatusOK, map[string]any{"pairings": pairings, "approved": approved})
}

// POST /api/v1/channels/telegram/pairing — manually create a pairing request (admin/bot use)
func (h *StubHandler) CreatePairing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		TelegramID  string `json:"telegram_id"`
		DisplayName string `json:"display_name"`
		MessageText string `json:"message_text"`
	}
	if err := c.Bind(&req); err != nil || req.TelegramID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_id is required"})
	}

	var id string
	err = h.db.QueryRowContext(c.Request().Context(),
		`INSERT INTO telegram_pairing_requests (owner_user_id, telegram_id, display_name, message_text)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (owner_user_id, telegram_id) DO UPDATE
		   SET display_name = EXCLUDED.display_name, status = 'pending'
		 RETURNING id`,
		userID, req.TelegramID, req.DisplayName, req.MessageText,
	).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create pairing request"})
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": id, "status": "pending"})
}

// POST /api/v1/channels/telegram/pairing/:id/approve
func (h *StubHandler) ApprovePairing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	pairingID := c.Param("id")
	ctx := c.Request().Context()

	// Fetch the request
	var telegramID, displayName string
	err = h.db.QueryRowContext(ctx,
		`UPDATE telegram_pairing_requests
		 SET status = 'approved', resolved_at = NOW()
		 WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'
		 RETURNING telegram_id, display_name`,
		pairingID, userID,
	).Scan(&telegramID, &displayName)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "pairing request not found or already resolved"})
	}

	// Add to approved contacts
	h.db.ExecContext(ctx,
		`INSERT INTO telegram_approved_contacts (owner_user_id, telegram_id, display_name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (owner_user_id, telegram_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
		userID, telegramID, displayName,
	)

	// Add to platform_identities
	h.db.ExecContext(ctx,
		`INSERT INTO platform_identities (user_id, platform, platform_id, display_name)
		 VALUES ($1, 'telegram', $2, $3)
		 ON CONFLICT (platform, platform_id) DO UPDATE
		   SET display_name = EXCLUDED.display_name, last_active_at = NOW()`,
		userID, telegramID, displayName,
	)

	return c.JSON(http.StatusOK, map[string]any{
		"status": "approved", "telegram_id": telegramID, "display_name": displayName,
	})
}

// POST /api/v1/channels/telegram/pairing/:id/deny
func (h *StubHandler) DenyPairing(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	pairingID := c.Param("id")
	_, err = h.db.ExecContext(c.Request().Context(),
		`UPDATE telegram_pairing_requests
		 SET status = 'denied', resolved_at = NOW()
		 WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'`,
		pairingID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to deny pairing"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "denied"})
}

// ── Logs ──────────────────────────────────────────────────────────────────────

// GET /api/v1/logs?page=1&limit=20&type=chat
// Queries usage_logs for token/cost history.
func (h *StubHandler) GetLogs(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit
	ctx := c.Request().Context()

	callType := c.QueryParam("type")
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close() error
	}
	if callType != "" {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, model, provider, input_tokens, output_tokens, cached_tokens,
			        cost_usd, status, call_type, created_at
			 FROM usage_logs WHERE user_id = $1 AND call_type = $2
			 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
			userID, callType, limit, offset,
		)
	} else {
		rows, err = h.db.QueryContext(ctx,
			`SELECT id, model, provider, input_tokens, output_tokens, cached_tokens,
			        cost_usd, status, call_type, created_at
			 FROM usage_logs WHERE user_id = $1
			 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			userID, limit, offset,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch logs"})
	}
	defer rows.Close()

	var logs []map[string]any
	for rows.Next() {
		var id int64
		var model, provider, status, callTypeVal string
		var inputTok, outputTok, cachedTok int
		var costUSD float64
		var createdAt string
		if rows.Scan(&id, &model, &provider, &inputTok, &outputTok, &cachedTok,
			&costUSD, &status, &callTypeVal, &createdAt) == nil {
			logs = append(logs, map[string]any{
				"id": id, "model": model, "provider": provider,
				"input_tokens": inputTok, "output_tokens": outputTok, "cached_tokens": cachedTok,
				"cost_usd": costUSD, "status": status, "call_type": callTypeVal,
				"created_at": createdAt,
			})
		}
	}
	if logs == nil {
		logs = []map[string]any{}
	}

	var total int
	h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM usage_logs WHERE user_id = $1`, userID).Scan(&total)

	return c.JSON(http.StatusOK, map[string]any{"logs": logs, "total": total, "page": page, "limit": limit})
}

// GET /api/v1/logs/agent — agent (chat) call logs
func (h *StubHandler) GetAgentLogs(c echo.Context) error {
	// Reuse GetLogs with call_type filter via query param injection
	c.QueryParams().Set("type", "chat")
	return h.GetLogs(c)
}

// GET /api/v1/logs/stream — SSE stream of usage_logs entries.
// Sends a snapshot of the last 50 entries, then polls for new rows every 3 s.
func (h *StubHandler) StreamLogs(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	w := c.Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.Writer.(http.Flusher)
	if !ok {
		return nil
	}

	ctx := c.Request().Context()
	var lastID int64

	// Send initial snapshot (last 50 entries, oldest-first).
	snapRows, snapErr := h.db.QueryContext(ctx,
		`SELECT id, model, provider, input_tokens, output_tokens, cost_usd, call_type, status, created_at
		 FROM usage_logs WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT 50`,
		userID,
	)
	if snapErr == nil {
		var snapshot []map[string]any
		for snapRows.Next() {
			var id int64
			var model, provider, callType, status string
			var inputTok, outputTok int
			var costUSD float64
			var createdAt string
			if snapRows.Scan(&id, &model, &provider, &inputTok, &outputTok, &costUSD, &callType, &status, &createdAt) == nil {
				if id > lastID {
					lastID = id
				}
				snapshot = append(snapshot, map[string]any{
					"id": id, "model": model, "provider": provider,
					"input_tokens": inputTok, "output_tokens": outputTok,
					"cost_usd": costUSD, "call_type": callType,
					"status": status, "created_at": createdAt,
				})
			}
		}
		snapRows.Close()
		// emit oldest-first
		for i := len(snapshot) - 1; i >= 0; i-- {
			data, _ := json.Marshal(snapshot[i])
			fmt.Fprintf(w, "data: %s\n\n", data)
		}
		flusher.Flush()
	}

	poll := time.NewTicker(3 * time.Second)
	defer poll.Stop()
	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-keepAlive.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case <-poll.C:
			newRows, pollErr := h.db.QueryContext(ctx,
				`SELECT id, model, provider, input_tokens, output_tokens, cost_usd, call_type, status, created_at
				 FROM usage_logs WHERE user_id = $1 AND id > $2
				 ORDER BY id ASC LIMIT 20`,
				userID, lastID,
			)
			if pollErr != nil {
				continue
			}
			for newRows.Next() {
				var id int64
				var model, provider, callType, status string
				var inputTok, outputTok int
				var costUSD float64
				var createdAt string
				if newRows.Scan(&id, &model, &provider, &inputTok, &outputTok, &costUSD, &callType, &status, &createdAt) == nil {
					if id > lastID {
						lastID = id
					}
					entry := map[string]any{
						"id": id, "model": model, "provider": provider,
						"input_tokens": inputTok, "output_tokens": outputTok,
						"cost_usd": costUSD, "call_type": callType,
						"status": status, "created_at": createdAt,
					}
					data, _ := json.Marshal(entry)
					fmt.Fprintf(w, "data: %s\n\n", data)
				}
			}
			newRows.Close()
			flusher.Flush()
		}
	}
}

// ── Integrations ──────────────────────────────────────────────────────────────

func (h *StubHandler) GetIntegration(c echo.Context) error {
	name := c.Param("name")
	if name == "" {
		return c.JSON(http.StatusOK, map[string]any{"integrations": []any{}})
	}
	return c.JSON(http.StatusOK, map[string]any{"integration": name, "enabled": false})
}

func (h *StubHandler) UpdateIntegration(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

func (h *StubHandler) DeleteIntegration(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/v1/providers/custom/models
// Probes a custom endpoint (Ollama or OpenAI-compatible) and returns its model list.
// Body: { base_url, endpoint_type ("ollama"|"openai_compatible"), api_key }
func (h *StubHandler) ListCustomModels(c echo.Context) error {
	var req struct {
		BaseURL      string `json:"base_url"`
		EndpointType string `json:"endpoint_type"`
		APIKey       string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.BaseURL) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "base_url is required"})
	}

	client := &http.Client{Timeout: 10 * time.Second}
	base := strings.TrimRight(req.BaseURL, "/")
	var models []string

	switch req.EndpointType {
	case "ollama":
		resp, err := client.Get(base + "/api/tags")
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]string{"error": "cannot reach endpoint"})
		}
		defer resp.Body.Close()
		var data struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Models {
				models = append(models, m.Name)
			}
		}

	default: // openai_compatible or unspecified
		httpReq, _ := http.NewRequest(http.MethodGet, base+"/v1/models", nil)
		if req.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
		}
		resp, err := client.Do(httpReq)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]string{"error": "cannot reach endpoint"})
		}
		defer resp.Body.Close()
		var data struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Data {
				models = append(models, m.ID)
			}
		}
	}

	if models == nil {
		models = []string{}
	}
	return c.JSON(http.StatusOK, map[string]any{"models": models})
}

// ── Skills ────────────────────────────────────────────────────────────────────

// ── Skill SKILL.md scanning ───────────────────────────────────────────────────

// skillFileMeta holds UI-relevant fields parsed from a SKILL.md frontmatter.
type skillFileMeta struct {
	DisplayName      string `yaml:"display_name"`
	Description      string `yaml:"description"`
	Emoji            string `yaml:"emoji"`
	Category         string `yaml:"category"`
	EnabledByDefault bool   `yaml:"enabled_by_default"`
	RequiresAPIKey   bool   `yaml:"requires_api_key"`
	APIKeyProvider   string `yaml:"api_key_provider"`
	APIKeyType       string `yaml:"api_key_type"`
	APIKeyLabel      string `yaml:"api_key_label"`
	APIKeyLabel1     string `yaml:"api_key_label_1"`
	APIKeyLabel2     string `yaml:"api_key_label_2"`
	UsesProvider     bool   `yaml:"uses_provider"`
}

// parseSkillMD reads a SKILL.md file and extracts the YAML frontmatter block.
// It returns the parsed metadata and the folder ID (directory name).
func parseSkillMD(path string) (id string, meta skillFileMeta, err error) {
	id = filepath.Base(filepath.Dir(path))
	data, err := os.ReadFile(path)
	if err != nil {
		return id, meta, err
	}
	// Extract --- ... --- frontmatter
	s := string(data)
	if !strings.HasPrefix(s, "---") {
		return id, meta, nil
	}
	s = s[3:]
	end := strings.Index(s, "\n---")
	if end < 0 {
		return id, meta, nil
	}
	err = yaml.Unmarshal([]byte(s[:end]), &meta)
	return id, meta, err
}

// listSkillPaths returns paths to all SKILL.md files under skillsDir.
func listSkillPaths(skillsDir string) []string {
	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		return nil
	}
	var paths []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		p := filepath.Join(skillsDir, e.Name(), "SKILL.md")
		if _, err := os.Stat(p); err == nil {
			paths = append(paths, p)
		}
	}
	return paths
}

// skillI18n holds a translated display_name and short description for a skill.
type skillI18n struct{ DisplayName, Description string }

// skillTranslations[lang][skillID] — non-Korean translations for built-in skills.
var skillTranslations = map[string]map[string]skillI18n{
	"en": {
		"analysis":          {DisplayName: "AI Analysis", Description: "Trigger AI insights: conversation analysis, spending patterns, memory compaction"},
		"audio":             {DisplayName: "Audio / TTS", Description: "Speech-to-text transcription and text-to-speech generation"},
		"browser":           {DisplayName: "Browser Control", Description: "Control Chrome browser — navigate, read content, click, screenshot"},
		"budget":            {DisplayName: "Budget Manager", Description: "Set and check monthly spending budgets per category"},
		"currency":          {DisplayName: "Currency Exchange", Description: "Get exchange rates and convert currency amounts"},
		"documents":         {DisplayName: "Document Search & Creation", Description: "Search, read, save, and generate documents in the knowledge base"},
		"files":             {DisplayName: "My Files", Description: "Manage, search, upload, and analyze all files — documents, images, audio"},
		"finance":           {DisplayName: "Finance Ledger", Description: "Record and query income/expense transactions"},
		"github":            {DisplayName: "GitHub Integration", Description: "Browse repositories, issues, PRs, and search code"},
		"google-workspace":  {DisplayName: "Google Workspace", Description: "Calendar, Drive, Docs, Tasks, and Gmail integration"},
		"image":             {DisplayName: "Image Analysis & Generation", Description: "Analyze images with AI or generate/edit images"},
		"memory":            {DisplayName: "Memory Search", Description: "Search past conversations and personal records semantically"},
		"naver-map":         {DisplayName: "Naver Maps", Description: "Geocode addresses and generate static map images (Korea)"},
		"naver-search":      {DisplayName: "Naver Search", Description: "Search Korean web content — news, blogs, shopping, and more"},
		"notion":            {DisplayName: "Notion Integration", Description: "Search, read, create, and update Notion pages and databases"},
		"planner-diary":     {DisplayName: "Daily One-Liner", Description: "Record today's one-line summary and mood in Planner"},
		"planner-goals":     {DisplayName: "Goal Management", Description: "Track long-term D-Day goals with due dates and roles"},
		"planner-inbox":     {DisplayName: "Inbox", Description: "Capture quick ideas and promote them to daily tasks"},
		"planner-mission":   {DisplayName: "Mission Statement", Description: "Set and view your personal mission statement"},
		"planner-reflection":{DisplayName: "Notes", Description: "Record notes in the Planner's notes section"},
		"planner-roles":     {DisplayName: "Role Management", Description: "Manage life roles with colors, key goals, and missions"},
		"planner-tasks":     {DisplayName: "Task Management", Description: "Manage daily tasks with ABC priority levels"},
		"planner-weekly":    {DisplayName: "Weekly Goals", Description: "Set and track weekly key goals per role"},
		"weather":           {DisplayName: "Weather", Description: "Get current weather forecasts (no API key required)"},
		"websearch":         {DisplayName: "Tavily Search", Description: "Search the internet for up-to-date information"},
	},
	"ja": {
		"analysis":          {DisplayName: "AI分析", Description: "会話インサイト・支出パターン・メモリ最適化のAI分析"},
		"audio":             {DisplayName: "音声変換 / TTS", Description: "音声ファイルのテキスト変換とテキスト読み上げ"},
		"browser":           {DisplayName: "ブラウザ制御", Description: "Chromeブラウザを操作 — ナビゲート・コンテンツ読取・スクリーンショット"},
		"budget":            {DisplayName: "予算管理", Description: "カテゴリ別の月次予算を設定・確認"},
		"currency":          {DisplayName: "為替レート", Description: "為替レートの取得と通貨換算"},
		"documents":         {DisplayName: "文書検索・生成", Description: "ナレッジベースの文書を検索・読込・保存・生成"},
		"files":             {DisplayName: "マイファイル", Description: "文書・画像・音声ファイルを管理・検索・分析"},
		"finance":           {DisplayName: "家計簿", Description: "収支取引を記録・照会"},
		"github":            {DisplayName: "GitHub連携", Description: "リポジトリ・イシュー・PR・コード検索"},
		"google-workspace":  {DisplayName: "Google Workspace", Description: "カレンダー・ドライブ・ドキュメント・タスク・Gmail連携"},
		"image":             {DisplayName: "画像分析・生成", Description: "AIで画像を分析または生成・編集"},
		"memory":            {DisplayName: "記憶検索", Description: "過去の会話や個人記録をセマンティック検索"},
		"naver-map":         {DisplayName: "Naverマップ", Description: "住所の座標変換と静的地図画像生成（韓国）"},
		"naver-search":      {DisplayName: "Naver検索", Description: "Naverで韓国語Webコンテンツを検索"},
		"notion":            {DisplayName: "Notion連携", Description: "Notionページとデータベースの検索・作成・更新"},
		"planner-diary":     {DisplayName: "今日のひとこと", Description: "今日のひとこと要約と気分を記録"},
		"planner-goals":     {DisplayName: "目標管理", Description: "締め切り付きの長期D-Day目標を管理"},
		"planner-inbox":     {DisplayName: "インボックス", Description: "アイデアをすばやくキャプチャして日次タスクに昇格"},
		"planner-mission":   {DisplayName: "ミッションステートメント", Description: "個人のミッションステートメントを設定・閲覧"},
		"planner-reflection":{DisplayName: "ノート", Description: "プランナーのノートセクションに記録"},
		"planner-roles":     {DisplayName: "役割管理", Description: "色・目標・ミッションで人生の役割を管理"},
		"planner-tasks":     {DisplayName: "タスク管理", Description: "ABC優先度で日次タスクを管理"},
		"planner-weekly":    {DisplayName: "週次目標", Description: "役割ごとの週次重要目標を設定・追跡"},
		"weather":           {DisplayName: "天気", Description: "現在の天気予報を取得（APIキー不要）"},
		"websearch":         {DisplayName: "Tavily検索", Description: "最新情報のインターネット検索"},
	},
	"zh": {
		"analysis":          {DisplayName: "AI分析", Description: "触发AI洞察：会话分析、消费模式、记忆压缩"},
		"audio":             {DisplayName: "语音转换 / TTS", Description: "音频转文字和文字转语音"},
		"browser":           {DisplayName: "浏览器控制", Description: "控制Chrome浏览器 — 导航、读取内容、截图"},
		"budget":            {DisplayName: "预算管理", Description: "按类别设置和检查月度支出预算"},
		"currency":          {DisplayName: "汇率换算", Description: "获取汇率并换算货币"},
		"documents":         {DisplayName: "文档搜索与生成", Description: "搜索、读取、保存和生成知识库文档"},
		"files":             {DisplayName: "我的文件", Description: "管理、搜索、上传和分析所有文件"},
		"finance":           {DisplayName: "账本", Description: "记录和查询收支交易"},
		"github":            {DisplayName: "GitHub集成", Description: "浏览仓库、问题、PR和搜索代码"},
		"google-workspace":  {DisplayName: "Google Workspace", Description: "日历、云端硬盘、文档、任务和Gmail集成"},
		"image":             {DisplayName: "图像分析与生成", Description: "用AI分析图像或生成/编辑图像"},
		"memory":            {DisplayName: "记忆搜索", Description: "通过语义搜索查找过去的对话和个人记录"},
		"naver-map":         {DisplayName: "Naver地图", Description: "地址坐标转换和生成静态地图图像（韩国）"},
		"naver-search":      {DisplayName: "Naver搜索", Description: "搜索韩文网络内容"},
		"notion":            {DisplayName: "Notion集成", Description: "搜索、读取、创建和更新Notion页面和数据库"},
		"planner-diary":     {DisplayName: "今日一言", Description: "记录今日总结和心情"},
		"planner-goals":     {DisplayName: "目标管理", Description: "管理带截止日期的长期D-Day目标"},
		"planner-inbox":     {DisplayName: "收件箱", Description: "快速记录想法并转化为日常任务"},
		"planner-mission":   {DisplayName: "使命宣言", Description: "设置和查看个人使命宣言"},
		"planner-reflection":{DisplayName: "笔记", Description: "在计划员的笔记区域记录"},
		"planner-roles":     {DisplayName: "角色管理", Description: "用颜色、目标和使命管理人生角色"},
		"planner-tasks":     {DisplayName: "任务管理", Description: "用ABC优先级管理日常任务"},
		"planner-weekly":    {DisplayName: "每周目标", Description: "按角色设置和追踪每周重要目标"},
		"weather":           {DisplayName: "天气", Description: "获取当前天气预报（无需API密钥）"},
		"websearch":         {DisplayName: "Tavily搜索", Description: "搜索最新信息"},
	},
}

func (h *StubHandler) ListSkills(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Resolve display language: ?lang= param > user DB preference > "ko"
	lang := c.QueryParam("lang")
	if lang == "" {
		h.db.QueryRowContext(c.Request().Context(),
			`SELECT COALESCE(preferences->>'language', 'ko') FROM users WHERE id = $1`, userID,
		).Scan(&lang) //nolint:errcheck
	}
	if lang == "" {
		lang = "ko"
	}
	i18nMap := skillTranslations[lang] // nil for "ko" — use SKILL.md values as-is

	skillsDir := h.config.SkillsDir
	h.logger.Info("ListSkills called", zap.String("skillsDir", skillsDir))

	// 1. Scan SKILL.md files for metadata
	paths := listSkillPaths(skillsDir)
	h.logger.Info("ListSkills scan result", zap.Int("found", len(paths)), zap.String("dir", skillsDir))
	type skillEntry struct {
		id   string
		meta skillFileMeta
	}
	var skillDefs []skillEntry
	for _, p := range paths {
		id, meta, err := parseSkillMD(p)
		if err != nil || meta.DisplayName == "" {
			continue
		}
		skillDefs = append(skillDefs, skillEntry{id, meta})
	}

	if len(skillDefs) == 0 {
		return c.JSON(http.StatusOK, map[string]any{"skills": []any{}})
	}

	// 2. Fetch per-user enabled state from user_skills
	ctx := c.Request().Context()
	enabledMap := map[string]bool{}
	rows, err := h.db.QueryContext(ctx,
		`SELECT skill_id, enabled FROM user_skills WHERE user_id = $1`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var sid string
			var en bool
			if rows.Scan(&sid, &en) == nil {
				enabledMap[sid] = en
			}
		}
	}

	// 3. Fetch API keys from integration_keys for providers used by these skills
	keyMap := map[string]string{} // provider → raw key
	keyRows, err := h.db.QueryContext(ctx,
		`SELECT provider, api_key FROM integration_keys WHERE user_id = $1`, userID)
	if err == nil {
		defer keyRows.Close()
		for keyRows.Next() {
			var prov, key string
			if keyRows.Scan(&prov, &key) == nil {
				plain, decErr := crypto.Decrypt(key, h.config.EncryptionKey)
				if decErr != nil {
					h.logger.Warn("failed to decrypt integration key",
						zap.String("provider", prov),
						zap.Error(decErr),
					)
					continue
				}
				if plain != "" {
					keyMap[prov] = plain
				}
			}
		}
	}

	// 4. For google_oauth skills, fetch OAuth connection status from google_tokens
	oauthConnected := false
	var oauthExpiresAt *time.Time
	for _, sd := range skillDefs {
		if sd.meta.APIKeyType == "google_oauth" {
			var expiresAt time.Time
			if err := h.db.QueryRowContext(ctx,
				`SELECT expires_at FROM google_tokens WHERE user_id = $1`, userID,
			).Scan(&expiresAt); err == nil {
				oauthConnected = true
				t := expiresAt
				oauthExpiresAt = &t
			}
			break
		}
	}

	// 5. Build response
	skills := make([]map[string]any, 0, len(skillDefs))
	for _, sd := range skillDefs {
		enabled, hasUserPref := enabledMap[sd.id]
		if !hasUserPref {
			enabled = sd.meta.EnabledByDefault
		}

		displayName := sd.meta.DisplayName
		description := sd.meta.Description
		if t, ok := i18nMap[sd.id]; ok {
			displayName = t.DisplayName
			description = t.Description
		}

		entry := map[string]any{
			"id":               sd.id,
			"display_name":     displayName,
			"description":      description,
			"category":         sd.meta.Category,
			"emoji":            sd.meta.Emoji,
			"enabled":          enabled,
			"requires_api_key": sd.meta.RequiresAPIKey,
			"api_key_provider": sd.meta.APIKeyProvider,
			"api_key_type":     sd.meta.APIKeyType,
			"api_key_label":    sd.meta.APIKeyLabel,
			"api_key_label_1":  sd.meta.APIKeyLabel1,
			"api_key_label_2":  sd.meta.APIKeyLabel2,
			"uses_provider":    sd.meta.UsesProvider,
			"has_api_key":      false,
			"masked_key":       nil,
			"oauth_connected":  false,
			"oauth_expires_at": nil,
		}
		if sd.meta.APIKeyProvider != "" {
			if raw, ok := keyMap[sd.meta.APIKeyProvider]; ok && raw != "" {
				entry["has_api_key"] = true
				entry["masked_key"] = maskKey(raw)
			}
		}
		if sd.meta.APIKeyType == "google_oauth" {
			entry["oauth_connected"] = oauthConnected
			entry["oauth_expires_at"] = oauthExpiresAt
		}
		skills = append(skills, entry)
	}

	return c.JSON(http.StatusOK, map[string]any{"skills": skills})
}

func (h *StubHandler) ToggleSkill(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	skillID := c.Param("id")
	ctx := c.Request().Context()

	// Read current enabled state from DB.
	var current bool
	dbErr := h.db.QueryRowContext(ctx,
		`SELECT enabled FROM user_skills WHERE user_id = $1 AND skill_id = $2`,
		userID, skillID,
	).Scan(&current)

	if dbErr != nil {
		// No row yet — read enabled_by_default from SKILL.md as the base state.
		path := filepath.Join(h.config.SkillsDir, skillID, "SKILL.md")
		_, meta, _ := parseSkillMD(path)
		current = meta.EnabledByDefault
	}

	newEnabled := !current

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO user_skills (user_id, skill_id, enabled)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, skill_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
		userID, skillID, newEnabled,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update skill"})
	}

	return c.JSON(http.StatusOK, map[string]any{"skill_id": skillID, "enabled": newEnabled})
}

// skillProviderFromFile reads api_key_provider for a given skill ID from its SKILL.md.
func (h *StubHandler) skillProviderFromFile(skillID string) (string, error) {
	path := filepath.Join(h.config.SkillsDir, skillID, "SKILL.md")
	_, meta, err := parseSkillMD(path)
	if err != nil {
		return "", err
	}
	if meta.APIKeyProvider == "" {
		return "", fmt.Errorf("skill %s has no api_key_provider configured", skillID)
	}
	return meta.APIKeyProvider, nil
}

// isValidSkillID returns true if skillID contains only safe path characters.
// Prevents path traversal when constructing SKILL.md paths.
func isValidSkillID(id string) bool {
	if id == "" || len(id) > 100 {
		return false
	}
	for _, r := range id {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// PUT /api/v1/skills/:id/api-key — save the API key for a skill that requires one.
func (h *StubHandler) SaveSkillAPIKey(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	skillID := c.Param("id")
	if !isValidSkillID(skillID) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid skill id"})
	}

	var req struct {
		APIKey string `json:"api_key"`
	}
	if err := c.Bind(&req); err != nil || req.APIKey == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "api_key is required"})
	}

	provider, err := h.skillProviderFromFile(skillID)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill not found or missing api_key_provider"})
	}

	encrypted, encErr := crypto.Encrypt(req.APIKey, h.config.EncryptionKey)
	if encErr != nil {
		h.logger.Error("failed to encrypt skill API key", zap.String("provider", provider), zap.Error(encErr))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save API key"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`INSERT INTO integration_keys (user_id, provider, api_key)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, provider) DO UPDATE
		   SET api_key = EXCLUDED.api_key, updated_at = NOW()`,
		userID, provider, encrypted,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save API key"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"skill_id":    skillID,
		"provider":    provider,
		"has_api_key": true,
		"masked_key":  maskKey(req.APIKey),
	})
}

// DELETE /api/v1/skills/:id/api-key — remove the API key for a skill.
func (h *StubHandler) DeleteSkillAPIKey(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	skillID := c.Param("id")
	if !isValidSkillID(skillID) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid skill id"})
	}

	provider, err := h.skillProviderFromFile(skillID)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill not found or missing api_key_provider"})
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete API key"})
	}

	return c.JSON(http.StatusOK, map[string]any{"skill_id": skillID, "has_api_key": false})
}

// ── Google OAuth (Skill-based) ────────────────────────────────────────────────

const googleSkillAuthURL = "https://accounts.google.com/o/oauth2/v2/auth"

// GET /api/v1/skills/:id/oauth-url
// Returns the Google OAuth consent URL for a skill with api_key_type: google_oauth.
// The user must have already saved their Client ID + Secret via the api-key endpoint.
func (h *StubHandler) SkillOAuthURL(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	skillID := c.Param("id")

	// Validate it's a google_oauth skill
	path := filepath.Join(h.config.SkillsDir, skillID, "SKILL.md")
	_, meta, err := parseSkillMD(path)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "skill not found"})
	}
	if meta.APIKeyType != "google_oauth" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill is not a google_oauth skill"})
	}
	if meta.APIKeyProvider == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "skill has no api_key_provider"})
	}

	// Read per-user credentials (stored as "clientID:clientSecret", possibly encrypted)
	var rawCredsEnc string
	if err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT api_key FROM integration_keys WHERE user_id = $1 AND provider = $2`,
		userID, meta.APIKeyProvider,
	).Scan(&rawCredsEnc); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "google client credentials not configured — save Client ID and Secret first",
		})
	}
	rawCreds, _ := crypto.Decrypt(rawCredsEnc, h.config.EncryptionKey)
	if !strings.Contains(rawCreds, ":") {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "google client credentials not configured — save Client ID and Secret first",
		})
	}

	clientID := strings.SplitN(rawCreds, ":", 2)[0]
	redirectURL := h.config.GoogleRedirectURL
	if redirectURL == "" {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error": "GOOGLE_REDIRECT_URL not configured on server",
		})
	}

	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {redirectURL},
		"response_type": {"code"},
		"scope": {"openid email profile " +
			"https://www.googleapis.com/auth/calendar " +
			"https://www.googleapis.com/auth/drive " +
			"https://www.googleapis.com/auth/documents " +
			"https://www.googleapis.com/auth/tasks " +
			"https://mail.google.com/"},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
		"state":         {oauthState(userID.String(), h.config.JWTSecret)},
	}
	authURL := googleSkillAuthURL + "?" + params.Encode()

	return c.JSON(http.StatusOK, map[string]any{
		"url":     authURL,
		"enabled": true,
	})
}

// DELETE /api/v1/skills/:id/oauth-disconnect
// Revokes and removes stored Google OAuth tokens for a google_oauth skill.
func (h *StubHandler) SkillOAuthDisconnect(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Best-effort: revoke the access token with Google
	var encAccessToken string
	_ = h.db.QueryRowContext(c.Request().Context(),
		`SELECT access_token FROM google_tokens WHERE user_id = $1`, userID,
	).Scan(&encAccessToken)
	if encAccessToken != "" {
		accessToken, _ := crypto.Decrypt(encAccessToken, h.config.EncryptionKey)
		if accessToken != "" {
			revokeGoogleToken(accessToken) //nolint:errcheck
		}
	}

	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM google_tokens WHERE user_id = $1`, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to disconnect"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "disconnected"})
}

// ── Auth Link ─────────────────────────────────────────────────────────────────

// POST /api/v1/auth/link
// Generates a short-lived 8-character alphanumeric code stored in platform_link_codes.
// A Telegram bot (or other platform) can call this code to link the user's account.
// The code expires in 10 minutes.
func (h *StubHandler) AuthLink(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	// Generate a 6-byte random code → 8-char base32-like uppercase alphanum
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate code"})
	}
	// Encode to uppercase alphanumeric (drop non-alphanum, take first 8 chars)
	encoded := strings.ToUpper(strings.NewReplacer(
		"+", "", "/", "", "=", "",
	).Replace(base64.StdEncoding.EncodeToString(buf)))
	if len(encoded) > 8 {
		encoded = encoded[:8]
	}

	expiresAt := time.Now().Add(10 * time.Minute)
	ctx := c.Request().Context()

	// Invalidate any existing codes for this user
	h.db.ExecContext(ctx,
		`DELETE FROM platform_link_codes WHERE user_id = $1`, userID,
	)

	// Insert new code
	_, err = h.db.ExecContext(ctx,
		`INSERT INTO platform_link_codes (code, user_id, expires_at) VALUES ($1, $2, $3)`,
		encoded, userID, expiresAt,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save link code"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"code":       encoded,
		"expires_at": expiresAt.Format(time.RFC3339),
		"expires_in": 600, // seconds
	})
}

// ── WS Token ──────────────────────────────────────────────────────────────────

// GET /api/v1/ws-token
// Returns a short-lived JWT (1 hour) that can be used as a WebSocket auth token.
// Clients send it as ?token=... in the WS upgrade URL so it doesn't block the HTTP
// Authorization header (which browsers don't support on WebSocket upgrades).
func (h *StubHandler) GetWSToken(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"type":    "ws",
		"exp":     time.Now().Add(1 * time.Hour).Unix(),
		"jti":     uuid.New().String(), // unique token ID
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.config.JWTSecret))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"token":      signed,
		"expires_in": 3600,
		"type":       "ws",
	})
}
