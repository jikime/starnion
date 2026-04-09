package telegram

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

// MessageHandler is called for each incoming text message.
type MessageHandler func(ctx context.Context, update Update)

type ctxKeyBotToken struct{}

// WithBotToken stores the bot token in the context.
func WithBotToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, ctxKeyBotToken{}, token)
}

// BotTokenFromContext extracts the bot token from the context.
func BotTokenFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyBotToken{}).(string); ok {
		return v
	}
	return ""
}

// maxHandlerConcurrency limits simultaneous message handler goroutines per poller.
const maxHandlerConcurrency = 20

// Poller runs a long-polling loop against Telegram getUpdates.
type Poller struct {
	client  *Client
	handler MessageHandler
	logger  *zap.Logger
	sem     chan struct{} // semaphore to cap concurrent handlers
	wg      sync.WaitGroup
}

func NewPoller(token string, handler MessageHandler, logger *zap.Logger) *Poller {
	return &Poller{
		client:  NewClient(token),
		handler: handler,
		logger:  logger,
		sem:     make(chan struct{}, maxHandlerConcurrency),
	}
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *Poller) Run(ctx context.Context) {
	// Wait for all in-flight handlers to finish before returning.
	defer p.wg.Wait()

	// Remove any webhook so getUpdates works
	if err := p.client.DeleteWebhook(); err != nil {
		p.logger.Warn("Failed to delete webhook (may not exist)", zap.Error(err))
	}

	var offset int64
	p.logger.Info("Telegram polling started")

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("Telegram polling stopped")
			return
		default:
		}

		updates, err := p.client.GetUpdates(offset, 25)
		if err != nil {
			if IsPermanentError(err) {
				p.logger.Error("getUpdates permanent error — stopping poller", zap.Error(err))
				return
			}
			p.logger.Warn("getUpdates error", zap.Error(err))
			select {
			case <-time.After(3 * time.Second):
			case <-ctx.Done():
				return
			}
			continue
		}

		for _, upd := range updates {
			offset = upd.UpdateID + 1

			if upd.Message == nil || upd.Message.From == nil || upd.Message.Chat == nil {
				continue
			}
			// Skip only if there is truly no content (no text, no photo, no voice)
			if upd.Message.Text == "" && len(upd.Message.Photo) == 0 && upd.Message.Voice == nil {
				continue
			}

			// Acquire semaphore slot; drop message if at capacity to avoid goroutine accumulation.
			select {
			case p.sem <- struct{}{}:
			default:
				p.logger.Warn("telegram handler at capacity, dropping message",
					zap.Int64("update_id", upd.UpdateID))
				continue
			}
			p.wg.Add(1)
			go func(u Update) {
				defer p.wg.Done()
				defer func() { <-p.sem }()
				// Inject the bot token so the handler knows which token this poller uses.
				tokenCtx := WithBotToken(ctx, p.client.token)
				p.handler(tokenCtx, u)
			}(upd)
		}
	}
}
