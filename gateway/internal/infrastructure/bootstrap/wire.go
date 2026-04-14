// Package bootstrap wires the gateway's dependency graph: database,
// gRPC client, log hub, domain repositories, usecases, scheduler,
// notifier. It exists so server.go only has to worry about HTTP-level
// concerns (Echo setup, middleware, routes) instead of mixing them with
// infrastructure construction.
//
// The Container returned by New() is the single place that lists every
// non-HTTP object the gateway depends on. Adding a new bounded context
// (new repository + usecase) means one edit here and one edit at the
// router wiring site — no more god `server.New()` function.
package bootstrap

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/config"
	fileshttp "github.com/newstarnion/gateway/internal/adapter/http/files"
	integrationshttp "github.com/newstarnion/gateway/internal/adapter/http/integrations"
	searchhttp "github.com/newstarnion/gateway/internal/adapter/http/search"
	postgresrepo "github.com/newstarnion/gateway/internal/adapter/repository/postgres"
	"github.com/newstarnion/gateway/internal/infrastructure/connectingest"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"github.com/newstarnion/gateway/internal/infrastructure/embedding"
	"github.com/newstarnion/gateway/internal/infrastructure/googleoauth"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/logbuffer"
	"github.com/newstarnion/gateway/internal/infrastructure/mediastore"
	"github.com/newstarnion/gateway/internal/infrastructure/scheduler"
	"github.com/newstarnion/gateway/internal/infrastructure/skillcat"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"github.com/newstarnion/gateway/internal/notification"
	anomalyusecase "github.com/newstarnion/gateway/internal/usecase/anomaly"
	budgetusecase "github.com/newstarnion/gateway/internal/usecase/budget"
	channelsusecase "github.com/newstarnion/gateway/internal/usecase/channels"
	connectusecase "github.com/newstarnion/gateway/internal/usecase/connect"
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
	"go.uber.org/zap/zapcore"
)

// Container holds every long-lived gateway dependency built at startup.
// HTTP adapters (echo, router) are NOT part of the container — they are
// assembled on top of the container in server.New().
type Container struct {
	Config      *config.Config
	DB          *database.DB
	Logger      *zap.Logger // tee'd into LogHub
	LogHub      *logbuffer.Hub
	AgentClient *agentgrpc.AgentClient // may be nil when agent unreachable
	Scheduler   *scheduler.Scheduler
	Dispatcher  *notification.Dispatcher
	MediaStore  *mediastore.Store

	// Use cases — grouped so RouterDeps can be built with a single field
	// and new domains don't require touching server.go.
	UseCases UseCases
}

// UseCases lists every domain-scoped use case the HTTP layer depends on.
// New domains add one line here and one line in the wiring body below.
type UseCases struct {
	User         *userusecase.UseCase
	Anomaly      *anomalyusecase.UseCase
	Budget       *budgetusecase.UseCase
	Channels     *channelsusecase.UseCase
	Connect      *connectusecase.UseCase
	Conversation *conversationusecase.UseCase
	Cron         *cronusecase.UseCase
	Files        *filesusecase.UseCase
	Finance      *financeusecase.UseCase
	Integrations *integrationsusecase.UseCase
	Media        *mediausecase.UseCase
	Notification *notificationusecase.UseCase
	Persona      *personausecase.UseCase
	Planner      *plannerusecase.UseCase
	Search       *searchusecase.UseCase
	Settings     *settingsusecase.UseCase
	Skills       *skillsusecase.UseCase
	Statistics   *statisticsusecase.UseCase
}

// New builds the full dependency graph and returns a ready-to-use
// Container. The caller (typically server.New) is responsible for
// creating the Echo instance and handing the container into the router.
//
// `logger` is the root logger; New returns a tee'd copy that also
// streams into the in-memory LogHub so /api/v1/logs/stream can surface
// gateway output in the UI.
func New(ctx context.Context, cfg *config.Config, rootLogger *zap.Logger) (*Container, error) {
	// ── Database ─────────────────────────────────────────────────────────
	db, err := database.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("bootstrap: open database: %w", err)
	}
	if err := database.RunMigrations(ctx, db, rootLogger); err != nil {
		return nil, fmt.Errorf("bootstrap: run migrations: %w", err)
	}

	// ── Log Hub (tee stdout + in-memory buffer) ──────────────────────────
	hub := logbuffer.NewHub()
	logger := zap.New(
		zapcore.NewTee(rootLogger.Core(), logbuffer.NewZapCore(hub)),
		zap.WithCaller(false),
	)

	// ── Agent gRPC client ────────────────────────────────────────────────
	// Non-fatal on failure: the gateway still serves plain HTTP endpoints
	// (dashboards, settings) when the agent is offline.
	agentTLS := agentgrpc.TLSOptions{
		CAPath:     cfg.AgentGRPCTLSCAPath,
		CertPath:   cfg.AgentGRPCTLSCertPath,
		KeyPath:    cfg.AgentGRPCTLSKeyPath,
		ServerName: cfg.AgentGRPCTLSServerName,
	}
	agentClient, err := agentgrpc.NewAgentClient(cfg.AgentGRPCAddr, cfg.GRPCSharedSecret, agentTLS, logger)
	if err != nil {
		logger.Warn("bootstrap: failed to connect to agent service",
			zap.String("addr", cfg.AgentGRPCAddr), zap.Error(err))
		agentClient = nil
	}

	// ── Domain repositories and use cases ───────────────────────────────
	userRepo := postgresrepo.NewUserRepository(db)
	anomalyRepo := postgresrepo.NewAnomalyRepository(db)
	budgetRepo := postgresrepo.NewBudgetRepository(db)
	channelsRepo := postgresrepo.NewChannelsRepository(db, cfg.EncryptionKey)
	connectRepo := postgresrepo.NewConnectionRepository(db)
	conversationRepo := postgresrepo.NewConversationRepository(db)
	cronRepo := postgresrepo.NewCronRepository(db)
	fileRepo := postgresrepo.NewFileRepository(db)
	financeRepo := postgresrepo.NewFinanceRepository(db)
	integrationsRepo := postgresrepo.NewIntegrationsRepository(db, cfg.EncryptionKey)
	mediaRepo := postgresrepo.NewMediaRepository(db, cfg.EncryptionKey)
	notificationRepo := postgresrepo.NewNotificationRepository(db)
	personaRepo := postgresrepo.NewPersonaRepository(db)
	plannerRepo := postgresrepo.NewPlannerRepository(db)
	searchRepo := postgresrepo.NewSearchRepository(db)
	settingsRepo := postgresrepo.NewSettingsRepository(db, cfg.EncryptionKey)
	statisticsRepo := postgresrepo.NewStatisticsRepository(db)
	userSkillsRepo := postgresrepo.NewUserSkillsRepository(db)
	// Search usecase needs an Embedder adapter (thin wrapper around
	// the infrastructure/embedding client). The adapter lives in
	// http/search because it's a pure HTTP-side concern.
	searchEmbedder := searchhttp.NewEmbedderAdapter(db, cfg.EncryptionKey)
	// Channels usecase is built with a Telegram gateway + webhook URL.
	// The bot poller is wired post-construction via SetPoller() in
	// server.go because the BotManager is built after this container.
	channelsUC := channelsusecase.NewUseCase(channelsRepo, tginfra.NewGateway(), cfg.TelegramWebhookURL, cfg.TelegramWebhookSecret)

	// Files usecase needs an Embedder adapter + a TextExtractor
	// adapter. Both are thin wrappers (infrastructure/embedding
	// and os/exec "python3 extract_text.py") living in the
	// http/files package to keep the wiring mechanical.
	filesEmbedder := fileshttp.NewEmbedderAdapter(func(ctx context.Context, userID uuid.UUID) (embedding.Config, error) {
		return embedding.ResolveConfig(ctx, db, userID.String(), cfg.EncryptionKey)
	})
	filesUC := filesusecase.NewUseCase(
		fileRepo,
		filesEmbedder,
		fileshttp.NewTextExtractorAdapter(cfg.SkillsDir),
		cfg.JWTSecret,
		cfg.EncryptionKey,
	)
	// Integrations usecase bundles the generic API-key repo with a
	// Google OAuth adapter + the server-default credentials. The
	// JWT secret is reused for HMAC-signing OAuth state tokens.
	integrationsUC := integrationsusecase.NewUseCase(
		integrationsRepo,
		integrationshttp.NewGoogleOAuthAdapter(googleoauth.NewClient()),
		integrationsusecase.DefaultCredentials{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
		},
		cfg.EncryptionKey,
		cfg.JWTSecret,
	)
	useCases := UseCases{
		User:         userusecase.NewUseCase(userRepo),
		Anomaly:      anomalyusecase.NewUseCase(anomalyRepo),
		Budget:       budgetusecase.NewUseCase(budgetRepo),
		Channels:     channelsUC,
		Connect:      connectusecase.NewUseCase(connectRepo),
		Conversation: conversationusecase.NewUseCase(conversationRepo),
		Cron:         cronusecase.NewUseCase(cronRepo),
		Files:        filesUC,
		Finance:      financeusecase.NewUseCase(financeRepo),
		Integrations: integrationsUC,
		Media:        mediausecase.NewUseCase(mediaRepo),
		Notification: notificationusecase.NewUseCase(notificationRepo),
		Persona:      personausecase.NewUseCase(personaRepo),
		Planner:      plannerusecase.NewUseCase(plannerRepo),
		Search:       searchusecase.NewUseCase(searchRepo, searchEmbedder),
		Settings:     settingsusecase.NewUseCase(settingsRepo),
		Skills:       skillsusecase.NewUseCase(userSkillsRepo, skillcat.NewScanner(cfg.SkillsDir), integrationsUC),
		Statistics:   statisticsusecase.NewUseCase(statisticsRepo, logger),
	}

	// ── Notification dispatcher ─────────────────────────────────────────
	// To add a new platform (Discord, Slack, …) register another Notifier
	// in the variadic NewDispatcher call.
	dispatcher := notification.NewDispatcher(db, logger,
		notification.NewTelegramNotifier(db, cfg.EncryptionKey, logger),
	)

	// ── Scheduler ────────────────────────────────────────────────────────
	// Scheduler dispatches notifications and smart_notify jobs. The
	// "report" action-type / ReportFunc port were removed together
	// with the reports HTTP handler — the old wiring was a silent
	// no-op that still paid per-tick DB + goroutine cost.
	notifyFn := func(ctx context.Context, userID, notifType, message string) error {
		// Persist to notifications table so dedup checks in smart_notify
		// jobs see the row before delivery — prevents duplicate fires.
		// Log INSERT failures explicitly: on a connection blip the row
		// is missing, dedup becomes stale, and the next tick re-fires
		// the same notification. Fail loud rather than silently double.
		if _, err := db.Pool().Exec(ctx,
			`INSERT INTO notifications (user_id, type, message)
			 VALUES ($1::uuid, $2, $3)`,
			userID, notifType, message,
		); err != nil {
			logger.Warn("scheduler notify: dedup INSERT failed, may double-fire",
				zap.String("user_id", userID),
				zap.String("type", notifType),
				zap.Error(err))
		}
		// Dispatcher.Dispatch is best-effort (per-channel failures are
		// logged inside the dispatcher) so scheduler's NotifyFunc
		// always reports success. A true delivery failure shows up
		// in the gateway log stream, not in the return value here.
		dispatcher.Dispatch(ctx, userID, notifType, message)
		return nil
	}
	sched := scheduler.New(db, logger, notifyFn)
	sched.SetNaverCredentials(cfg.NaverSearchClientID, cfg.NaverSearchClientSecret)
	sched.SetEncryptionKey(cfg.EncryptionKey)
	sched.SetGoogleCredentials(cfg.GoogleClientID, cfg.GoogleClientSecret)

	// Connect Phase 2 — wire the Gmail/Calendar ingestor and the
	// connect usecase into the scheduler so the nightly maintenance
	// jobs (connect_activity_ingest, connect_score_recompute) and the
	// daily smart-notify job (connect_drift_reminder) have something
	// to invoke. The narrow ports defined on Scheduler keep the
	// dependency direction clean.
	connectIngestor := connectingest.New(integrationsUC, connectRepo, logger)
	sched.SetConnectPhase2(connectIngestor, useCases.Connect, useCases.Connect)

	// Media store wraps MinIO + local-filesystem fallback so the
	// http/media handler never has to branch between the two.
	mediaStore := mediastore.New(cfg, logger)

	return &Container{
		Config:      cfg,
		DB:          db,
		Logger:      logger,
		LogHub:      hub,
		AgentClient: agentClient,
		Scheduler:   sched,
		Dispatcher:  dispatcher,
		MediaStore:  mediaStore,
		UseCases:    useCases,
	}, nil
}
