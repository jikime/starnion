package handler

import (
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/logbuffer"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

type Router struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger

	auth         *AuthHandler
	user         *UserHandler
	chat         *ChatHandler
	telegram     *TelegramHandler
	health       *HealthHandler
	finance      *FinanceHandler
	budget       *BudgetHandler
	conversation *ConversationHandler
	persona      *PersonaHandler
	notification *NotificationHandler
	cron         *CronHandler
	settings     *SettingsHandler
	statistics   *StatisticsHandler
	search       *SearchHandler
	files        *FilesHandler
	media        *MediaHandler
	integrations *IntegrationsHandler
	stub         *StubHandler
	ws           *WSHandler
	logs         *LogsHandler
	anomaly      *AnomalyHandler
	planner      *PlannerHandler
}

func NewRouter(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, hub *logbuffer.Hub, logger *zap.Logger) *Router {
	return &Router{
		db:           db,
		config:       cfg,
		logger:       logger,
		auth:         NewAuthHandler(db, cfg, logger),
		user:         NewUserHandler(db, cfg, logger),
		chat:         NewChatHandler(db, cfg, agentClient, logger),
		telegram:     NewTelegramHandler(db, cfg, agentClient, logger),
		health:       NewHealthHandler(agentClient),
		finance:      NewFinanceHandler(db, cfg, logger),
		budget:       NewBudgetHandler(db, cfg, logger),
		conversation: NewConversationHandler(db, cfg, logger),
		persona:      NewPersonaHandler(db, cfg, logger),
		notification: NewNotificationHandler(db, cfg, logger),
		cron:         NewCronHandler(db, cfg, logger),
		settings:     NewSettingsHandler(db, cfg, logger),
		statistics:   NewStatisticsHandler(db, cfg, logger),
		search:       NewSearchHandler(db, cfg, logger),
		files:        NewFilesHandler(db, cfg, logger),
		media:        NewMediaHandler(db, cfg, logger),
		integrations: NewIntegrationsHandler(db, cfg, logger),
		stub:         NewStubHandler(db, cfg, logger),
		ws:           NewWSHandler(db, cfg, agentClient, logger),
		logs:         NewLogsHandler(hub),
		anomaly:      NewAnomalyHandler(db, cfg, logger),
		planner:      NewPlannerHandler(db, cfg, logger),
	}
}

// TelegramHandler returns the internal TelegramHandler (used by the polling loop).
func (r *Router) TelegramHandler() *TelegramHandler {
	return r.telegram
}

// DB returns the shared database connection (used by the server for startup queries).
func (r *Router) DB() *database.DB {
	return r.db
}

// SetBotManager wires the BotManager into the stub handler so dynamic pollers
// can be started when users update their channel settings.
func (r *Router) SetBotManager(bm *tginfra.BotManager) {
	r.stub.SetBotManager(bm)
}

func (r *Router) Register(e *echo.Echo) {
	// Health check
	e.GET("/health", r.health.Check)

	// WebSocket — auth via ?token=<jwt> query param (browsers can't set WS headers)
	e.GET("/ws", r.ws.Handle)

	// Telegram webhook
	e.POST("/webhook", r.telegram.Webhook)
	e.POST("/webhook/:token", r.telegram.Webhook)

	// API v1
	api := e.Group("/api/v1")

	// Auth routes (public)
	auth := api.Group("/auth")
	auth.POST("/register", r.auth.Register)
	auth.POST("/login", r.auth.Login)
	auth.POST("/refresh", r.auth.RefreshToken)

	// Protected routes
	protected := api.Group("")
	protected.Use(r.auth.JWTMiddleware())
	protected.Use(perUserRateLimiter())

	// ── User / Profile ────────────────────────────────────────────────────────
	protected.GET("/me", r.user.GetMe)
	protected.PUT("/me", r.user.UpdateMe)
	protected.GET("/me/preferences", r.user.GetPreferences)
	protected.PUT("/me/preferences", r.user.UpdatePreferences)
	// /profile aliases for UI compatibility
	protected.GET("/profile", r.user.GetMe)
	protected.PUT("/profile", r.user.UpdateMe)
	protected.PATCH("/profile", r.user.UpdateMe)
	protected.GET("/profile/persona", r.user.GetProfilePersona)
	protected.PATCH("/profile/persona", r.user.UpdateProfilePersona)

	// ── Telegram ──────────────────────────────────────────────────────────────
	protected.GET("/telegram/config", r.telegram.GetConfig)
	protected.PUT("/telegram/config", r.telegram.UpdateConfig)
	protected.DELETE("/telegram/config", r.telegram.DeleteConfig)
	protected.POST("/telegram/link", r.telegram.LinkTelegram)
	protected.POST("/telegram/link-code", r.telegram.LinkTelegramByCode)

	// ── Chat sessions (legacy / internal) ─────────────────────────────────────
	protected.GET("/sessions", r.chat.ListSessions)
	protected.POST("/sessions", r.chat.CreateSession)
	protected.GET("/sessions/search", r.chat.SearchSessions)
	protected.GET("/sessions/:id", r.chat.GetSession)
	protected.DELETE("/sessions/:id", r.chat.DeleteSession)
	protected.GET("/sessions/:id/messages", r.chat.ListMessages)
	protected.POST("/sessions/:id/chat", r.chat.Chat)

	// ── Chat stream (AI SDK v6 wire format) ───────────────────────────────────
	protected.POST("/chat/stream", r.chat.ChatStream)

	// ── Conversations (thread-based, used by UI) ──────────────────────────────
	protected.GET("/conversations", r.conversation.List)
	protected.POST("/conversations", r.conversation.Create)
	protected.GET("/conversations/search", r.chat.SearchConversations) // FTS across messages table
	protected.GET("/conversations/:id", r.conversation.Get)
	protected.PATCH("/conversations/:id", r.conversation.Patch)
	protected.DELETE("/conversations/:id", r.conversation.Delete)
	protected.GET("/conversations/:id/messages", r.conversation.ListMessages)
	protected.DELETE("/conversations/:id/messages/:msgId", r.conversation.DeleteMessage)

	// ── Finance ───────────────────────────────────────────────────────────────
	protected.GET("/finance/summary", r.finance.Summary)
	protected.GET("/finance/transactions", r.finance.ListTransactions)
	protected.POST("/finance/transactions", r.finance.CreateTransaction)
	protected.PUT("/finance/transactions/:id", r.finance.UpdateTransaction)
	protected.DELETE("/finance/transactions/:id", r.finance.DeleteTransaction)
	protected.GET("/finance/map", r.finance.MapTransactions)

	// ── Personas (settings) ───────────────────────────────────────────────────
	protected.GET("/personas", r.persona.List)
	protected.POST("/personas", r.persona.Create)
	protected.PUT("/personas/:id", r.persona.Update)
	protected.DELETE("/personas/:id", r.persona.Delete)

	// ── Notifications ─────────────────────────────────────────────────────────
	protected.GET("/notifications", r.notification.List)
	protected.PATCH("/notifications/read", r.notification.MarkRead)
	protected.PUT("/notifications/read-all", r.notification.MarkAllRead)

	// ── Statistics / Analytics / Usage ────────────────────────────────────────
	protected.GET("/statistics", r.statistics.GetStatistics)
	protected.GET("/statistics/insights", r.statistics.GetInsights)
	protected.GET("/analytics", r.statistics.GetAnalytics)
	protected.GET("/usage", r.statistics.GetUsage)
	protected.GET("/anomalies", r.anomaly.GetAnomalies)

	// ── Settings: Providers ────────────────────────────────────────────────────
	protected.GET("/providers", r.settings.ListProviders)
	protected.POST("/providers", r.settings.UpsertProvider)
	protected.GET("/providers/:provider", r.settings.GetProvider)
	protected.DELETE("/providers/:provider", r.settings.DeleteProvider)
	protected.POST("/providers/validate", r.settings.ValidateProvider)

	// ── Settings: Model Pricing ────────────────────────────────────────────────
	protected.GET("/model-pricing", r.settings.ListModelPricing)
	protected.POST("/model-pricing", r.settings.UpsertModelPricing)
	protected.DELETE("/model-pricing/:model", r.settings.DeleteModelPricing)

	// ── Settings: Model Assignments ────────────────────────────────────────────
	protected.GET("/model-assignments", r.settings.ListModelAssignments)
	protected.POST("/model-assignments", r.settings.UpsertModelAssignment)
	protected.DELETE("/model-assignments/:use_case", r.settings.DeleteModelAssignment)

	// ── Budget ────────────────────────────────────────────────────────────────
	protected.GET("/budget", r.budget.GetBudget)
	protected.PUT("/budget", r.budget.UpdateBudget)

	// ── Search ────────────────────────────────────────────────────────────────
	protected.GET("/searches", r.search.List)
	protected.POST("/searches", r.search.Create)
	protected.GET("/searches/:id", r.search.Get)
	protected.DELETE("/searches/:id", r.search.Delete)
	protected.GET("/search/hybrid", r.search.HybridSearch)

	// ── Files (unified: documents + images + audios) ──────────────────────────
	protected.GET("/files", r.files.List)
	protected.POST("/files", r.files.Upload)
	protected.GET("/files/search", r.files.Search)
	protected.GET("/files/:id", r.files.Get)
	protected.PATCH("/files/:id", r.files.Patch)
	protected.DELETE("/files/:id", r.files.Delete)
	protected.POST("/files/:id/index", r.files.Index)

	// ── Planner ──────────────────────────────────────────────────────────────
	protected.GET("/planner/snapshot", r.planner.Snapshot)
	// Roles
	protected.GET("/planner/roles", r.planner.ListRoles)
	protected.POST("/planner/roles", r.planner.CreateRole)
	protected.PUT("/planner/roles/:id", r.planner.UpdateRole)
	protected.DELETE("/planner/roles/:id", r.planner.DeleteRole)
	// Tasks
	protected.GET("/planner/tasks", r.planner.ListTasks)
	protected.POST("/planner/tasks", r.planner.CreateTask)
	protected.PUT("/planner/tasks/:id", r.planner.UpdateTask)
	protected.DELETE("/planner/tasks/:id", r.planner.DeleteTask)
	protected.POST("/planner/tasks/:id/forward", r.planner.ForwardTask)
	protected.PUT("/planner/tasks/reorder", r.planner.ReorderTasks)
	// Inbox
	protected.GET("/planner/inbox", r.planner.ListInbox)
	protected.POST("/planner/inbox", r.planner.CreateInbox)
	protected.POST("/planner/inbox/:id/promote", r.planner.PromoteInbox)
	protected.DELETE("/planner/inbox/:id", r.planner.DeleteInbox)
	// Weekly Goals
	protected.GET("/planner/weekly-goals", r.planner.ListWeeklyGoals)
	protected.POST("/planner/weekly-goals", r.planner.CreateWeeklyGoal)
	protected.PATCH("/planner/weekly-goals/:id/toggle", r.planner.ToggleWeeklyGoal)
	protected.DELETE("/planner/weekly-goals/:id", r.planner.DeleteWeeklyGoal)
	// Goals
	protected.GET("/planner/goals", r.planner.ListGoals)
	protected.POST("/planner/goals", r.planner.CreateGoal)
	protected.PUT("/planner/goals/:id", r.planner.UpdateGoal)
	protected.DELETE("/planner/goals/:id", r.planner.DeleteGoal)
	// Diary & Reflections
	protected.GET("/planner/diary", r.planner.GetDiary)
	protected.PUT("/planner/diary", r.planner.UpsertDiary)
	protected.GET("/planner/reflections", r.planner.GetReflection)
	protected.PUT("/planner/reflections", r.planner.UpsertReflection)
	// Mission
	protected.GET("/planner/mission", r.planner.GetMission)
	protected.PUT("/planner/mission", r.planner.UpdateMission)

	// ── Audio utilities ───────────────────────────────────────────────────────
	protected.POST("/audios/transcribe", r.media.Transcribe)
	protected.POST("/audios/tts", r.media.TTS)

	// ── Upload ────────────────────────────────────────────────────────────────
	protected.POST("/upload", r.media.Upload)

	// ── Static file serving (uploaded files) ──────────────────────────────────
	// Registered directly on the root echo instance (not the /api/v1 group)
	// because stored URLs use /api/files/... without the /v1 prefix.
	e.GET("/api/files/*", r.media.ServeFile)

	// ── Skills ────────────────────────────────────────────────────────────────
	protected.GET("/skills", r.stub.ListSkills)
	protected.POST("/skills/:id/toggle", r.stub.ToggleSkill)
	protected.PUT("/skills/:id/api-key", r.stub.SaveSkillAPIKey)
	protected.DELETE("/skills/:id/api-key", r.stub.DeleteSkillAPIKey)
	protected.GET("/skills/:id/oauth-url", r.stub.SkillOAuthURL)
	protected.DELETE("/skills/:id/oauth-disconnect", r.stub.SkillOAuthDisconnect)

	// ── Cron ──────────────────────────────────────────────────────────────────
	protected.GET("/cron/schedules", r.cron.ListUserSchedules)
	protected.POST("/cron/schedules", r.cron.CreateUserSchedule)
	protected.PUT("/cron/schedules/:id", r.cron.UpdateUserSchedule)
	protected.DELETE("/cron/schedules/:id", r.cron.DeleteUserSchedule)
	protected.POST("/cron/schedules/:id/toggle", r.cron.ToggleUserSchedule)
	protected.GET("/cron/system", r.cron.ListSystemJobs)
	protected.POST("/cron/system/:id/toggle", r.cron.ToggleSystemJob)

	// ── Channels ──────────────────────────────────────────────────────────────
	protected.GET("/channels/telegram", r.stub.GetChannelsTelegram)
	protected.PUT("/channels/telegram", r.stub.UpdateChannelsTelegram)
	protected.POST("/channels/telegram", r.stub.UpdateChannelsTelegram)
	protected.GET("/channels/telegram/pairing", r.stub.ListPairings)
	protected.POST("/channels/telegram/pairing", r.stub.CreatePairing)
	protected.POST("/channels/telegram/pairing/:id/approve", r.stub.ApprovePairing)
	protected.POST("/channels/telegram/pairing/:id/deny", r.stub.DenyPairing)

	// ── System defaults (public — no auth needed for settings UI) ────────────
	api.GET("/system/defaults", r.settings.GetSystemDefaults)

	// ── Logs ──────────────────────────────────────────────────────────────────
	protected.GET("/logs/app", r.logs.GetSnapshot)
	protected.GET("/logs/stream", r.logs.Stream)
	// Internal — agent pushes its console output here (shared-secret auth, no JWT)
	internalSecret := r.config.InternalLogSecret
	internalMiddleware := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if internalSecret != "" && c.Request().Header.Get("X-Internal-Secret") != internalSecret {
				return c.JSON(403, map[string]string{"error": "forbidden"})
			}
			return next(c)
		}
	}
	api.POST("/internal/logs", r.logs.Push, internalMiddleware)
	// Internal — agent scheduler delivers notifications via the gateway's dispatcher
	// (so bot tokens are decrypted server-side, never exposed to the agent)
	api.POST("/internal/notify", r.notification.InternalSend, internalMiddleware)
	// Internal — agent uploads browser screenshots to MinIO for Telegram delivery
	api.POST("/internal/upload-screenshot", r.media.InternalUploadScreenshot, internalMiddleware)
	// Internal — agent cron_create tool registers user schedules without a JWT
	api.POST("/internal/cron-schedule", r.cron.InternalCreateSchedule, internalMiddleware)

	// ── Integrations (DB-backed API key storage) ──────────────────────────────
	protected.GET("/integrations/status", r.integrations.Status)
	protected.GET("/integrations/google/auth-url", r.integrations.GoogleAuthURL)
	protected.GET("/integrations/google/status", r.integrations.GoogleStatus)
	protected.DELETE("/integrations/google", r.integrations.GoogleDisconnect)
	// Specific sub-routes must come before the /:name wildcard
	protected.GET("/integrations/naver_map/client-config", r.integrations.NaverMapClientConfig)
	protected.GET("/integrations/:name", r.integrations.Get)
	protected.POST("/integrations/:name", r.integrations.Upsert)
	protected.PUT("/integrations/:name", r.integrations.Upsert)
	protected.DELETE("/integrations/:name", r.integrations.Delete)

	// Google OAuth callback (GET from direct browser redirect, POST from web proxy)
	api.GET("/integrations/google/callback", r.integrations.GoogleCallback)
	api.POST("/integrations/google/callback", r.integrations.GoogleCallback)


	// ── Providers: Custom Models ───────────────────────────────────────────────
	protected.POST("/providers/custom/models", r.stub.ListCustomModels)

	// ── Auth Link / WS Token ──────────────────────────────────────────────────
	protected.POST("/auth/link", r.stub.AuthLink)
	protected.GET("/ws-token", r.stub.GetWSToken)
}

// perUserRateLimiter returns a middleware that limits each authenticated user
// to 120 requests per minute using a sliding one-minute window.
// It relies on the JWT middleware having already run (c.Get("user") is set).
func perUserRateLimiter() echo.MiddlewareFunc {
	type bucket struct {
		mu     sync.Mutex
		count  int
		window time.Time
	}
	var buckets sync.Map
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tok, ok := c.Get("user").(*jwt.Token)
			if !ok || tok == nil {
				return next(c)
			}
			claims, ok := tok.Claims.(*JWTClaims)
			if !ok {
				return next(c)
			}
			userID := claims.UserID

			now := time.Now()
			v, _ := buckets.LoadOrStore(userID, &bucket{window: now})
			b := v.(*bucket)
			b.mu.Lock()
			if now.Sub(b.window) >= time.Minute {
				b.count = 0
				b.window = now
			}
			b.count++
			count := b.count
			b.mu.Unlock()

			if count > 120 {
				return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
			}
			return next(c)
		}
	}
}
