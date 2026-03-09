package telegram

import (
	"context"
	"database/sql"
	"fmt"
	"hash/fnv"
	"sync"
	"time"

	"github.com/jikime/starnion/gateway/internal/activity"
	"github.com/jikime/starnion/gateway/internal/identity"
	"github.com/jikime/starnion/gateway/internal/skill"
	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// managedBot holds a running Bot along with its cancellation function.
type managedBot struct {
	bot      *Bot
	cancel   context.CancelFunc
	done     chan struct{} // closed when bot.Run() returns
	lockConn *sql.Conn    // dedicated DB connection holding pg_advisory_lock; nil if no DB
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

// advisoryLockID maps a userID string to a stable int64 PostgreSQL advisory-lock key.
func advisoryLockID(userID string) int64 {
	h := fnv.New64a()
	h.Write([]byte("starnion_telegram:" + userID))
	return int64(h.Sum64())
}

// StartBot starts a Telegram bot for the given user.
// If the user already has a running bot it is stopped first (token rotation).
// Uses a PostgreSQL advisory lock on a dedicated connection so that only one
// gateway instance can poll a given bot token at a time — prevents 409 Conflict
// when two gateway processes (e.g. Docker + local dev) share the same DB.
func (m *BotManager) StartBot(_ context.Context, userID, token string) error {
	m.StopBot(userID)

	bot, err := NewBot(token, userID, m.grpcConn, m.tracker, m.db, m.store, m.skillSvc, m.identitySvc)
	if err != nil {
		return fmt.Errorf("BotManager StartBot user=%s: %w", userID, err)
	}

	// Acquire a PostgreSQL session-level advisory lock on a dedicated connection.
	// The lock is released automatically when the connection is closed (either
	// explicitly in the goroutine or when the gateway process dies).
	// pg_try_advisory_lock returns false (non-blocking) if another session holds it,
	// which means another gateway instance is already polling this bot.
	var lockConn *sql.Conn
	if m.db != nil {
		conn, err := m.db.Conn(context.Background())
		if err != nil {
			return fmt.Errorf("BotManager StartBot: get DB conn user=%s: %w", userID, err)
		}
		var acquired bool
		if err := conn.QueryRowContext(context.Background(),
			"SELECT pg_try_advisory_lock($1)", advisoryLockID(userID),
		).Scan(&acquired); err != nil {
			_ = conn.Close()
			return fmt.Errorf("BotManager StartBot: advisory lock query user=%s: %w", userID, err)
		}
		if !acquired {
			_ = conn.Close()
			return fmt.Errorf("another gateway instance is already polling the Telegram bot for user %s — stop the other instance first", userID)
		}
		lockConn = conn
	}

	// Always derive from rootCtx so the bot lives for the gateway's lifetime,
	// independent of the HTTP request context that triggered StartBot.
	botCtx, cancel := context.WithCancel(m.rootCtx)
	done := make(chan struct{})
	m.mu.Lock()
	m.bots[userID] = &managedBot{bot: bot, cancel: cancel, done: done, lockConn: lockConn}
	m.mu.Unlock()

	go func() {
		// Defer order (LIFO): close(done) last, lockConn.Close() first.
		// StopBot waits on <-done; we must release the advisory lock BEFORE
		// signalling done, otherwise the next StartBot call (which runs
		// immediately after StopBot returns) will find the lock still held,
		// pg_try_advisory_lock returns false, and the bot is never added to
		// the bots map → IsRunning() == false → UI shows "중지됨".
		defer close(done) // executed LAST (deferred first = runs last in LIFO)
		defer func() {    // executed FIRST (deferred second = runs first in LIFO)
			if lockConn != nil {
				_ = lockConn.Close()
			}
		}()
		bot.Run(botCtx)
	}()
	log.Info().Str("user_id", userID).Msg("BotManager: bot started")
	return nil
}

// StopBot stops the running bot for userID (no-op if none).
// It waits for the bot goroutine to fully exit (up to 7 seconds) so that
// the advisory lock is released and the next StartBot call is safe.
func (m *BotManager) StopBot(userID string) {
	m.mu.Lock()
	mb, ok := m.bots[userID]
	if ok {
		delete(m.bots, userID)
	}
	m.mu.Unlock()

	if ok {
		mb.cancel()
		// Wait for the goroutine to fully terminate (and release the advisory lock).
		// Timeout is Timeout(5s) + 2s buffer = 7s.
		select {
		case <-mb.done:
		case <-time.After(7 * time.Second):
			log.Warn().Str("user_id", userID).Msg("BotManager: bot stop timed out after 7s")
			// Force-close the lock connection on timeout to release the advisory lock.
			if mb.lockConn != nil {
				_ = mb.lockConn.Close()
			}
		}
		log.Info().Str("user_id", userID).Msg("BotManager: bot stopped")
	}
}

// IsRunning reports whether a bot is currently running in memory for userID.
func (m *BotManager) IsRunning(userID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.bots[userID]
	return ok
}

// ReloadAll loads all enabled bots from the database and starts them.
// Called once at gateway startup to restore running bots after a restart.
// If another gateway instance already holds the advisory lock for a bot,
// StartBot returns an error and that bot is skipped (logged as a warning).
func (m *BotManager) ReloadAll() {
	if m.db == nil {
		log.Warn().Msg("BotManager: no DB, skipping ReloadAll")
		return
	}

	rows, err := m.db.QueryContext(m.rootCtx, `
		SELECT user_id, bot_token
		FROM channel_settings
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
			log.Warn().Err(err).Str("user_id", userID).Msg("BotManager: skipping bot on reload (another instance may be running it)")
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
