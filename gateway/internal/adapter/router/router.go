package router

import (
	"context"
	"crypto/subtle"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	agentchathttp "github.com/newstarnion/gateway/internal/adapter/http/agentchat"
	anomalyhttp "github.com/newstarnion/gateway/internal/adapter/http/anomaly"
	authhttp "github.com/newstarnion/gateway/internal/adapter/http/auth"
	budgethttp "github.com/newstarnion/gateway/internal/adapter/http/budget"
	channelshttp "github.com/newstarnion/gateway/internal/adapter/http/channels"
	conversationhttp "github.com/newstarnion/gateway/internal/adapter/http/conversation"
	cronhttp "github.com/newstarnion/gateway/internal/adapter/http/cron"
	fileshttp "github.com/newstarnion/gateway/internal/adapter/http/files"
	financehttp "github.com/newstarnion/gateway/internal/adapter/http/finance"
	healthhttp "github.com/newstarnion/gateway/internal/adapter/http/health"
	httpauth "github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	integrationshttp "github.com/newstarnion/gateway/internal/adapter/http/integrations"
	logshttp "github.com/newstarnion/gateway/internal/adapter/http/logs"
	mediahttp "github.com/newstarnion/gateway/internal/adapter/http/media"
	notificationhttp "github.com/newstarnion/gateway/internal/adapter/http/notification"
	personahttp "github.com/newstarnion/gateway/internal/adapter/http/persona"
	plannerhttp "github.com/newstarnion/gateway/internal/adapter/http/planner"
	searchhttp "github.com/newstarnion/gateway/internal/adapter/http/search"
	settingshttp "github.com/newstarnion/gateway/internal/adapter/http/settings"
	skillshttp "github.com/newstarnion/gateway/internal/adapter/http/skills"
	statisticshttp "github.com/newstarnion/gateway/internal/adapter/http/statistics"
	userhttp "github.com/newstarnion/gateway/internal/adapter/http/user"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/logbuffer"
	"github.com/newstarnion/gateway/internal/infrastructure/mediastore"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"github.com/newstarnion/gateway/internal/notification"
	"github.com/newstarnion/gateway/internal/port"
	anomalyusecase "github.com/newstarnion/gateway/internal/usecase/anomaly"
	budgetusecase "github.com/newstarnion/gateway/internal/usecase/budget"
	channelsusecase "github.com/newstarnion/gateway/internal/usecase/channels"
	conversationusecase "github.com/newstarnion/gateway/internal/usecase/conversation"
	cronusecase "github.com/newstarnion/gateway/internal/usecase/cron"
	filesusecase "github.com/newstarnion/gateway/internal/usecase/files"
	financeusecase "github.com/newstarnion/gateway/internal/usecase/finance"
	integrationsusecase "github.com/newstarnion/gateway/internal/usecase/integrations"
	mediausecase "github.com/newstarnion/gateway/internal/usecase/media"
	notificationusecase "github.com/newstarnion/gateway/internal/usecase/notification"
	personausecase "github.com/newstarnion/gateway/internal/usecase/persona"
	plannerusecase "github.com/newstarnion/gateway/internal/usecase/planner"
	searchusecase "github.com/newstarnion/gateway/internal/usecase/search"
	settingsusecase "github.com/newstarnion/gateway/internal/usecase/settings"
	skillsusecase "github.com/newstarnion/gateway/internal/usecase/skills"
	statisticsusecase "github.com/newstarnion/gateway/internal/usecase/statistics"
	userusecase "github.com/newstarnion/gateway/internal/usecase/user"
	"go.uber.org/zap"
)

type Router struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger

	auth                 *authhttp.Handler
	userProfile          *userhttp.Handler // CA-migrated user-profile routes
	persona              *personahttp.Handler
	chat                 *agentchathttp.ChatHandler
	telegram             *agentchathttp.TelegramHandler
	health               *healthhttp.Handler
	finance              *financehttp.Handler
	budget               *budgethttp.Handler
	conversation         *conversationhttp.Handler
	notificationHTTP     *notificationhttp.Handler         // CA-migrated user routes
	notificationInternal *notificationhttp.InternalHandler // agent-facing /internal/notify
	cron                 *cronhttp.Handler
	cronUC               *cronusecase.UseCase // retained for SetScheduler post-construction wiring
	settings             *settingshttp.Handler
	statistics           *statisticshttp.Handler
	search               *searchhttp.Handler
	files                *fileshttp.Handler
	media                *mediahttp.Handler
	integrations         *integrationshttp.Handler
	channels             *channelshttp.Handler
	channelsUC           *channelsusecase.UseCase // retained for SetBotManager post-construction wiring
	skills               *skillshttp.Handler
	ws                   *agentchathttp.WSHandler
	logs                 *logshttp.Handler
	anomaly              *anomalyhttp.Handler
	planner              *plannerhttp.Handler
}

// RouterDeps bundles the use cases and adapters that NewRouter needs. New
// use cases should be added here rather than plumbed through the long
// positional argument list.
type RouterDeps struct {
	UserUseCase         *userusecase.UseCase
	AnomalyUseCase      *anomalyusecase.UseCase
	BudgetUseCase       *budgetusecase.UseCase
	ChannelsUseCase     *channelsusecase.UseCase
	ConversationUseCase *conversationusecase.UseCase
	CronUseCase         *cronusecase.UseCase
	FilesUseCase        *filesusecase.UseCase
	FinanceUseCase      *financeusecase.UseCase
	IntegrationsUseCase *integrationsusecase.UseCase
	MediaUseCase        *mediausecase.UseCase
	MediaStore          *mediastore.Store
	NotificationUseCase *notificationusecase.UseCase
	// Dispatcher is the shared notification dispatcher used by the
	// agent-facing /internal/notify endpoint. Built in bootstrap
	// so the router can hand it to notificationhttp.NewInternalHandler.
	Dispatcher        *notification.Dispatcher
	PersonaUseCase    *personausecase.UseCase
	PlannerUseCase    *plannerusecase.UseCase
	SearchUseCase     *searchusecase.UseCase
	SettingsUseCase   *settingsusecase.UseCase
	SkillsUseCase     *skillsusecase.UseCase
	StatisticsUseCase *statisticsusecase.UseCase
}

func NewRouter(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, hub *logbuffer.Hub, deps RouterDeps, logger *zap.Logger) *Router {
	return &Router{
		db:                   db,
		config:               cfg,
		logger:               logger,
		auth:                 authhttp.NewHandler(db, cfg, logger),
		userProfile:          userhttp.NewHandler(deps.UserUseCase, logger),
		persona:              personahttp.NewHandler(deps.PersonaUseCase, logger),
		budget:               budgethttp.NewHandler(deps.BudgetUseCase, logger),
		chat:                 agentchathttp.NewChatHandler(db, cfg, agentClient, deps.ConversationUseCase, logger),
		telegram:             agentchathttp.NewTelegramHandler(db, cfg, agentClient, deps.ConversationUseCase, logger),
		health:               healthhttp.NewHandler(agentClient),
		finance:              financehttp.NewHandler(deps.FinanceUseCase, logger),
		conversation:         conversationhttp.NewHandler(deps.ConversationUseCase, logger),
		notificationHTTP:     notificationhttp.NewHandler(deps.NotificationUseCase, logger),
		notificationInternal: notificationhttp.NewInternalHandler(deps.Dispatcher, logger),
		cron:                 cronhttp.NewHandler(deps.CronUseCase, logger),
		cronUC:               deps.CronUseCase,
		settings:             settingshttp.NewHandler(deps.SettingsUseCase, cfg, logger),
		statistics:           statisticshttp.NewHandler(deps.StatisticsUseCase, logger),
		search:               searchhttp.NewHandler(deps.SearchUseCase, logger),
		files:                fileshttp.NewHandler(deps.FilesUseCase, deps.MediaStore, cfg, logger),
		media:                mediahttp.NewHandler(deps.MediaUseCase, deps.MediaStore, cfg, logger),
		integrations:         integrationshttp.NewHandler(deps.IntegrationsUseCase, cfg, logger),
		channels:             channelshttp.NewHandler(deps.ChannelsUseCase, logger),
		channelsUC:           deps.ChannelsUseCase,
		skills:               skillshttp.NewHandler(deps.SkillsUseCase, cfg, logger),
		ws:                   agentchathttp.NewWSHandler(db, cfg, agentClient, deps.ConversationUseCase, logger),
		logs:                 logshttp.NewHandler(hub),
		anomaly:              anomalyhttp.NewHandler(deps.AnomalyUseCase, logger),
		planner:              plannerhttp.NewHandler(deps.PlannerUseCase, logger),
	}
}

// TelegramHandler returns the internal agentchat.TelegramHandler
// (used by the polling loop to deliver inbound messages).
func (r *Router) TelegramHandler() *agentchathttp.TelegramHandler {
	return r.telegram
}

// DB returns the shared database connection (used by the server for startup queries).
func (r *Router) DB() *database.DB {
	return r.db
}

// SetBotManager wires the BotManager into the channels usecase so
// dynamic pollers can be started when users update their channel
// settings. The channels usecase exposes a SetPoller hook for this
// post-construction wiring.
func (r *Router) SetBotManager(bm *tginfra.BotManager) {
	r.channelsUC.SetPoller(bm)
}

// SetScheduler wires the event-driven scheduler into the cron
// usecase so that schedule mutations immediately re-arm the user
// schedule timer. Uses port.ScheduleWaker directly now that the
// legacy type alias is gone.
func (r *Router) SetScheduler(w port.ScheduleWaker) {
	r.cronUC.SetScheduler(w)
}

// SetBaseContext threads the server's lifetime context into the
// telegram webhook handler so detached goroutines (HandleUpdate,
// album buffer timers) get cancelled during graceful shutdown.
// Called once from server.New after the base context is built.
func (r *Router) SetBaseContext(ctx context.Context) {
	r.telegram.SetBaseContext(ctx)
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
	auth.POST("/logout", r.auth.Logout)

	// Protected routes
	protected := api.Group("")
	protected.Use(r.auth.JWTMiddleware())
	protected.Use(perUserRateLimiter())

	// ── User / Profile ────────────────────────────────────────────────────────
	// Core user-profile routes live in the http/user sub-package. The
	// /profile/persona active-selector routes now live on the persona
	// sub-package so they share the persona usecase with /personas.
	r.userProfile.Register(protected)

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
	// FTS search still lives on the legacy chat handler; the rest of the
	// conversation CRUD is in /internal/adapter/http/conversation.
	protected.GET("/conversations/search", r.chat.SearchConversations)
	r.conversation.Register(protected)

	// ── Finance (sub-package /internal/adapter/http/finance) ─────────────
	r.finance.Register(protected)

	// ── Personas (settings + /profile/persona selector) ──────────────────────
	r.persona.Register(protected)

	// ── Notifications ─────────────────────────────────────────────────────────
	// Notification inbox routes live in the http/notification sub-package;
	// InternalSend (agent scheduler callback) is still on the legacy
	// handler because it holds a notification.Dispatcher instance.
	r.notificationHTTP.Register(protected)

	// ── Statistics / Analytics / Usage ────────────────────────────────────────
	// ── Statistics (sub-package /internal/adapter/http/statistics) ───────
	r.statistics.Register(protected)

	// ── Anomalies (sub-package /internal/adapter/http/anomaly) ────────────
	r.anomaly.Register(protected)

	// ── Settings (providers / model-pricing / model-assignments) ─────────
	// sub-package /internal/adapter/http/settings
	r.settings.Register(protected)

	// ── Budget (sub-package /internal/adapter/http/budget) ───────────────
	r.budget.Register(protected)

	// ── Search (sub-package /internal/adapter/http/search) ───────────────
	r.search.Register(protected)

	// ── Files (sub-package /internal/adapter/http/files) ────────────────
	r.files.Register(protected)

	// ── Planner (sub-package /internal/adapter/http/planner) ─────────────
	r.planner.Register(protected)

	// ── Media (sub-package /internal/adapter/http/media) ─────────────────
	// Register mounts image/audio CRUD + transcribe/tts + upload on
	// the protected group. ServeFile is mounted separately below
	// on the root echo because stored URLs use /api/files/*
	// without the /v1 prefix.
	r.media.Register(protected)
	e.GET("/api/files/*", r.media.ServeFile)

	// ── Skills (sub-package /internal/adapter/http/skills) ────────────────
	r.skills.Register(protected)

	// ── Cron (sub-package /internal/adapter/http/cron) ───────────────────
	r.cron.Register(protected)

	// ── Channels (sub-package /internal/adapter/http/channels) ───────────
	r.channels.Register(protected)

	// ── System defaults (public — no auth needed for settings UI) ────────────
	r.settings.RegisterPublic(api)

	// ── Logs ──────────────────────────────────────────────────────────────────
	protected.GET("/logs/app", r.logs.GetSnapshot)
	protected.GET("/logs/stream", r.logs.Stream)
	// Internal — agent pushes its console output here (shared-secret auth, no JWT).
	// Config.Load() fail-fasts when the secret is missing, so by the time we reach
	// this middleware it is always non-empty. Any mismatch (or an accidental empty
	// value reaching here) is a hard 403 — fail-closed. The comparison is done in
	// constant time so attackers cannot probe the secret via response timing.
	internalSecret := []byte(r.config.InternalLogSecret)
	internalMiddleware := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			provided := []byte(c.Request().Header.Get("X-Internal-Secret"))
			if len(internalSecret) == 0 || subtle.ConstantTimeCompare(provided, internalSecret) != 1 {
				return c.JSON(403, map[string]string{"error": "forbidden"})
			}
			return next(c)
		}
	}
	api.POST("/internal/logs", r.logs.Push, internalMiddleware)
	// Internal — agent scheduler delivers notifications via the gateway's dispatcher
	// (so bot tokens are decrypted server-side, never exposed to the agent)
	api.POST("/internal/notify", r.notificationInternal.Send, internalMiddleware)
	// Internal — agent uploads browser screenshots to MinIO for Telegram delivery
	api.POST("/internal/upload-screenshot", r.media.InternalUploadScreenshot, internalMiddleware)
	// Internal — agent cron_create tool registers user schedules without a JWT
	api.POST("/internal/cron-schedule", r.cron.InternalCreateSchedule, internalMiddleware)

	// ── Integrations (sub-package /internal/adapter/http/integrations) ───
	r.integrations.Register(protected)
	// Google OAuth callback is public (Google cannot forward JWT cookies).
	r.integrations.RegisterPublic(api)

	// ── Auth Link / WS Token ──────────────────────────────────────────────────
	// Note: POST /providers/custom/models is registered by settings.Register above.
	protected.POST("/auth/link", r.auth.AuthLink)
	protected.GET("/ws-token", r.auth.GetWSToken)
}

// perUserRateLimiter returns a middleware that limits each
// authenticated user to 120 requests per fixed one-minute window.
// It relies on the JWT middleware having already run (c.Get("user")
// is set). Idle buckets are evicted by a janitor goroutine so the
// map stays bounded even under high churn — without this, every
// user who ever hits a protected endpoint becomes a permanent
// entry, which is a slow-burn DoS gift.
//
// "Sliding window" is a misnomer held over from the original
// comment — the implementation resets the counter on each new
// minute, which is a fixed window. A user can in theory burst
// 240 req/min at the window boundary. This is acceptable because
// 120/minute is already well under any backend's hot-path budget,
// but the naming is now honest.
func perUserRateLimiter() echo.MiddlewareFunc {
	type bucket struct {
		mu     sync.Mutex
		count  int
		window time.Time
	}
	var buckets sync.Map

	// Janitor: drop buckets that have been idle for > 10 minutes.
	// Matches the pattern used by httpauth.blacklist.go and
	// chatctx/user_prefs_cache.go. The bucket is cheap to re-create
	// on the next request, so aggressive eviction is safe.
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		const idleCutoff = 10 * time.Minute
		for now := range t.C {
			buckets.Range(func(k, v any) bool {
				b, ok := v.(*bucket)
				if !ok {
					buckets.Delete(k)
					return true
				}
				b.mu.Lock()
				stale := now.Sub(b.window) > idleCutoff
				b.mu.Unlock()
				if stale {
					buckets.Delete(k)
				}
				return true
			})
		}
	}()

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tok, ok := c.Get("user").(*jwt.Token)
			if !ok || tok == nil {
				return next(c)
			}
			claims, ok := tok.Claims.(*httpauth.Claims)
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
