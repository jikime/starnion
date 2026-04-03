package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/newstarnion/gateway/internal/infrastructure/server"
	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Initialize and run server
	srv, err := server.New(logger)
	if err != nil {
		logger.Fatal("Failed to initialize server", zap.Error(err))
	}

	// Graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		logger.Info("Shutting down server...")
		cancel()
	}()

	if err := srv.Run(ctx); err != nil {
		logger.Fatal("Server error", zap.Error(err))
	}
}
