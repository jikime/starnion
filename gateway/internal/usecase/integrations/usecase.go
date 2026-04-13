// Package integrations hosts the third-party API key and Google
// OAuth token use cases. The legacy handler/integrations.go file
// mixed DB access, crypto, net/http, and HMAC state management in
// one 645-LOC blob; this usecase package keeps the orchestration
// pure and uses small ports for the external side effects.
package integrations

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// GoogleOAuthClient is the port the usecase relies on for the
// external Google OAuth HTTP calls. It is satisfied by
// internal/infrastructure/googleoauth.Client.
type GoogleOAuthClient interface {
	Exchange(ctx context.Context, clientID, clientSecret, redirectURL, code string) (GoogleTokens, error)
	Revoke(token string) error
}

// GoogleTokens is the cross-boundary token DTO. Matches the
// googleoauth.Tokens struct but lives in the usecase so the HTTP
// adapter does not import the infrastructure package directly.
type GoogleTokens struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
	Scope        string
}

// DefaultCredentials is the server-wide Google OAuth configuration
// read from env/config. It is used as a fallback when the user has
// not configured per-user credentials via the "google" integration.
type DefaultCredentials struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// allowedProviders is the whitelist for the :name path parameter.
// Any provider not listed here is rejected at the usecase boundary
// so external callers cannot plant arbitrary rows in integration_keys.
var allowedProviders = map[string]bool{
	"tavily":       true,
	"naver_search": true,
	"naver_map":    true,
	"gemini":       true,
	"github":       true,
	"notion":       true,
	"google":       true,
	"openai":       true,
	"groq":         true,
}

// AllowedProvider reports whether `name` is a legal provider id.
func AllowedProvider(name string) bool {
	return allowedProviders[name]
}

type UseCase struct {
	repo          repository.IntegrationsRepository
	google        GoogleOAuthClient
	defaultCreds  DefaultCredentials
	encryptionKey string
	stateSecret   string // JWT secret reused for state HMAC
}

func NewUseCase(
	repo repository.IntegrationsRepository,
	google GoogleOAuthClient,
	defaultCreds DefaultCredentials,
	encryptionKey, stateSecret string,
) *UseCase {
	return &UseCase{
		repo:          repo,
		google:        google,
		defaultCreds:  defaultCreds,
		encryptionKey: encryptionKey,
		stateSecret:   stateSecret,
	}
}

// ── Generic integration CRUD ──────────────────────────────────────

// KeyView is the read-side projection with a masked API key.
type KeyView struct {
	Provider  string
	Enabled   bool
	MaskedKey string
}

// GetKey returns the mask-safe view for a single provider. When no
// row exists the enabled flag is false — the handler maps that to
// a 200 response with `enabled: false` to match legacy semantics.
func (u *UseCase) GetKey(ctx context.Context, userID uuid.UUID, provider string) (KeyView, error) {
	if !AllowedProvider(provider) {
		return KeyView{}, fmt.Errorf("%w: unknown provider", domain.ErrInvalidArgument)
	}
	plain, found, err := u.repo.GetKey(ctx, userID, provider)
	if err != nil {
		return KeyView{}, err
	}
	if !found {
		return KeyView{Provider: provider, Enabled: false}, nil
	}
	return KeyView{Provider: provider, Enabled: true, MaskedKey: MaskKey(plain)}, nil
}

// ListStatus returns every configured provider for the user as a
// map keyed by provider name.
func (u *UseCase) ListStatus(ctx context.Context, userID uuid.UUID) (map[string]KeyView, error) {
	rows, err := u.repo.ListKeys(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]KeyView, len(rows))
	for _, k := range rows {
		out[k.Provider] = KeyView{Provider: k.Provider, Enabled: true, MaskedKey: MaskKey(k.APIKey)}
	}
	return out, nil
}

// UpsertKey writes a new API key for the provider. Returns the
// post-write view so the handler can echo the masked key back to
// the client.
func (u *UseCase) UpsertKey(ctx context.Context, userID uuid.UUID, provider, apiKey string) (KeyView, error) {
	if !AllowedProvider(provider) {
		return KeyView{}, fmt.Errorf("%w: unknown provider", domain.ErrInvalidArgument)
	}
	if apiKey == "" {
		return KeyView{}, fmt.Errorf("%w: api_key is required", domain.ErrInvalidArgument)
	}
	if err := u.repo.UpsertKey(ctx, userID, provider, apiKey); err != nil {
		return KeyView{}, err
	}
	return KeyView{Provider: provider, Enabled: true, MaskedKey: MaskKey(apiKey)}, nil
}

// DeleteKey removes the row for the provider.
func (u *UseCase) DeleteKey(ctx context.Context, userID uuid.UUID, provider string) error {
	if !AllowedProvider(provider) {
		return fmt.Errorf("%w: unknown provider", domain.ErrInvalidArgument)
	}
	return u.repo.DeleteKey(ctx, userID, provider)
}

// ── Accessor methods for the skills usecase ──────────────────────
//
// These wrap the internal repo/google paths with signatures that do
// NOT enforce the provider allow-list — the skills catalogue already
// validates provider ids via SKILL.md frontmatter. The skills
// usecase depends on these methods via a narrow IntegrationAccessor
// interface (see internal/usecase/skills/usecase.go).

// GetPlainKey returns the decrypted API key for a provider, or "".
func (u *UseCase) GetPlainKey(ctx context.Context, userID uuid.UUID, provider string) (string, error) {
	plain, found, err := u.repo.GetKey(ctx, userID, provider)
	if err != nil {
		return "", err
	}
	if !found {
		return "", nil
	}
	return plain, nil
}

// UpsertPlainKey writes an API key without the allow-list check.
func (u *UseCase) UpsertPlainKey(ctx context.Context, userID uuid.UUID, provider, apiKey string) error {
	return u.repo.UpsertKey(ctx, userID, provider, apiKey)
}

// DeletePlainKey removes a provider row without the allow-list check.
func (u *UseCase) DeletePlainKey(ctx context.Context, userID uuid.UUID, provider string) error {
	return u.repo.DeleteKey(ctx, userID, provider)
}

// GetGoogleExpiresAt returns the expiry timestamp of the stored
// Google token. The bool is false when no token is stored.
func (u *UseCase) GetGoogleExpiresAt(ctx context.Context, userID uuid.UUID) (time.Time, bool) {
	tokens, found, err := u.repo.GetGoogleTokens(ctx, userID)
	if err != nil || !found {
		return time.Time{}, false
	}
	return tokens.ExpiresAt, true
}

// SignOAuthState is exposed under its production name so the skills
// usecase can sign OAuth state tokens for Google-backed skills.
func (u *UseCase) SignOAuthState(userID string) string {
	return u.StateSign(userID)
}

// DisconnectGoogle is an alias that matches the skills usecase's
// IntegrationAccessor interface name.
func (u *UseCase) DisconnectGoogle(ctx context.Context, userID uuid.UUID) error {
	return u.GoogleDisconnect(ctx, userID)
}

// MaskKey is exposed as a method so the skills usecase's
// IntegrationAccessor port can pull it off the same value it
// already holds, instead of importing the concrete
// integrations package just for a free function. Delegates to
// the package-level helper below so one implementation stays
// authoritative.
func (u *UseCase) MaskKey(raw string) string {
	return MaskKey(raw)
}

// ── Naver Map ─────────────────────────────────────────────────────

// NaverMapConfig is the response DTO for /integrations/naver_map/client-config.
type NaverMapConfig struct {
	Configured       bool
	ClientID         string
	SearchConfigured bool
}

// GetNaverMapClientConfig returns the decrypted client_id for the
// Naver Maps JS SDK and whether naver_search is also configured.
// Only client_id is exposed to the browser — client_secret stays
// server-side.
func (u *UseCase) GetNaverMapClientConfig(ctx context.Context, userID uuid.UUID) (NaverMapConfig, error) {
	plain, found, err := u.repo.GetKey(ctx, userID, "naver_map")
	if err != nil || !found || plain == "" {
		return NaverMapConfig{}, nil
	}
	clientID, _, ok := strings.Cut(plain, ":")
	if !ok || clientID == "" {
		return NaverMapConfig{}, nil
	}
	_, searchFound, _ := u.repo.GetKey(ctx, userID, "naver_search")
	return NaverMapConfig{
		Configured:       true,
		ClientID:         clientID,
		SearchConfigured: searchFound,
	}, nil
}

// ── Google OAuth ──────────────────────────────────────────────────

// GoogleClientID returns the effective client_id for the given user,
// preferring per-user credentials over the server default.
func (u *UseCase) GoogleClientID(ctx context.Context, userID uuid.UUID) string {
	if id, _ := u.resolveGoogleCredentials(ctx, userID); id != "" {
		return id
	}
	return u.defaultCreds.ClientID
}

// StateSign builds a one-time-use HMAC-SHA256 signed state token
// for the given user id. The token is valid for 10 minutes.
func (u *UseCase) StateSign(userID string) string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	payload := userID + ":" + ts
	mac := hmac.New(sha256.New, []byte(u.stateSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

// StateVerify validates a previously-issued state token and marks
// it as used so a replay within the HMAC window is rejected. The
// second return is true on success.
func (u *UseCase) StateVerify(state string) (string, bool) {
	dot := strings.LastIndex(state, ".")
	if dot < 0 {
		return "", false
	}
	payload := state[:dot]
	sig := state[dot+1:]
	mac := hmac.New(sha256.New, []byte(u.stateSecret))
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return "", false
	}
	colon := strings.LastIndex(payload, ":")
	if colon < 0 {
		return "", false
	}
	userID := payload[:colon]
	ts, err := strconv.ParseInt(payload[colon+1:], 10, 64)
	if err != nil {
		return "", false
	}
	issuedAt := time.Unix(ts, 0)
	if time.Since(issuedAt) > 10*time.Minute {
		return "", false
	}
	expiresAt := issuedAt.Add(10 * time.Minute)
	if _, loaded := usedOAuthStates.LoadOrStore(sig, expiresAt); loaded {
		return "", false
	}
	return userID, true
}

// GoogleExchange swaps an authorization code for tokens, encrypts
// them, and persists them. Returns the plaintext tokens so the
// handler can trigger any follow-up actions.
func (u *UseCase) GoogleExchange(ctx context.Context, userID uuid.UUID, code string) (GoogleTokens, error) {
	clientID, clientSecret := u.resolveGoogleCredentials(ctx, userID)
	if clientID == "" {
		clientID = u.defaultCreds.ClientID
		clientSecret = u.defaultCreds.ClientSecret
	}
	if clientID == "" {
		return GoogleTokens{}, fmt.Errorf("google oauth not configured")
	}
	tokens, err := u.google.Exchange(ctx, clientID, clientSecret, u.defaultCreds.RedirectURL, code)
	if err != nil {
		return GoogleTokens{}, err
	}
	if err := u.repo.UpsertGoogleTokens(ctx, userID, entity.GoogleTokens{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		Scopes:       tokens.Scope,
		ExpiresAt:    tokens.ExpiresAt,
	}); err != nil {
		return GoogleTokens{}, err
	}
	return tokens, nil
}

// GoogleStatus returns the token status for the user. The second
// return is false when no token is stored yet.
func (u *UseCase) GoogleStatus(ctx context.Context, userID uuid.UUID) (entity.GoogleTokens, bool, error) {
	tokens, found, err := u.repo.GetGoogleTokens(ctx, userID)
	if err != nil || !found {
		return entity.GoogleTokens{}, found, err
	}
	return tokens, true, nil
}

// GoogleDisconnect revokes the token on Google's side (best-effort)
// and removes the row from Postgres.
func (u *UseCase) GoogleDisconnect(ctx context.Context, userID uuid.UUID) error {
	if token, _ := u.repo.GetGoogleAccessToken(ctx, userID); token != "" {
		_ = u.google.Revoke(token)
	}
	return u.repo.DeleteGoogleTokens(ctx, userID)
}

// resolveGoogleCredentials returns (clientID, clientSecret) for the
// given user, preferring per-user credentials stored in
// integration_keys over the server defaults.
func (u *UseCase) resolveGoogleCredentials(ctx context.Context, userID uuid.UUID) (string, string) {
	plain, found, err := u.repo.GetKey(ctx, userID, "google")
	if err == nil && found && strings.Contains(plain, ":") {
		parts := strings.SplitN(plain, ":", 2)
		return parts[0], parts[1]
	}
	return u.defaultCreds.ClientID, u.defaultCreds.ClientSecret
}

// ── Helpers ───────────────────────────────────────────────────────

// MaskKey shows only the last 4 characters of an API key.
// For "client_id:client_secret" style keys each half is masked.
func MaskKey(key string) string {
	if strings.Contains(key, ":") {
		parts := strings.SplitN(key, ":", 2)
		return MaskKey(parts[0]) + ":" + MaskKey(parts[1])
	}
	if len(key) <= 4 {
		return "****"
	}
	return "***..." + key[len(key)-4:]
}

// usedOAuthStates records signatures of state tokens that have
// already been redeemed so a replay within the 10-minute HMAC
// window cannot succeed. The janitor goroutine drops expired
// entries so the map stays bounded under load.
var usedOAuthStates = sync.Map{}

func init() {
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for now := range t.C {
			usedOAuthStates.Range(func(k, v any) bool {
				if exp, ok := v.(time.Time); ok && now.After(exp) {
					usedOAuthStates.Delete(k)
				}
				return true
			})
		}
	}()
}
