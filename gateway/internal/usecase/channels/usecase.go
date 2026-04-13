// Package channels hosts the telegram channel settings + pairing
// workflow use cases. It's responsible for orchestrating the DB
// repository with the external side effects (webhook registration,
// bot-username lookup, dynamic poller startup) that used to live
// inline in handler/channels_handler.go.
//
// External services are abstracted behind two small ports — so unit
// tests can fake the Telegram API and the poller without touching
// real HTTP or background goroutines.
package channels

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// TelegramGateway is the port for external Telegram API calls the
// usecase needs: registering a webhook for a given bot and fetching
// the bot's username via getMe.
type TelegramGateway interface {
	// SetWebhook registers `webhookURL` for the given bot token.
	// secretToken is the verification token Telegram will send back
	// in every webhook delivery header. A non-nil error is logged by
	// the caller but does NOT fail the update (matches legacy
	// semantics — webhook registration is best-effort so a
	// temporarily unreachable bot does not break settings saves).
	SetWebhook(token, webhookURL, secretToken string) error
	// GetBotUsername returns the bot's @username via getMe. The
	// empty string means "failed to fetch".
	GetBotUsername(token string) (string, error)
}

// BotPoller is the port for the long-polling subsystem the usecase
// asks to start tracking a newly-saved bot token. nil is a valid
// implementation — the legacy handler guarded with `if botManager
// != nil` and this usecase preserves that tolerance.
type BotPoller interface {
	EnsurePoller(token string)
}

type UseCase struct {
	repo          repository.ChannelsRepository
	telegram      TelegramGateway
	poller        BotPoller
	webhookURL    string // empty = don't register a webhook
	webhookSecret string // shared secret for X-Telegram-Bot-Api-Secret-Token verification
}

func NewUseCase(repo repository.ChannelsRepository, tg TelegramGateway, webhookURL, webhookSecret string) *UseCase {
	return &UseCase{repo: repo, telegram: tg, webhookURL: webhookURL, webhookSecret: webhookSecret}
}

// SetPoller wires the poller post-construction, because the bot
// manager is built after the HTTP container in server bootstrap.
func (u *UseCase) SetPoller(p BotPoller) {
	u.poller = p
}

// TelegramView is the read-side projection returned to the HTTP
// handler. BotToken is already **masked** (first 6 chars + "***")
// so the handler can marshal it directly.
type TelegramView struct {
	Enabled     bool
	BotToken    string
	DMPolicy    string
	GroupPolicy string
}

// GetTelegram returns the current telegram channel settings for the
// user, masking the bot token. Missing row returns sensible defaults
// so the settings UI doesn't have to special-case first-time users.
func (u *UseCase) GetTelegram(ctx context.Context, userID uuid.UUID) (TelegramView, error) {
	settings, found, err := u.repo.GetTelegramSettings(ctx, userID)
	if err != nil {
		return TelegramView{}, err
	}
	if !found {
		return TelegramView{
			DMPolicy:    "allow",
			GroupPolicy: "allow",
		}, nil
	}
	return TelegramView{
		Enabled:     settings.Enabled,
		BotToken:    maskBotToken(settings.BotToken),
		DMPolicy:    settings.DMPolicy,
		GroupPolicy: settings.GroupPolicy,
	}, nil
}

// UpdateCommand is the input DTO for updating telegram channel
// settings. Enabled is a pointer so the handler can distinguish
// "omitted" (default true) from "explicitly false".
type UpdateCommand struct {
	Enabled     *bool
	BotToken    string
	DMPolicy    string
	GroupPolicy string
}

// UpdateResult is the HTTP response payload. WebhookMode is true
// when the gateway is configured with TELEGRAM_WEBHOOK_URL.
type UpdateResult struct {
	Status      string
	WebhookMode bool
}

// UpdateTelegram writes the settings, then (when a new token was
// provided) registers a webhook, starts the dynamic poller, and
// backfills the bot username. Side effects are best-effort: a
// failure to register the webhook still returns success from the
// settings save.
func (u *UseCase) UpdateTelegram(ctx context.Context, userID uuid.UUID, cmd UpdateCommand) (UpdateResult, error) {
	enabled := true
	if cmd.Enabled != nil {
		enabled = *cmd.Enabled
	}
	if cmd.DMPolicy == "" {
		cmd.DMPolicy = "allow"
	}
	if cmd.GroupPolicy == "" {
		cmd.GroupPolicy = "allow"
	}

	if err := u.repo.UpsertTelegramSettings(ctx, userID, repository.ChannelUpdate{
		Enabled:     enabled,
		BotToken:    cmd.BotToken,
		DMPolicy:    cmd.DMPolicy,
		GroupPolicy: cmd.GroupPolicy,
	}); err != nil {
		return UpdateResult{}, err
	}

	if cmd.BotToken != "" {
		// Side effects are best-effort. The usecase swallows their
		// errors because the settings save already committed; a
		// temporarily-flaky webhook endpoint should not make the
		// whole request look failed to the user.
		if u.webhookURL != "" && u.telegram != nil {
			// Use an opaque HMAC of the bot token as the URL path
			// segment instead of the raw token. This prevents the
			// plaintext bot token from appearing in access logs,
			// reverse-proxy logs, or network traces.
			webhookURL := trimTrailingSlash(u.webhookURL) + "/webhook/" + opaqueWebhookID(cmd.BotToken, u.webhookSecret)
			_ = u.telegram.SetWebhook(cmd.BotToken, webhookURL, u.webhookSecret)
		}
		if u.poller != nil {
			u.poller.EnsurePoller(cmd.BotToken)
		}
		if u.telegram != nil {
			if username, err := u.telegram.GetBotUsername(cmd.BotToken); err == nil && username != "" {
				_ = u.repo.UpdateBotUsername(ctx, userID, username)
			}
		}
	}

	return UpdateResult{
		Status:      "updated",
		WebhookMode: u.webhookURL != "",
	}, nil
}

// PairingsView is the read-side projection for GET /pairing.
type PairingsView struct {
	Pairings []entity.PairingRequest
	Approved []entity.ApprovedContact
}

func (u *UseCase) ListPairings(ctx context.Context, userID uuid.UUID) (PairingsView, error) {
	pairings, err := u.repo.ListPairingRequests(ctx, userID)
	if err != nil {
		return PairingsView{}, err
	}
	approved, err := u.repo.ListApprovedContacts(ctx, userID)
	if err != nil {
		return PairingsView{}, err
	}
	if pairings == nil {
		pairings = []entity.PairingRequest{}
	}
	if approved == nil {
		approved = []entity.ApprovedContact{}
	}
	return PairingsView{Pairings: pairings, Approved: approved}, nil
}

// CreatePairingCommand is the input DTO for POST /pairing.
type CreatePairingCommand struct {
	TelegramID  string
	DisplayName string
	MessageText string
}

func (u *UseCase) CreatePairing(ctx context.Context, userID uuid.UUID, cmd CreatePairingCommand) (string, error) {
	return u.repo.UpsertPairingRequest(ctx, userID, cmd.TelegramID, cmd.DisplayName, cmd.MessageText)
}

// ApproveResult carries the newly-approved contact back so the
// handler can echo it in the HTTP response.
type ApproveResult struct {
	TelegramID  string
	DisplayName string
}

// ApprovePairing returns ok=false when the pairing does not exist
// or is already resolved, so the handler can 404 cleanly.
func (u *UseCase) ApprovePairing(ctx context.Context, userID uuid.UUID, pairingID string) (ApproveResult, bool, error) {
	telegramID, displayName, ok, err := u.repo.ApprovePairingTx(ctx, userID, pairingID)
	if err != nil || !ok {
		return ApproveResult{}, ok, err
	}
	return ApproveResult{TelegramID: telegramID, DisplayName: displayName}, true, nil
}

func (u *UseCase) DenyPairing(ctx context.Context, userID uuid.UUID, pairingID string) error {
	return u.repo.DenyPairing(ctx, userID, pairingID)
}

// ── Helpers ─────────────────────────────────────────────────────────

func maskBotToken(token string) string {
	if len(token) <= 6 {
		return ""
	}
	return token[:6] + "***"
}

func trimTrailingSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

// opaqueWebhookID derives a deterministic URL-safe identifier from a
// bot token so the raw token never appears in the webhook URL path
// (and therefore never leaks to access logs, reverse-proxy traces, or
// network monitors). The HMAC is keyed by the gateway's webhook secret
// so even if an attacker knows the bot token they cannot predict the
// path without also knowing the secret.
func opaqueWebhookID(botToken, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(botToken))
	return hex.EncodeToString(h.Sum(nil))[:32] // 16 bytes = 32 hex chars, plenty of uniqueness
}
