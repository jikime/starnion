package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jikime/jiki/gateway/internal/handler"
	"github.com/jikime/jiki/gateway/internal/middleware"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
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

	// Graceful shutdown
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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("server forced shutdown")
	}

	log.Info().Msg("server stopped")
}
