package telegram

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"github.com/jikime/starpion/gateway/internal/activity"
	"github.com/jikime/starpion/gateway/internal/identity"
	"github.com/jikime/starpion/gateway/internal/skill"
	"github.com/jikime/starpion/gateway/internal/storage"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// managedBot holds a running Bot along with its cancellation function.
type managedBot struct {
	bot    *Bot
	cancel context.CancelFunc
}

// BotManager maintains a pool of per-user Telegram bots.
// Each user can register their own bot token; BotManager starts/stops goroutines
// dynamically without requiring a server restart.
type BotManager struct {
	mu      sync.RWMutex
	bots    map[string]*managedBot // key: userID
	rootCtx context.Context        // gateway lifetime context; bot goroutines derive from this

	// Dependencies forwarded to every Bot instance.
	grpcConn    *grpc.ClientConn
	tracker     *activity.Tracker
	db          *sql.DB
	store       *storage.MinIO
	skillSvc    *skill.Service
	identitySvc *identity.Service
}

// NewBotManager creates a BotManager.
// rootCtx should be the gateway's main context (cancelled on shutdown).
func NewBotManager(
	rootCtx context.Context,
	grpcConn *grpc.ClientConn,
	tracker *activity.Tracker,
	db *sql.DB,
	store *storage.MinIO,
	skillSvc *skill.Service,
	identitySvc *identity.Service,
) *BotManager {
	return &BotManager{
		bots:        make(map[string]*managedBot),
		rootCtx:     rootCtx,
		grpcConn:    grpcConn,
		tracker:     tracker,
		db:          db,
		store:       store,
		skillSvc:    skillSvc,
		identitySvc: identitySvc,
	}
}

// StartBot starts a Telegram bot for the given user.
// If the user already has a running bot it is stopped first (token rotation).
// Bot goroutine always uses rootCtx — never a short-lived request context.
func (m *BotManager) StartBot(_ context.Context, userID, token string) error {
	m.StopBot(userID)

	bot, err := NewBot(token, userID, m.grpcConn, m.tracker, m.db, m.store, m.skillSvc, m.identitySvc)
	if err != nil {
		return fmt.Errorf("BotManager StartBot user=%s: %w", userID, err)
	}

	// Always derive from rootCtx so the bot lives for the gateway's lifetime,
	// independent of the HTTP request context that triggered StartBot.
	botCtx, cancel := context.WithCancel(m.rootCtx)
	m.mu.Lock()
	m.bots[userID] = &managedBot{bot: bot, cancel: cancel}
	m.mu.Unlock()

	go bot.Run(botCtx)
	log.Info().Str("user_id", userID).Msg("BotManager: bot started")
	return nil
}

// StopBot stops the running bot for userID (no-op if none).
func (m *BotManager) StopBot(userID string) {
	m.mu.Lock()
	mb, ok := m.bots[userID]
	if ok {
		delete(m.bots, userID)
	}
	m.mu.Unlock()

	if ok {
		mb.cancel()
		log.Info().Str("user_id", userID).Msg("BotManager: bot stopped")
	}
}

// ReloadAll loads all enabled bots from the database and starts them.
// Called once at gateway startup to restore running bots after a restart.
func (m *BotManager) ReloadAll() {
	if m.db == nil {
		log.Warn().Msg("BotManager: no DB, skipping ReloadAll")
		return
	}

	rows, err := m.db.QueryContext(m.rootCtx, `
		SELECT user_id, bot_token
		FROM user_channel_settings
		WHERE channel = 'telegram' AND enabled = TRUE AND bot_token != ''
	`)
	if err != nil {
		log.Error().Err(err).Msg("BotManager: ReloadAll query failed")
		return
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var userID, token string
		if err := rows.Scan(&userID, &token); err != nil {
			log.Warn().Err(err).Msg("BotManager: ReloadAll scan failed")
			continue
		}
		if err := m.StartBot(m.rootCtx, userID, token); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("BotManager: failed to start bot on reload")
			continue
		}
		count++
	}
	log.Info().Int("count", count).Msg("BotManager: ReloadAll complete")
}

// ActiveCount returns the number of currently running bots.
func (m *BotManager) ActiveCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.bots)
}
