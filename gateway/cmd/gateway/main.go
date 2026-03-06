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

	starpionv1 "github.com/jikime/starpion/gateway/gen/starpion/v1"
	"github.com/jikime/starpion/gateway/internal/activity"
	"github.com/jikime/starpion/gateway/internal/auth"
	"github.com/jikime/starpion/gateway/internal/handler"
	"github.com/jikime/starpion/gateway/internal/identity"
	"github.com/jikime/starpion/gateway/internal/logbuf"
	"github.com/jikime/starpion/gateway/internal/middleware"
	"github.com/jikime/starpion/gateway/internal/scheduler"
	"github.com/jikime/starpion/gateway/internal/skill"
	"github.com/jikime/starpion/gateway/internal/storage"
	"github.com/jikime/starpion/gateway/internal/telegram"
	"github.com/jikime/starpion/gateway/internal/wschat"
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
	Auth struct {
		JWTSecret string `yaml:"jwt_secret"`
	} `yaml:"auth"`
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
	if secret := os.Getenv("JWT_SECRET"); secret != "" {
		cfg.Auth.JWTSecret = secret
	}

	return &cfg, nil
}

// logBuf is the global in-memory log buffer shared across the process.
var logBuf = logbuf.New()

func setupLogger(cfg *Config) {
	zerolog.TimeFieldFormat = time.RFC3339

	level, err := zerolog.ParseLevel(cfg.Log.Level)
	if err != nil {
		level = zerolog.DebugLevel
	}
	zerolog.SetGlobalLevel(level)

	if cfg.Log.Format != "json" {
		console := zerolog.ConsoleWriter{Out: os.Stderr}
		log.Logger = log.Output(zerolog.MultiLevelWriter(console, logBuf))
	} else {
		log.Logger = log.Output(zerolog.MultiLevelWriter(os.Stderr, logBuf))
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

	// Derive JWT secret: prefer env, fall back to config, then a default for dev.
	jwtSecret := cfg.Auth.JWTSecret
	if jwtSecret == "" {
		jwtSecret = "change-me-in-production"
		log.Warn().Msg("JWT_SECRET not set, using insecure default (dev only)")
	}
	authSvc := auth.NewService(jwtSecret)

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

	// Create identity service for platform-agnostic user resolution.
	var identitySvc *identity.Service
	if db != nil {
		identitySvc = identity.New(db)
	}

	// Initialise MinIO for file storage (non-fatal if unavailable).
	var minioStore *storage.MinIO
	if s, err := storage.NewMinIO(); err != nil {
		log.Warn().Err(err).Msg("MinIO unavailable — file uploads disabled")
	} else {
		minioStore = s
	}

	// Create WebSocket hub for web chat.
	wsHub := wschat.NewHub(starpionv1.NewAgentServiceClient(grpcConn), db, minioStore)

	// Start per-user Telegram bot pool.
	// Pass the gateway root context so bot goroutines live for the process lifetime.
	botManager := telegram.NewBotManager(ctx, grpcConn, tracker, db, minioStore, skillSvc, identitySvc)
	botManager.ReloadAll()

	// Start cron scheduler (no single global bot — scheduler uses BotManager).
	var sched *scheduler.Scheduler

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

	// Credential registration — creates a new user account with email + password.
	// POST /auth/register → { "userId": "...", "email": "...", "name": "..." }
	e.POST("/auth/register", func(c echo.Context) error {
		if db == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		}
		var req struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
		}
		if req.Email == "" || req.Password == "" || req.Name == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "name, email and password are required"})
		}

		user, err := auth.Register(db, req.Name, req.Email, req.Password)
		if err != nil {
			if err == auth.ErrEmailTaken {
				return c.JSON(http.StatusConflict, map[string]string{"error": "email already registered"})
			}
			log.Error().Err(err).Str("email", req.Email).Msg("register failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "registration failed"})
		}

		log.Info().Str("user_id", user.UserID).Str("email", user.Email).Msg("new credential user registered")
		return c.JSON(http.StatusCreated, map[string]string{
			"userId": user.UserID,
			"email":  user.Email,
			"name":   user.Name,
		})
	})

	// Credential login — verifies email + password, returns user info for session creation.
	// POST /auth/login → { "userId": "...", "email": "...", "name": "..." }
	e.POST("/auth/login", func(c echo.Context) error {
		if db == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		}
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
		}
		if req.Email == "" || req.Password == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		}

		user, err := auth.Login(db, req.Email, req.Password)
		if err != nil {
			if err == auth.ErrInvalidCreds {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
			}
			log.Error().Err(err).Str("email", req.Email).Msg("login failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "login failed"})
		}

		return c.JSON(http.StatusOK, map[string]string{
			"userId": user.UserID,
			"email":  user.Email,
			"name":   user.Name,
		})
	})

	// Account linking — merges a credential web account into an existing platform account.
	// Requires a valid JWT (web user session) and a link code generated by the target account.
	// POST /auth/link  Body: { "code": "JIKI-XXXXXX" }
	//                  Response: { "userId": "<canonical-uuid>" }
	e.POST("/auth/link", func(c echo.Context) error {
		if db == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		}
		if identitySvc == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "identity service unavailable"})
		}

		// Validate JWT to get the calling user's ID.
		tokenStr := ""
		if h := c.Request().Header.Get("Authorization"); len(h) > 7 {
			tokenStr = h[7:] // strip "Bearer "
		}
		if tokenStr == "" {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
		}

		claims, err := authSvc.ValidateToken(tokenStr)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
		}
		fromUserID := claims.UserID

		var req struct {
			Code string `json:"code"`
		}
		if err := c.Bind(&req); err != nil || req.Code == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
		}

		toUserID, err := identitySvc.MergeAndLink(fromUserID, req.Code)
		if err != nil {
			switch {
			case err.Error() == "invalid link code":
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "잘못된 코드예요"})
			case err.Error() == "link code expired":
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "코드가 만료되었어요"})
			case err.Error() == "cannot link account to itself":
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "이미 연결된 계정이에요"})
			}
			log.Error().Err(err).Str("from_user_id", fromUserID).Msg("account link failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "계정 연결에 실패했어요"})
		}

		log.Info().Str("from", fromUserID).Str("to", toUserID).Msg("account linked")
		return c.JSON(http.StatusOK, map[string]string{"userId": toUserID})
	})

	// Anonymous token endpoint — issues a JWT for web users without a prior account.
	// POST /auth/token  → { "token": "<jwt>" }
	// The userID is resolved (or created) via identity service using a "web" session key.
	e.POST("/auth/token", func(c echo.Context) error {
		var req struct {
			Platform   string `json:"platform"`    // default "web"
			PlatformID string `json:"platform_id"` // opaque client ID (e.g. device fingerprint)
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
		}
		if req.Platform == "" {
			req.Platform = identity.PlatformWeb
		}
		if req.PlatformID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "platform_id is required"})
		}
		if identitySvc == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "identity service unavailable"})
		}

		userID, err := identitySvc.ResolveUserID(req.Platform, req.PlatformID)
		if err != nil {
			log.Error().Err(err).Str("platform", req.Platform).Msg("token: identity resolve failed")
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "could not resolve user"})
		}

		token, err := authSvc.IssueToken(userID, req.Platform)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "could not issue token"})
		}

		return c.JSON(http.StatusOK, map[string]string{"token": token})
	})

	// WebSocket endpoint.
	wsHandler := handler.NewWebSocketHandler(wsHub, authSvc)
	e.GET("/ws", wsHandler.Connect)

	// API routes
	api := e.Group("/api/v1")

	chatHandler := handler.NewChatHandler(grpcConn)
	api.POST("/chat", chatHandler.Chat)

	// AI SDK-compatible SSE streaming endpoint.
	streamHandler := handler.NewChatStreamHandler(grpcConn, db, minioStore)
	api.POST("/chat/stream", streamHandler.Stream)

	// File upload endpoint (requires MinIO).
	if minioStore != nil {
		uploadHandler := handler.NewUploadHandler(minioStore)
		api.POST("/upload", uploadHandler.Upload)
	}

	// Conversation management (requires DB).
	if db != nil {
		convHandler := handler.NewConversationHandler(db, grpcConn)
		api.GET("/conversations", convHandler.List)
		api.POST("/conversations", convHandler.Create)
		api.PATCH("/conversations/:id", convHandler.UpdateTitle)

		msgHandler := handler.NewMessageHandler(db, grpcConn)
		api.GET("/conversations/:id/messages", msgHandler.List)

		// Profile persona: GET/PATCH /api/v1/profile/persona?user_id=<uuid>
		api.GET("/profile/persona", func(c echo.Context) error {
			userID := c.QueryParam("user_id")
			if userID == "" {
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			}
			var persona string
			err := db.QueryRowContext(c.Request().Context(), `
				SELECT COALESCE(preferences->>'persona', 'assistant')
				FROM profiles WHERE uuid_id = $1
			`, userID).Scan(&persona)
			if err != nil {
				persona = "assistant" // default when no profile exists yet
			}
			return c.JSON(http.StatusOK, map[string]string{"persona": persona})
		})

		api.PATCH("/profile/persona", func(c echo.Context) error {
			userID := c.QueryParam("user_id")
			if userID == "" {
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
			}
			var body struct {
				Persona string `json:"persona"`
			}
			if err := c.Bind(&body); err != nil || body.Persona == "" {
				return c.JSON(http.StatusBadRequest, map[string]string{"error": "persona is required"})
			}
			_, err := db.ExecContext(c.Request().Context(), `
				INSERT INTO profiles (uuid_id, preferences)
				VALUES ($1, jsonb_build_object('persona', $2::text))
				ON CONFLICT (uuid_id) DO UPDATE
				SET preferences = jsonb_set(
					COALESCE(profiles.preferences, '{}'::jsonb),
					'{persona}',
					to_jsonb($2::text)
				), updated_at = NOW()
			`, userID, body.Persona)
			if err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("profile: update persona failed")
				return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
			}
			return c.JSON(http.StatusOK, map[string]string{"persona": body.Persona})
		})
	}

	// Google OAuth2 callback.
	if db != nil {
		googleHandler := handler.NewGoogleCallbackHandler(db)
		e.GET("/auth/google/callback", googleHandler.Callback)
		// Telegram OAuth start: short URL with no underscores to avoid Markdown corruption.
		e.GET("/auth/google/telegram", googleHandler.TelegramOAuthStart)

		// Integration management endpoints.
		integrationHandler := handler.NewIntegrationHandler(db)
		api.GET("/integrations/status", integrationHandler.Status)
		api.GET("/integrations/google/auth-url", integrationHandler.GoogleAuthURL)
		api.DELETE("/integrations/google", integrationHandler.GoogleDisconnect)
		api.PUT("/integrations/notion", integrationHandler.NotionConnect)
		api.DELETE("/integrations/notion", integrationHandler.NotionDisconnect)
		api.PUT("/integrations/github", integrationHandler.GitHubConnect)
		api.DELETE("/integrations/github", integrationHandler.GitHubDisconnect)
		api.PUT("/integrations/tavily", integrationHandler.TavilyConnect)
		api.DELETE("/integrations/tavily", integrationHandler.TavilyDisconnect)

		// Skill management endpoints.
		if skillSvc != nil {
			skillHandler := handler.NewSkillHandler(skillSvc)
			api.GET("/skills", skillHandler.List)
			api.POST("/skills/:id/toggle", skillHandler.Toggle)
		}

		// Log streaming endpoints (no auth — accessible from admin UI).
		logsHandler := handler.NewLogsHandler(logBuf)
		api.GET("/logs", logsHandler.List)
		api.GET("/logs/stream", logsHandler.Stream)
		api.GET("/logs/agent", logsHandler.AgentLogsProxy)

		// Budget management endpoints.
		budgetHandler := handler.NewBudgetHandler(db)
		api.GET("/budget", budgetHandler.GetBudget)
		api.PUT("/budget", budgetHandler.UpdateBudget)

		// Finance / ledger endpoints.
		financeHandler := handler.NewFinanceHandler(db)
		api.GET("/finance/summary", financeHandler.GetSummary)
		api.GET("/finance/transactions", financeHandler.ListTransactions)
		api.POST("/finance/transactions", financeHandler.CreateTransaction)
		api.PUT("/finance/transactions/:id", financeHandler.UpdateTransaction)
		api.DELETE("/finance/transactions/:id", financeHandler.DeleteTransaction)

		// Statistics & insights endpoints.
		statsHandler := handler.NewStatisticsHandler(db)
		api.GET("/statistics", statsHandler.GetStatistics)
		api.GET("/statistics/insights", statsHandler.GetInsights)

		// Communication analytics endpoints.
		analyticsHandler := handler.NewAnalyticsHandler(db)
		api.GET("/analytics", analyticsHandler.GetAnalytics)

		// Cron / user schedule endpoints.
		if db != nil {
			cronHandler := handler.NewCronHandler(db)
			api.GET("/cron/system", cronHandler.ListSystemJobs)
			api.GET("/cron/schedules", cronHandler.ListUserSchedules)
			api.POST("/cron/schedules", cronHandler.CreateUserSchedule)
			api.PUT("/cron/schedules/:id", cronHandler.UpdateUserSchedule)
			api.DELETE("/cron/schedules/:id", cronHandler.DeleteUserSchedule)
			api.POST("/cron/schedules/:id/toggle", cronHandler.ToggleUserSchedule)
		}

		// Channel management endpoints (per-user, uses BotManager).
		channelHandler := handler.NewChannelHandler(db, botManager)
		api.GET("/channels/telegram", channelHandler.GetTelegram)
		api.POST("/channels/telegram", channelHandler.UpdateTelegram)
		api.GET("/channels/telegram/pairing", channelHandler.ListPairing)
		api.POST("/channels/telegram/pairing/:id/approve", channelHandler.ApprovePairing)
		api.POST("/channels/telegram/pairing/:id/deny", channelHandler.DenyPairing)

		// Per-user LLM provider and persona management.
		modelsHandler := handler.NewModelsHandler(db)
		api.GET("/providers", modelsHandler.ListProviders)
		api.POST("/providers", modelsHandler.UpsertProvider)
		api.POST("/providers/validate", modelsHandler.ValidateProvider)
		api.DELETE("/providers/:provider", modelsHandler.DeleteProvider)
		api.GET("/personas", modelsHandler.ListPersonas)
		api.POST("/personas", modelsHandler.CreatePersona)
		api.PUT("/personas/:id", modelsHandler.UpdatePersona)
		api.DELETE("/personas/:id", modelsHandler.DeletePersona)

		// Diary / journal endpoints.
		diaryHandler := handler.NewDiaryHandler(db)
		api.GET("/diary/entries", diaryHandler.ListEntries)
		api.POST("/diary/entries", diaryHandler.CreateEntry)
		api.GET("/diary/entries/:id", diaryHandler.GetEntry)
		api.PUT("/diary/entries/:id", diaryHandler.UpdateEntry)
		api.DELETE("/diary/entries/:id", diaryHandler.DeleteEntry)

		// Goals management endpoints.
		goalsHandler := handler.NewGoalsHandler(db)
		api.GET("/goals", goalsHandler.ListGoals)
		api.POST("/goals", goalsHandler.CreateGoal)
		api.GET("/goals/:id", goalsHandler.GetGoal)
		api.PUT("/goals/:id", goalsHandler.UpdateGoal)
		api.DELETE("/goals/:id", goalsHandler.DeleteGoal)
		api.POST("/goals/:id/checkin", goalsHandler.AddCheckin)
		api.DELETE("/goals/:id/checkin", goalsHandler.RemoveCheckin)

		// Memo endpoints.
		memoHandler := handler.NewMemoHandler(db)
		api.GET("/memos", memoHandler.ListMemos)
		api.POST("/memos", memoHandler.CreateMemo)
		api.PUT("/memos/:id", memoHandler.UpdateMemo)
		api.DELETE("/memos/:id", memoHandler.DeleteMemo)

		// D-Day endpoints.
		ddayHandler := handler.NewDdayHandler(db)
		api.GET("/ddays", ddayHandler.ListDdays)
		api.POST("/ddays", ddayHandler.CreateDday)
		api.PUT("/ddays/:id", ddayHandler.UpdateDday)
		api.DELETE("/ddays/:id", ddayHandler.DeleteDday)

		// Report endpoints.
		reportHandler := handler.NewReportHandler(db, grpcConn)
		api.GET("/reports", reportHandler.ListReports)
		api.GET("/reports/:id", reportHandler.GetReport)
		api.POST("/reports/generate", reportHandler.GenerateReport)

		// Document endpoints.
		// The agent's log HTTP server (port 8082) also handles POST /index-document.
		agentHTTPURL := fmt.Sprintf("http://%s:8082", cfg.GRPC.AgentService.Host)
		documentHandler := handler.NewDocumentHandler(db, minioStore, agentHTTPURL)
		api.GET("/documents", documentHandler.ListDocuments)
		api.POST("/documents", documentHandler.UploadDocument)
		api.DELETE("/documents/:id", documentHandler.DeleteDocument)
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
