// Package scheduler executes time-based cron jobs for all users.
//
// Two job categories are handled:
//   - System jobs (BuiltinJobs): hardcoded schedules that run for every user
//     who has not explicitly disabled them via preferences.scheduler.disabled_jobs.
//   - User schedules: stored as JSON in knowledge_base under keys "schedule:<uuid>".
//
// Actions:
//   - "notify": calls NotifyFunc with a static message.
//   - "smart_notify": runs user-specific DB logic, then calls NotifyFunc with a dynamic message.
//   - "maintenance": runs background DB cleanup with no user notification.
//
// ── Intentional best-effort Scan pattern ──────────────────────────────────
// Many QueryRowContext(...).Scan(&v) call sites in this file deliberately
// ignore the returned error. These are "metric fallback" queries — when no
// row matches, the zero value (0, "", empty slice) is the correct fallback
// and the caller is a best-effort notification builder that should not
// abort on a missing metric. A real DB failure is caught by the next tick
// (scheduler runs every minute) and notification-dedup prevents double-fire.
// Do NOT wrap these Scans in `if err != nil` without deciding what the
// fallback should be — adding error logging here only adds noise.
package scheduler

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// ── Connect Phase 2 narrow ports ────────────────────────────────────
//
// The scheduler intentionally talks to the Connect feature through
// these tiny interfaces rather than importing the connect usecase or
// connectingest package directly. Keeping the dependency direction one
// way (usecase + ingestor satisfy the port; scheduler holds the port)
// avoids any import cycle and makes it trivial to fake the ports in
// scheduler_test.go.

// ConnectIngester is satisfied by *connectingest.Ingestor.
type ConnectIngester interface {
	RunForUser(ctx context.Context, userID uuid.UUID) (int, error)
}

// ConnectScorer is satisfied by *connectusecase.UseCase.
type ConnectScorer interface {
	RecomputeScoresForUser(ctx context.Context, userID uuid.UUID) (int, error)
}

// ConnectReminders is satisfied by *connectusecase.UseCase.
type ConnectReminders interface {
	ListReminders(ctx context.Context, userID uuid.UUID) ([]entity.DriftingConnection, error)
}

// NotifyFunc inserts a notification row for the given user.
type NotifyFunc func(ctx context.Context, userID string, notifType string, message string) error

// Scheduler dispatches timed jobs for all users.
//
// System jobs run on a fixed 1-minute ticker.
// User schedules are event-driven: each entry stores a pre-computed UTC
// next_fire_at timestamp; the scheduler sleeps until the earliest one and
// wakes only when work is due or the schedule list changes.
type Scheduler struct {
	db       *database.DB
	logger   *zap.Logger
	notifyFn NotifyFunc
	wakeC    chan struct{} // buffered(1): signals schedule list changed

	naverClientID     string
	naverClientSecret string
	encryptionKey     string

	googleClientID     string
	googleClientSecret string

	// Connect Phase 2 — wired post-construction in bootstrap. Nil-safe:
	// the per-job dispatch checks for nil before invoking, so a build
	// without these wired (e.g. an isolated test) just skips the jobs.
	connectIngester  ConnectIngester
	connectScorer    ConnectScorer
	connectReminders ConnectReminders
}

// maxConcurrentDispatches caps how many scheduler jobs may run in
// parallel across all users and all tick sources. The old "bare go
// func" model allowed unbounded fan-out which could spike to thousands
// of concurrent goroutines during peak hours (e.g. 21:00 daily digests).
const maxConcurrentDispatches = 64

// schedulerWorkerSem is a counting semaphore implemented as a buffered
// channel. Every scheduler worker goroutine must acquire a slot before
// running and release it on exit.
var schedulerWorkerSem = make(chan struct{}, maxConcurrentDispatches)

// externalHTTPClient is the package-level HTTP client used for every
// outbound Naver / Tavily / Google / wttr.in call. A shared client with a
// tuned Transport keeps TLS sessions and TCP connections warm so scheduler
// ticks don't pay the handshake cost on every external API hit.
// Per-request deadlines are enforced via context, not a Client.Timeout,
// so the same client can host short (10s) and long (15s) requests.
var externalHTTPClient = &http.Client{
	Transport: &http.Transport{
		MaxIdleConns:        32,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 5 * time.Second,
		ForceAttemptHTTP2:   true,
	},
}

// doExternalHTTP executes req with the shared client under a per-call
// deadline. Use this instead of `&http.Client{Timeout: ...}` so every
// scheduler outbound call benefits from connection pooling.
func doExternalHTTP(ctx context.Context, req *http.Request, timeout time.Duration) (*http.Response, error) {
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	req = req.WithContext(callCtx)
	resp, err := externalHTTPClient.Do(req)
	if err != nil {
		cancel()
		return nil, err
	}
	// Hook cancel into Body.Close so the caller's `defer resp.Body.Close()`
	// also releases the timeout — keeps call-site code unchanged.
	resp.Body = &cancelOnCloseReader{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}

type cancelOnCloseReader struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c *cancelOnCloseReader) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()
	return err
}

// New creates a Scheduler. Call Start to begin execution.
//
// The scheduler dispatches `notify`, `smart_notify`, and `maintenance`
// actions. The `report` action-type and its `ReportFunc` port were
// removed when the reports HTTP handler was deleted — the old wiring
// was a silent no-op that still paid per-tick DB + goroutine cost.
func New(db *database.DB, logger *zap.Logger, nf NotifyFunc) *Scheduler {
	return &Scheduler{
		db:       db,
		logger:   logger,
		notifyFn: nf,
		wakeC:    make(chan struct{}, 1),
	}
}

// SetNaverCredentials configures the global (server-level) Naver Search API credentials
// used as fallback when a user has not set their own credentials in integration_keys.
func (s *Scheduler) SetNaverCredentials(clientID, clientSecret string) {
	s.naverClientID = clientID
	s.naverClientSecret = clientSecret
}

// SetEncryptionKey sets the key used to decrypt API keys stored in integration_keys.
func (s *Scheduler) SetEncryptionKey(key string) {
	s.encryptionKey = key
}

// SetGoogleCredentials configures the Google OAuth client ID/secret used for
// token refresh when a stored access_token has expired.
func (s *Scheduler) SetGoogleCredentials(clientID, clientSecret string) {
	s.googleClientID = clientID
	s.googleClientSecret = clientSecret
}

// SetConnectPhase2 wires the Phase 2 Connect dependencies. Bootstrap
// constructs the ingestor + connect usecase first and passes them in
// here. Pass nil for any port to leave the corresponding job a no-op
// (used by tests and by environments where Phase 2 is intentionally
// disabled).
func (s *Scheduler) SetConnectPhase2(
	ingester ConnectIngester,
	scorer ConnectScorer,
	reminders ConnectReminders,
) {
	s.connectIngester = ingester
	s.connectScorer = scorer
	s.connectReminders = reminders
}

// Wake signals the scheduler to reload schedules and re-arm the user timer.
// Safe to call from any goroutine; drops the signal if one is already queued.
func (s *Scheduler) Wake() {
	select {
	case s.wakeC <- struct{}{}:
	default:
	}
}

// Start launches the background goroutine. It returns immediately.
func (s *Scheduler) Start(ctx context.Context) {
	go s.run(ctx)
}

func (s *Scheduler) run(ctx context.Context) {
	s.logger.Info("scheduler: started")

	// System jobs: fixed 1-minute ticker (cron expressions evaluated server-side in UTC).
	s.runSystemJobs(ctx, time.Now())
	sysTicker := time.NewTicker(time.Minute)
	defer sysTicker.Stop()

	// User schedules: event-driven — fire immediately to initialise next_fire_at values.
	userTimer := time.NewTimer(0)
	defer userTimer.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("scheduler: stopped")
			return

		case <-sysTicker.C:
			s.runSystemJobs(ctx, time.Now())

		case <-userTimer.C:
			next := s.runAndArmUserSchedules(ctx)
			userTimer.Reset(s.nextUserTimerDelay(next))

		case <-s.wakeC:
			// Schedule list changed (created/updated/deleted) — re-arm immediately.
			if !userTimer.Stop() {
				select {
				case <-userTimer.C:
				default:
				}
			}
			userTimer.Reset(0)
		}
	}
}

// nextUserTimerDelay returns how long to sleep before the next user-schedule check.
// Uses a 5-minute safety-net when no schedules are pending.
func (s *Scheduler) nextUserTimerDelay(nextFireAt time.Time) time.Duration {
	const maxDelay = 5 * time.Minute
	if nextFireAt.IsZero() {
		return maxDelay
	}
	d := time.Until(nextFireAt)
	if d < 0 {
		d = 0
	}
	return d
}

// ── Cron Expression Parser ────────────────────────────────────────────────────
//
// Supports standard 5-field cron: minute hour dom month dow
// Fields: * (any), N (exact), N-M (range), */N (step), A,B,... (list)

func matchCron(expr string, t time.Time) bool {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return false
	}
	return matchField(parts[0], t.Minute()) &&
		matchField(parts[1], t.Hour()) &&
		matchField(parts[2], t.Day()) &&
		matchField(parts[3], int(t.Month())) &&
		matchField(parts[4], int(t.Weekday()))
}

func matchField(field string, val int) bool {
	if field == "*" {
		return true
	}
	// Step: */N
	if strings.HasPrefix(field, "*/") {
		if step, err := strconv.Atoi(field[2:]); err == nil && step > 0 {
			return val%step == 0
		}
		return false
	}
	// Comma-separated list
	for part := range strings.SplitSeq(field, ",") {
		part = strings.TrimSpace(part)
		// Range: N-M
		if idx := strings.Index(part, "-"); idx > 0 {
			lo, err1 := strconv.Atoi(part[:idx])
			hi, err2 := strconv.Atoi(part[idx+1:])
			if err1 == nil && err2 == nil && val >= lo && val <= hi {
				return true
			}
			continue
		}
		// Exact
		if n, err := strconv.Atoi(part); err == nil && n == val {
			return true
		}
	}
	return false
}
