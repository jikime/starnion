package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jikime/jiki/gateway/internal/activity"
	"github.com/jikime/jiki/gateway/internal/handler"
	"github.com/jikime/jiki/gateway/internal/middleware"
	"github.com/jikime/jiki/gateway/internal/scheduler"
	"github.com/jikime/jiki/gateway/internal/skill"
	"github.com/jikime/jiki/gateway/internal/telegram"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		Host string `yaml:"host"`
		Port int    `yaml:"port"`
	} `yaml:"server"`
	GRPC struct {
		AgentService struct {
			Host string `yaml:"host"`
			Port int    `yaml:"port"`
		} `yaml:"agent_service"`
	} `yaml:"grpc"`
	Database struct {
		URL string `yaml:"url"`
	} `yaml:"database"`
	Telegram struct {
		BotToken string `yaml:"bot_token"`
		Enabled  bool   `yaml:"enabled"`
	} `yaml:"telegram"`
	CORS struct {
		AllowedOrigins []string `yaml:"allowed_origins"`
		AllowedMethods []string `yaml:"allowed_methods"`
		AllowedHeaders []string `yaml:"allowed_headers"`
	} `yaml:"cors"`
	Log struct {
		Level  string `yaml:"level"`
		Format string `yaml:"format"`
	} `yaml:"log"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Allow environment variable overrides.
	if token := os.Getenv("TELEGRAM_BOT_TOKEN"); token != "" {
		cfg.Telegram.BotToken = token
		cfg.Telegram.Enabled = true
	}
	if host := os.Getenv("GRPC_AGENT_HOST"); host != "" {
		cfg.GRPC.AgentService.Host = host
	}
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		cfg.Database.URL = dbURL
	}

	return &cfg, nil
}

func setupLogger(cfg *Config) {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	level, err := zerolog.ParseLevel(cfg.Log.Level)
	if err != nil {
		level = zerolog.DebugLevel
	}
	zerolog.SetGlobalLevel(level)

	if cfg.Log.Format != "json" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}
}

func connectGRPC(cfg *Config) (*grpc.ClientConn, error) {
	addr := fmt.Sprintf("%s:%d", cfg.GRPC.AgentService.Host, cfg.GRPC.AgentService.Port)

	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", addr, err)
	}

	log.Info().Str("addr", addr).Msg("gRPC client connection configured")
	return conn, nil
}

func main() {
	// Load root .env (fallback to ../env if gateway is run from gateway/).
	_ = godotenv.Load("../.env", ".env")

	cfg, err := loadConfig("config.yaml")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	setupLogger(cfg)

	grpcConn, err := connectGRPC(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to configure gRPC connection")
	}
	defer grpcConn.Close()

	// Connect to database for scheduler queries.
	var db *sql.DB
	if cfg.Database.URL != "" {
		var dbErr error
		db, dbErr = sql.Open("postgres", cfg.Database.URL)
		if dbErr != nil {
			log.Fatal().Err(dbErr).Msg("failed to open database")
		}
		defer db.Close()

		if err := db.Ping(); err != nil {
			log.Warn().Err(err).Msg("database ping failed (scheduler may not work)")
		} else {
			log.Info().Msg("database connected for scheduler")
		}
	}

	// Global context for graceful shutdown.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create shared activity tracker for conversation-aware notifications.
	tracker := activity.NewTracker()

	// Create skill service for per-user feature management.
	var skillSvc *skill.Service
	if db != nil {
		skillSvc = skill.New(db)
	}

	// Start Telegram bot if enabled, and attach scheduler.
	var sched *scheduler.Scheduler
	if cfg.Telegram.Enabled && cfg.Telegram.BotToken != "" {
		bot, botErr := telegram.NewBot(cfg.Telegram.BotToken, grpcConn, tracker, db, skillSvc)
		if botErr != nil {
			log.Fatal().Err(botErr).Msg("failed to initialise Telegram bot")
		}
		go bot.Run(ctx)

		// Start cron scheduler for proactive notifications.
		sched = scheduler.New(grpcConn, bot, db, tracker, skillSvc)
		sched.Start()
		defer sched.Stop()
	} else {
		log.Warn().Msg("Telegram bot disabled (no token provided)")
	}

	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	// Middleware
	e.Use(echomw.RequestID())
	e.Use(echomw.Recover())
	e.Use(middleware.CORSConfig(cfg.CORS.AllowedOrigins, cfg.CORS.AllowedMethods, cfg.CORS.AllowedHeaders))

	// Health check
	e.GET("/healthz", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	// API routes
	api := e.Group("/api/v1")

	chatHandler := handler.NewChatHandler(grpcConn)
	api.POST("/chat", chatHandler.Chat)

	// Google OAuth2 callback.
	if db != nil {
		googleHandler := handler.NewGoogleCallbackHandler(db)
		e.GET("/auth/google/callback", googleHandler.Callback)
	}

	// Manual report trigger for testing proactive notifications.
	// POST /api/v1/report { "user_id": "12345", "chat_id": 12345, "report_type": "weekly" }
	api.POST("/report", func(c echo.Context) error {
		if sched == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{
				"error": "scheduler not available (telegram bot disabled)",
			})
		}

		var req struct {
			UserID     string `json:"user_id"`
			ChatID     int64  `json:"chat_id"`
			ReportType string `json:"report_type"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
		}
		if req.UserID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
		}
		if req.ReportType == "" {
			req.ReportType = "weekly"
		}
		// If chat_id not provided, use user_id as chat_id (DM).
		if req.ChatID == 0 {
			if parsed, err := strconv.ParseInt(req.UserID, 10, 64); err == nil {
				req.ChatID = parsed
			}
		}

		if err := sched.GenerateAndSendType(req.UserID, req.ChatID, req.ReportType); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}

		return c.JSON(http.StatusOK, map[string]string{
			"status":      "sent",
			"user_id":     req.UserID,
			"report_type": req.ReportType,
		})
	})

	// Start HTTP server.
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	go func() {
		log.Info().Str("addr", addr).Msg("starting gateway server")
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server")
	cancel() // Stop Telegram bot.

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("server forced shutdown")
	}

	log.Info().Msg("server stopped")
}
