// Package connectingest implements the Phase 2 Connect activity
// ingestor (UC-201). It scans the user's Gmail and Google Calendar via
// raw HTTP — no `google.golang.org/api/*` imports, since those packages
// drag in ~30 transitive deps and the surface we use is tiny — matches
// the events to existing connections by email address, applies a
// handful of spam filters and weight decays, and batch-INSERTs the
// result into `connection_activities` via the connection repository's
// `IngestActivities` method (which uses ON CONFLICT DO NOTHING for
// idempotency).
//
// The package is a separate infrastructure layer rather than living
// inside the connect usecase because it is the only part of the
// Connect feature that talks to a third-party HTTP service. Keeping it
// here lets the usecase package stay free of net/http and JSON.
//
// Wire-up: bootstrap constructs an Ingestor with the integrations
// usecase (for the OAuth token) and the connection repository, then
// passes it to the scheduler. The scheduler invokes RunForUser per
// user as part of the `connect_activity_ingest` cron loop.
package connectingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"go.uber.org/zap"
)

// Tunables — kept as package vars rather than constants so tests could
// shrink them, but treated as constants in production. See architecture
// design §F (Ingest tuning).
var (
	// gmailMaxMessages caps the number of messages we'll fetch in one
	// run. With a 7d rolling window most users sit well under this;
	// the cap is a defensive guard against runaway accounts.
	gmailMaxMessages = 200

	// calendarMaxEvents caps the calendar event fetch.
	calendarMaxEvents = 250

	// recipientLimit: emails with more recipients than this are treated
	// as mailing-list traffic and dropped. Calendar events likewise.
	recipientLimit = 20

	// httpTimeout bounds a single Google API call. We don't need long
	// here — the `q=newer_than:7d` filter keeps responses small.
	httpTimeout = 30 * time.Second

	// noreplyPrefixes are case-insensitive prefixes for the local part
	// of `From:` headers we never want to log as activity.
	noreplyPrefixes = []string{
		"noreply@", "no-reply@", "do-not-reply@", "donotreply@",
		"notifications@", "notification@", "alerts@", "alert@",
		"mailer-daemon@", "postmaster@", "support@", "team@",
	}
)

// IntegrationsAccessor is the narrow port the ingestor needs from the
// integrations usecase. Satisfied by *integrations.UseCase.
type IntegrationsAccessor interface {
	// GetValidGoogleAccessToken returns ("",false,nil) when the user
	// has no Google connection — the ingestor treats that as a
	// silent skip.
	GetValidGoogleAccessToken(ctx context.Context, userID uuid.UUID) (string, bool, error)
}

// ConnectionRepo is the narrow port the ingestor needs from the
// connection repository. Satisfied by *postgres.ConnectionRepository.
type ConnectionRepo interface {
	ListAllForUser(ctx context.Context, userID uuid.UUID) ([]entity.Connection, error)
	IngestActivities(ctx context.Context, userID uuid.UUID, batch []entity.ActivityInput, connIDs []uuid.UUID) (int, error)
}

// Ingestor walks a single user's Gmail + Calendar and persists
// matching activity rows. Reusable across users — RunForUser is the
// only entry point.
type Ingestor struct {
	integrations IntegrationsAccessor
	repo         ConnectionRepo
	httpClient   *http.Client
	logger       *zap.Logger
	now          func() time.Time
	// lookbackDays controls the rolling window. Defaults to 7. Tests
	// can override via WithLookback. The cron always uses the default.
	lookbackDays int
}

// New constructs an Ingestor with production defaults: 30s HTTP
// timeout, 7-day lookback, real time.Now.
func New(integrations IntegrationsAccessor, repo ConnectionRepo, logger *zap.Logger) *Ingestor {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Ingestor{
		integrations: integrations,
		repo:         repo,
		httpClient:   &http.Client{Timeout: httpTimeout},
		logger:       logger,
		now:          time.Now,
		lookbackDays: 7,
	}
}

// SetLookbackDays overrides the rolling window. Used by ad-hoc
// triggers (e.g. the connect-activity skill's `sync --days 90`).
func (i *Ingestor) SetLookbackDays(d int) {
	if d > 0 {
		i.lookbackDays = d
	}
}

// SetClock overrides the time source. Tests only.
func (i *Ingestor) SetClock(now func() time.Time) { i.now = now }

// RunForUser executes one ingest pass for the given user. Returns the
// number of activity rows actually inserted (already deduped by the
// repo's ON CONFLICT). A user without a Google connection returns
// (0, nil) with no error logged at warn or higher. Per-message fetch
// errors are logged but never abort the whole run.
func (i *Ingestor) RunForUser(ctx context.Context, userID uuid.UUID) (int, error) {
	token, found, err := i.integrations.GetValidGoogleAccessToken(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("connectingest: token: %w", err)
	}
	if !found {
		return 0, nil
	}

	connections, err := i.repo.ListAllForUser(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("connectingest: list connections: %w", err)
	}
	if len(connections) == 0 {
		return 0, nil
	}

	emailIndex := buildEmailIndex(connections)
	if len(emailIndex) == 0 {
		// No connections have an email address — there's nothing the
		// ingestor can match on yet. Silently skip.
		return 0, nil
	}

	var (
		batch   []entity.ActivityInput
		connIDs []uuid.UUID
		gmailN  int
		calN    int
	)

	gmailBatch, gmailIDs, err := i.fetchGmail(ctx, token, emailIndex)
	if err != nil {
		i.logger.Warn("connectingest: gmail fetch failed",
			zap.String("user_id", userID.String()), zap.Error(err))
	} else {
		gmailN = len(gmailBatch)
		batch = append(batch, gmailBatch...)
		connIDs = append(connIDs, gmailIDs...)
	}

	calBatch, calIDs, err := i.fetchCalendar(ctx, token, emailIndex)
	if err != nil {
		i.logger.Warn("connectingest: calendar fetch failed",
			zap.String("user_id", userID.String()), zap.Error(err))
	} else {
		calN = len(calBatch)
		batch = append(batch, calBatch...)
		connIDs = append(connIDs, calIDs...)
	}

	if len(batch) == 0 {
		i.logger.Debug("connectingest: no matched activities",
			zap.String("user_id", userID.String()),
			zap.Int("connections_with_email", len(emailIndex)))
		return 0, nil
	}

	inserted, err := i.repo.IngestActivities(ctx, userID, batch, connIDs)
	if err != nil {
		return 0, fmt.Errorf("connectingest: persist: %w", err)
	}
	i.logger.Info("connectingest: done",
		zap.String("user_id", userID.String()),
		zap.Int("gmail_candidates", gmailN),
		zap.Int("calendar_candidates", calN),
		zap.Int("inserted", inserted),
		zap.Int("lookback_days", i.lookbackDays))
	return inserted, nil
}

// ── Email index ───────────────────────────────────────────────────────

// buildEmailIndex maps lowercased connection emails to the connection
// id that owns them. A connection without an email is skipped. When
// two connections share an address (data quality issue) the first one
// wins — recovery is for the user to deduplicate them in the UI.
func buildEmailIndex(connections []entity.Connection) map[string]uuid.UUID {
	out := make(map[string]uuid.UUID, len(connections))
	for _, c := range connections {
		if c.Email == nil {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(*c.Email))
		if key == "" {
			continue
		}
		if _, exists := out[key]; exists {
			continue
		}
		out[key] = c.ID
	}
	return out
}

// ── Gmail ─────────────────────────────────────────────────────────────

// gmailListResponse is the slice of the messages.list response we use.
type gmailListResponse struct {
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages"`
	NextPageToken string `json:"nextPageToken"`
}

// gmailMessage is the slice of messages.get?format=metadata we use.
type gmailMessage struct {
	ID           string `json:"id"`
	InternalDate string `json:"internalDate"` // unix ms as string
	Payload      struct {
		Headers []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"headers"`
	} `json:"payload"`
}

// fetchGmail returns the matched Gmail activities for the user. Each
// returned ActivityInput has its corresponding connection_id in the
// parallel connIDs slice.
func (i *Ingestor) fetchGmail(ctx context.Context, token string, emailIndex map[string]uuid.UUID) ([]entity.ActivityInput, []uuid.UUID, error) {
	q := fmt.Sprintf("newer_than:%dd", i.lookbackDays)
	listURL := "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + url.Values{
		"q":          {q},
		"maxResults": {strconv.Itoa(gmailMaxMessages)},
	}.Encode()

	var listResp gmailListResponse
	if err := i.googleGetJSON(ctx, listURL, token, &listResp); err != nil {
		return nil, nil, err
	}

	if len(listResp.Messages) == 0 {
		return nil, nil, nil
	}

	var (
		batch    []entity.ActivityInput
		connIDs  []uuid.UUID
		seen     = make(map[string]struct{}) // (connID|occurredAt) local dedup
	)

	for n, m := range listResp.Messages {
		if n >= gmailMaxMessages {
			break
		}
		msg, err := i.fetchGmailMessage(ctx, token, m.ID)
		if err != nil {
			i.logger.Debug("connectingest: gmail get failed",
				zap.String("message_id", m.ID), zap.Error(err))
			continue
		}
		input, connID, ok := classifyGmailMessage(msg, emailIndex)
		if !ok {
			continue
		}
		dedupKey := connID.String() + "|" + input.OccurredAt.Format(time.RFC3339Nano)
		if _, dup := seen[dedupKey]; dup {
			continue
		}
		seen[dedupKey] = struct{}{}
		batch = append(batch, input)
		connIDs = append(connIDs, connID)
	}
	return batch, connIDs, nil
}

func (i *Ingestor) fetchGmailMessage(ctx context.Context, token, id string) (*gmailMessage, error) {
	u := "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + url.PathEscape(id) +
		"?format=metadata" +
		"&metadataHeaders=From" +
		"&metadataHeaders=To" +
		"&metadataHeaders=Cc" +
		"&metadataHeaders=Date" +
		"&metadataHeaders=Subject"
	var msg gmailMessage
	if err := i.googleGetJSON(ctx, u, token, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

// classifyGmailMessage applies the noreply/mailing-list filters and
// returns an ActivityInput + matched connection id when a row should
// be inserted. The bool is false when the message should be dropped.
func classifyGmailMessage(msg *gmailMessage, emailIndex map[string]uuid.UUID) (entity.ActivityInput, uuid.UUID, bool) {
	headers := flattenHeaders(msg.Payload.Headers)
	from := headers["from"]
	if from == "" {
		return entity.ActivityInput{}, uuid.Nil, false
	}
	fromAddr := extractFirstEmail(from)
	if fromAddr == "" || isNoreplySender(fromAddr) {
		return entity.ActivityInput{}, uuid.Nil, false
	}

	toAddrs := extractAllEmails(headers["to"])
	ccAddrs := extractAllEmails(headers["cc"])
	recipientCount := len(toAddrs) + len(ccAddrs)
	if recipientCount > recipientLimit {
		return entity.ActivityInput{}, uuid.Nil, false
	}

	// Primary match: From header → existing connection.
	connID, ok := emailIndex[fromAddr]
	if !ok {
		// Outbound mail (we sent it). Try matching against the first
		// non-empty recipient — that's the "other party" in 1:1 threads.
		for _, addr := range append(toAddrs, ccAddrs...) {
			if id, found := emailIndex[addr]; found {
				connID = id
				ok = true
				break
			}
		}
	}
	if !ok {
		return entity.ActivityInput{}, uuid.Nil, false
	}

	occurredAt, ok := parseInternalDate(msg.InternalDate)
	if !ok {
		return entity.ActivityInput{}, uuid.Nil, false
	}

	weight := decayWeight(recipientCount + 1) // +1 to count the sender
	subject := strings.TrimSpace(headers["subject"])
	note := truncate(subject, 280)

	return entity.ActivityInput{
		Kind:        entity.ActivityKindEmail,
		Label:       "",
		OccurredAt:  occurredAt.UTC(),
		DurationMin: 0,
		Weight:      weight,
		Note:        note,
	}, connID, true
}

func parseInternalDate(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	ms, err := strconv.ParseInt(s, 10, 64)
	if err != nil || ms <= 0 {
		return time.Time{}, false
	}
	return time.UnixMilli(ms), true
}

func flattenHeaders(headers []struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}) map[string]string {
	out := make(map[string]string, len(headers))
	for _, h := range headers {
		out[strings.ToLower(h.Name)] = h.Value
	}
	return out
}

func extractFirstEmail(header string) string {
	addr, err := mail.ParseAddress(header)
	if err == nil {
		return strings.ToLower(strings.TrimSpace(addr.Address))
	}
	// Fallback: take the first comma-separated field, parse that.
	parts := strings.SplitN(header, ",", 2)
	addr, err = mail.ParseAddress(parts[0])
	if err == nil {
		return strings.ToLower(strings.TrimSpace(addr.Address))
	}
	return ""
}

func extractAllEmails(header string) []string {
	if header == "" {
		return nil
	}
	addrs, err := mail.ParseAddressList(header)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, strings.ToLower(strings.TrimSpace(a.Address)))
	}
	return out
}

func isNoreplySender(addr string) bool {
	for _, prefix := range noreplyPrefixes {
		if strings.HasPrefix(addr, prefix) {
			return true
		}
	}
	return false
}

func decayWeight(participantCount int) float64 {
	if participantCount <= 1 {
		return 1
	}
	w := 1 / math.Sqrt(float64(participantCount))
	// Clamp to a sane band so we don't end up with 0.0001-style noise.
	if w < 0.1 {
		w = 0.1
	}
	return w
}

func truncate(s string, max int) string {
	if len([]rune(s)) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max])
}

// ── Calendar ──────────────────────────────────────────────────────────

type calendarListResponse struct {
	Items []struct {
		ID      string `json:"id"`
		Summary string `json:"summary"`
		Start   struct {
			DateTime string `json:"dateTime"`
			Date     string `json:"date"`
		} `json:"start"`
		End struct {
			DateTime string `json:"dateTime"`
			Date     string `json:"date"`
		} `json:"end"`
		Attendees []struct {
			Email string `json:"email"`
		} `json:"attendees"`
		Status string `json:"status"`
	} `json:"items"`
	NextPageToken string `json:"nextPageToken"`
}

func (i *Ingestor) fetchCalendar(ctx context.Context, token string, emailIndex map[string]uuid.UUID) ([]entity.ActivityInput, []uuid.UUID, error) {
	now := i.now().UTC()
	timeMin := now.Add(-time.Duration(i.lookbackDays) * 24 * time.Hour).Format(time.RFC3339)
	timeMax := now.Add(7 * 24 * time.Hour).Format(time.RFC3339)
	listURL := "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + url.Values{
		"timeMin":      {timeMin},
		"timeMax":      {timeMax},
		"singleEvents": {"true"},
		"orderBy":      {"startTime"},
		"maxResults":   {strconv.Itoa(calendarMaxEvents)},
	}.Encode()

	var resp calendarListResponse
	if err := i.googleGetJSON(ctx, listURL, token, &resp); err != nil {
		return nil, nil, err
	}

	var (
		batch   []entity.ActivityInput
		connIDs []uuid.UUID
		seen    = make(map[string]struct{})
	)

	for _, ev := range resp.Items {
		if strings.EqualFold(ev.Status, "cancelled") {
			continue
		}
		if len(ev.Attendees) == 0 || len(ev.Attendees) > recipientLimit {
			continue
		}

		// Skip all-day events: they're not interactive 1:1 time.
		if ev.Start.DateTime == "" {
			continue
		}
		start, err := time.Parse(time.RFC3339, ev.Start.DateTime)
		if err != nil {
			continue
		}
		end := start
		if ev.End.DateTime != "" {
			if e, err := time.Parse(time.RFC3339, ev.End.DateTime); err == nil {
				end = e
			}
		}
		duration := max(int(end.Sub(start).Minutes()), 0)

		weight := decayWeight(len(ev.Attendees))
		note := truncate(strings.TrimSpace(ev.Summary), 280)
		occurredAt := start.UTC()

		matched := make(map[uuid.UUID]struct{}, len(ev.Attendees))
		for _, a := range ev.Attendees {
			addr := strings.ToLower(strings.TrimSpace(a.Email))
			if addr == "" {
				continue
			}
			connID, ok := emailIndex[addr]
			if !ok {
				continue
			}
			if _, dup := matched[connID]; dup {
				continue
			}
			matched[connID] = struct{}{}

			dedupKey := connID.String() + "|" + occurredAt.Format(time.RFC3339Nano)
			if _, dup := seen[dedupKey]; dup {
				continue
			}
			seen[dedupKey] = struct{}{}

			batch = append(batch, entity.ActivityInput{
				Kind:        entity.ActivityKindCalendar,
				Label:       "",
				OccurredAt:  occurredAt,
				DurationMin: duration,
				Weight:      weight,
				Note:        note,
			})
			connIDs = append(connIDs, connID)
		}
	}
	return batch, connIDs, nil
}

// ── HTTP plumbing ─────────────────────────────────────────────────────

// googleGetJSON does a GET with a Bearer token and decodes a JSON body
// into out. Non-2xx responses surface as errors with the body trimmed
// to 256 bytes so logs stay readable.
func (i *Ingestor) googleGetJSON(ctx context.Context, target, token string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := i.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return fmt.Errorf("google http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
