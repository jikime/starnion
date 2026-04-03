package telegram

import (
	"context"
	"sync"

	"go.uber.org/zap"
)

// BotManager manages dynamic poller instances keyed by bot token.
type BotManager struct {
	mu      sync.Mutex
	started map[string]context.CancelFunc
	baseCtx context.Context
	logger  *zap.Logger
	handler MessageHandler
}

// NewBotManager creates a BotManager. handler is called for every incoming message.
func NewBotManager(ctx context.Context, logger *zap.Logger, handler MessageHandler) *BotManager {
	return &BotManager{
		started: make(map[string]context.CancelFunc),
		baseCtx: ctx,
		logger:  logger,
		handler: handler,
	}
}

// EnsurePoller starts a poller for the given token if not already running.
func (bm *BotManager) EnsurePoller(token string) {
	if token == "" {
		return
	}
	bm.mu.Lock()
	defer bm.mu.Unlock()
	if _, ok := bm.started[token]; ok {
		return
	}
	ctx, cancel := context.WithCancel(bm.baseCtx)
	bm.started[token] = cancel
	poller := NewPoller(token, bm.handler, bm.logger)
	go poller.Run(ctx)
	prefix := token
	if len(prefix) > 10 {
		prefix = prefix[:10] + "..."
	}
	bm.logger.Info("Telegram poller started (dynamic)", zap.String("token_prefix", prefix))
}

// StopPoller stops the poller for the given token.
func (bm *BotManager) StopPoller(token string) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	if cancel, ok := bm.started[token]; ok {
		cancel()
		delete(bm.started, token)
	}
}
