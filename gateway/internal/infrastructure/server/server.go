package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/adapter/router"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/bootstrap"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/scheduler"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"go.uber.org/zap"
)

type Server struct {
	echo        *echo.Echo
	config      *config.Config
	logger      *zap.Logger
	agentClient *agentgrpc.AgentClient
	router      *router.Router
	scheduler   *scheduler.Scheduler
	container   *bootstrap.Container
}

func New(rootLogger *zap.Logger) (*Server, error) {
	cfg := config.Load()

	// Build the non-HTTP dependency graph via the bootstrap container.
	// This replaces the 150-line `New()` body that used to construct the
	// DB, gRPC client, log hub, repositories, usecases, scheduler and
	// notification dispatcher inline — all of those now live in
	// internal/infrastructure/bootstrap/wire.go.
	ctx := context.Background()
	container, err := bootstrap.New(ctx, cfg, rootLogger)
	if err != nil {
		return nil, err
	}
	logger := container.Logger

	// Initialize Echo
	e := echo.New()
	e.HideBanner = true

	// Register a request-body validator so handlers can call
	// c.Validate(&req) after c.Bind(&req). Without this, the
	// `validate:` struct tags scattered through the handler
	// packages are dead code and any zero-value input slips past
	// the Bind step straight into downstream logic.
	e.Validator = httpauth.NewRequestValidator()

	// Middleware
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())

	// ── CORS ──────────────────────────────────────────────────────────────────
	// config.Load() fail-fasts when AllowedOrigins is empty on a non-loopback
	// bind and populates sensible localhost defaults in dev, so by the time
	// we reach this line the list is guaranteed non-empty.
	allowedOrigins := cfg.AllowedOrigins
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: allowedOrigins,
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, "X-Request-ID"},
	}))

	// ── Gzip Compression ──────────────────────────────────────────────────────
	e.Use(middleware.GzipWithConfig(middleware.GzipConfig{
		Level: 6,
		Skipper: func(c echo.Context) bool {
			// Skip SSE and WebSocket — streaming must not be buffered
			return c.Request().Header.Get("Accept") == "text/event-stream" ||
				c.Request().Header.Get("Upgrade") == "websocket"
		},
	}))

	// ── Security Headers ──────────────────────────────────────────────────────
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			h := c.Response().Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("X-XSS-Protection", "1; mode=block")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			return next(c)
		}
	})

	// ── Rate Limiting ──────────────────────────────────────────────────────────
	// In-memory rate limiter — suitable for single-instance deployments.
	// For multi-instance: replace with Redis-backed store.
	// Keyed by "user:<user_id>" for authenticated requests, "ip:<ip>" otherwise.
	e.Use(middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Store: middleware.NewRateLimiterMemoryStoreWithConfig(
			middleware.RateLimiterMemoryStoreConfig{
				Rate:      100, // requests per minute per identity
				Burst:     30,
				ExpiresIn: 1 * time.Minute,
			},
		),
		IdentifierExtractor: func(c echo.Context) (string, error) {
			if u := c.Get("user"); u != nil {
				if tok, ok := u.(interface {
					Valid() bool
					Claims(v any) error
				}); ok {
					var claims struct {
						UserID string `json:"user_id"`
					}
					if err := tok.Claims(&claims); err == nil && claims.UserID != "" {
						return "user:" + claims.UserID, nil
					}
				}
			}
			return "ip:" + c.RealIP(), nil
		},
		ErrorHandler: func(c echo.Context, err error) error {
			return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
		},
		DenyHandler: func(c echo.Context, id string, err error) error {
			return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
		},
	}))

	// ── Request Body Size Limit ───────────────────────────────────────────────
	e.Use(middleware.BodyLimit("10M"))

	// Register routes using dependencies from the bootstrap container.
	h := router.NewRouter(container.DB, cfg, container.AgentClient, container.LogHub, router.RouterDeps{
		UserUseCase:         container.UseCases.User,
		AnomalyUseCase:      container.UseCases.Anomaly,
		BudgetUseCase:       container.UseCases.Budget,
		ChannelsUseCase:     container.UseCases.Channels,
		ConnectUseCase:      container.UseCases.Connect,
		ConversationUseCase: container.UseCases.Conversation,
		CronUseCase:         container.UseCases.Cron,
		FilesUseCase:        container.UseCases.Files,
		FinanceUseCase:      container.UseCases.Finance,
		IntegrationsUseCase: container.UseCases.Integrations,
		MediaUseCase:        container.UseCases.Media,
		MediaStore:          container.MediaStore,
		NotificationUseCase: container.UseCases.Notification,
		Dispatcher:          container.Dispatcher,
		PersonaUseCase:      container.UseCases.Persona,
		PlannerUseCase:      container.UseCases.Planner,
		SearchUseCase:       container.UseCases.Search,
		SettingsUseCase:     container.UseCases.Settings,
		SkillsUseCase:       container.UseCases.Skills,
		StatisticsUseCase:   container.UseCases.Statistics,
	}, logger)
	h.Register(e)

	// Wire scheduler → cron handler for immediate timer re-arm.
	h.SetScheduler(container.Scheduler)

	return &Server{
		echo:        e,
		config:      cfg,
		logger:      logger,
		agentClient: container.AgentClient,
		router:      h,
		scheduler:   container.Scheduler,
		container:   container,
	}, nil
}

func (s *Server) Run(ctx context.Context) error {
	// Thread the server lifetime context into the telegram webhook
	// handler so its detached goroutines (HandleUpdate + album-buffer
	// timers) get cancelled during graceful shutdown. Without this
	// the webhook goroutines use context.Background() and outlive
	// the Echo shutdown window, holding DB connections past SIGTERM.
	s.router.SetBaseContext(ctx)

	// Wire the token blacklist to the DB so revoked tokens survive
	// process restarts. Without this, logout was effectively erased
	// on every redeploy and the previously-logged-out token became
	// valid again until its 24-hour TTL elapsed.
	httpauth.InitBlacklist(s.router.DB().Pool())

	telegramHandler := s.router.TelegramHandler()

	// Build the MessageHandler used by all pollers.
	msgHandler := func(ctx context.Context, upd tginfra.Update) {
		msg := upd.Message
		text := strings.TrimSpace(msg.Text)

		// Collect the largest photo file ID (Telegram returns sizes small→large).
		var photoFileIDs []string
		if len(msg.Photo) > 0 {
			if largest := msg.Photo[len(msg.Photo)-1]; largest.FileID != "" {
				photoFileIDs = []string{largest.FileID}
			}
		}

		// Voice file ID
		voiceFileID := ""
		if msg.Voice != nil {
			voiceFileID = msg.Voice.FileID
		}

		// Document file ID
		documentFileID := ""
		if msg.Document != nil && msg.Document.FileID != "" {
			documentFileID = msg.Document.FileID
		}

		// Use caption as text when there is no text but there is a photo/doc
		if text == "" && msg.Caption != "" {
			text = msg.Caption
		}

		chatType := ""
		if msg.Chat != nil {
			chatType = msg.Chat.Type
		}

		// Anonymous group admins have no From; skip to avoid nil panic.
		if msg.From == nil {
			s.logger.Warn("Telegram message with nil From, skipping")
			return
		}
		s.logger.Info("Telegram poll message",
			zap.Int64("telegram_user_id", msg.From.ID),
			zap.String("text", text),
			zap.String("chat_type", chatType),
		)
		telegramHandler.HandleUpdate(
			ctx,
			msg.From.ID,
			msg.Chat.ID,
			int(msg.MessageID),
			msg.From.FirstName,
			msg.From.Username,
			text,
			chatType,
			photoFileIDs,
			voiceFileID,
			documentFileID,
			tginfra.BotTokenFromContext(ctx),
		)
	}

	// Create BotManager using the background context so pollers outlive handler calls.
	botManager := tginfra.NewBotManager(ctx, s.logger, msgHandler)

	// Wire BotManager into the router so dynamic pollers can be started.
	s.router.SetBotManager(botManager)

	// 1. Global token from env
	botManager.EnsurePoller(s.config.TelegramBotToken)

	// 2. Per-user bot tokens from channel_settings (set via web UI Channels page)
	if rows, err := s.router.DB().Pool().Query(ctx,
		`SELECT DISTINCT bot_token FROM channel_settings WHERE channel = 'telegram' AND bot_token <> '' AND bot_token IS NOT NULL`,
	); err == nil {
		for rows.Next() {
			var encTok string
			if rows.Scan(&encTok) == nil {
				tok, decErr := crypto.Decrypt(encTok, s.config.EncryptionKey)
				if decErr != nil || strings.HasPrefix(tok, "enc:") {
					// Decryption failed or ENCRYPTION_KEY not set while token is encrypted.
					s.logger.Warn("skipping telegram poller: token decryption failed", zap.Error(decErr))
					continue
				}
				if tok == "" {
					tok = encTok // plaintext token stored before encryption was enabled
				}
				botManager.EnsurePoller(tok)
				s.logger.Info("Telegram per-user poller started")
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			s.logger.Warn("telegram token query rows error", zap.Error(err))
		}
	}

	// Start background scheduler.
	s.scheduler.Start(ctx)

	go func() {
		<-ctx.Done()
		// Use a fresh context for shutdown so cancellation of the parent doesn't
		// race with in-flight HTTP handlers still being drained.
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		// Drain in-flight HTTP requests before closing the agent connection.
		if err := s.echo.Shutdown(shutdownCtx); err != nil {
			s.logger.Warn("HTTP server shutdown error", zap.Error(err))
		}
		if s.agentClient != nil {
			s.agentClient.Close()
		}
	}()

	// ReadHeaderTimeout prevents slow-loris attacks on header phase.
	// ReadTimeout/WriteTimeout are left at 0 to allow long-lived SSE and WebSocket streams.
	// IdleTimeout closes idle keep-alive connections after 2 minutes.
	s.echo.Server.ReadHeaderTimeout = 10 * time.Second
	s.echo.Server.IdleTimeout = 2 * time.Minute

	s.logger.Info("Starting server", zap.String("addr", s.config.HTTPAddr))
	return s.echo.Start(s.config.HTTPAddr)
}
