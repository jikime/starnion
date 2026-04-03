package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/handler"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"github.com/newstarnion/gateway/internal/infrastructure/logbuffer"
	"github.com/newstarnion/gateway/internal/infrastructure/scheduler"
	tginfra "github.com/newstarnion/gateway/internal/infrastructure/telegram"
	"github.com/newstarnion/gateway/internal/notification"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Server struct {
	echo        *echo.Echo
	config      *config.Config
	logger      *zap.Logger
	agentClient *agentgrpc.AgentClient
	router      *handler.Router
	scheduler   *scheduler.Scheduler
}

func New(logger *zap.Logger) (*Server, error) {
	cfg := config.Load()

	// Initialize database
	ctx := context.Background()
	db, err := database.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	// Run pending database migrations.
	if err := database.RunMigrations(ctx, db, logger); err != nil {
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	// Initialize agent gRPC client
	agentClient, err := agentgrpc.NewAgentClient(cfg.AgentGRPCAddr, cfg.GRPCSharedSecret, logger)
	if err != nil {
		// Non-fatal: agent may not be running in all environments
		logger.Warn("Failed to connect to agent service", zap.String("addr", cfg.AgentGRPCAddr), zap.Error(err))
		agentClient = nil
	}

	// Create in-memory log hub and tee gateway logs into it.
	hub := logbuffer.NewHub()
	logger = zap.New(zapcore.NewTee(logger.Core(), logbuffer.NewZapCore(hub)),
		zap.WithCaller(false))

	// Initialize Echo
	e := echo.New()
	e.HideBanner = true

	// Middleware
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())

	// ── CORS ──────────────────────────────────────────────────────────────────
	allowedOrigins := cfg.AllowedOrigins
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"*"}
	}
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: allowedOrigins,
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, "X-Request-ID"},
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
	// Keyed by "user:<user_id>" for authenticated requests, "ip:<ip>" otherwise.
	// This prevents shared-IP users (office, cloud) from blocking each other.
	e.Use(middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Store: middleware.NewRateLimiterMemoryStoreWithConfig(
			middleware.RateLimiterMemoryStoreConfig{
				Rate:      100,          // requests per minute per identity
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

	// Register routes
	h := handler.NewRouter(db, cfg, agentClient, hub, logger)
	h.Register(e)

	// Wire scheduler with notification callbacks.
	// Report generation removed — reports handler was deleted.
	reportFn := func(ctx context.Context, userID, reportType string) error {
		_ = userID
		_ = reportType
		return nil // reports handler removed
	}

	// Build the notification dispatcher.
	// To add a new platform (Discord, Slack, …) register a new Notifier here.
	dispatcher := notification.NewDispatcher(db, logger,
		notification.NewTelegramNotifier(db, cfg.EncryptionKey, logger),
	)
	notifyFn := func(ctx context.Context, userID, notifType, message string) error {
		return dispatcher.Dispatch(ctx, userID, notifType, message)
	}

	sched := scheduler.New(db, logger, reportFn, notifyFn)

	return &Server{
		echo:        e,
		config:      cfg,
		logger:      logger,
		agentClient: agentClient,
		router:      h,
		scheduler:   sched,
	}, nil
}

func (s *Server) Run(ctx context.Context) error {
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
	if rows, err := s.router.DB().QueryContext(ctx,
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
