package channels

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// fakeChannelsRepo is an in-memory repository for the channels slice.
type fakeChannelsRepo struct {
	settings      entity.TelegramChannelSettings
	settingsFound bool
	settingsErr   error

	upsertCalled   bool
	upsertReceived repository.ChannelUpdate

	updateUsernameCalled bool
	updateUsernameVal    string
}

func (f *fakeChannelsRepo) GetTelegramSettings(ctx context.Context, userID uuid.UUID) (entity.TelegramChannelSettings, bool, error) {
	return f.settings, f.settingsFound, f.settingsErr
}

func (f *fakeChannelsRepo) UpsertTelegramSettings(ctx context.Context, userID uuid.UUID, settings repository.ChannelUpdate) error {
	f.upsertCalled = true
	f.upsertReceived = settings
	return nil
}

func (f *fakeChannelsRepo) UpdateBotUsername(ctx context.Context, userID uuid.UUID, username string) error {
	f.updateUsernameCalled = true
	f.updateUsernameVal = username
	return nil
}

func (f *fakeChannelsRepo) ListPairingRequests(ctx context.Context, userID uuid.UUID) ([]entity.PairingRequest, error) {
	return nil, nil
}

func (f *fakeChannelsRepo) ListApprovedContacts(ctx context.Context, userID uuid.UUID) ([]entity.ApprovedContact, error) {
	return nil, nil
}

func (f *fakeChannelsRepo) UpsertPairingRequest(ctx context.Context, userID uuid.UUID, telegramID, displayName, messageText string) (string, error) {
	return "", nil
}

func (f *fakeChannelsRepo) ApprovePairingTx(ctx context.Context, userID uuid.UUID, pairingID string) (string, string, bool, error) {
	return "", "", false, nil
}

func (f *fakeChannelsRepo) DenyPairing(ctx context.Context, userID uuid.UUID, pairingID string) error {
	return nil
}

// fakeTelegram records calls and yields canned responses.
type fakeTelegram struct {
	setWebhookCalled bool
	setWebhookToken  string
	setWebhookURL    string
	setWebhookErr    error

	getUsernameCalled bool
	getUsernameRet    string
	getUsernameErr    error
}

func (f *fakeTelegram) SetWebhook(token, webhookURL, secretToken string) error {
	f.setWebhookCalled = true
	f.setWebhookToken = token
	f.setWebhookURL = webhookURL
	return f.setWebhookErr
}

func (f *fakeTelegram) GetBotUsername(token string) (string, error) {
	f.getUsernameCalled = true
	return f.getUsernameRet, f.getUsernameErr
}

type fakePoller struct {
	ensureCalled bool
	ensureToken  string
}

func (f *fakePoller) EnsurePoller(token string) {
	f.ensureCalled = true
	f.ensureToken = token
}

func TestGetTelegram_MissingRowReturnsDefaults(t *testing.T) {
	repo := &fakeChannelsRepo{settingsFound: false}
	uc := NewUseCase(repo, nil, "", "")
	view, err := uc.GetTelegram(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if view.DMPolicy != "allow" || view.GroupPolicy != "allow" {
		t.Errorf("expected default allow policies, got DM=%q Group=%q", view.DMPolicy, view.GroupPolicy)
	}
	if view.Enabled {
		t.Errorf("expected Enabled=false for missing row")
	}
}

func TestGetTelegram_MasksBotToken(t *testing.T) {
	repo := &fakeChannelsRepo{
		settingsFound: true,
		settings: entity.TelegramChannelSettings{
			BotToken: "1234567890:ABCDEFGHIJKLMNOP",
			Enabled:  true,
		},
	}
	uc := NewUseCase(repo, nil, "", "")
	view, err := uc.GetTelegram(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Mask = first 6 chars + "***"
	if view.BotToken != "123456***" {
		t.Errorf("expected masked token %q, got %q", "123456***", view.BotToken)
	}
}

func TestGetTelegram_ShortTokenMasksToEmpty(t *testing.T) {
	repo := &fakeChannelsRepo{
		settingsFound: true,
		settings:      entity.TelegramChannelSettings{BotToken: "abc"},
	}
	uc := NewUseCase(repo, nil, "", "")
	view, _ := uc.GetTelegram(context.Background(), uuid.New())
	if view.BotToken != "" {
		t.Errorf("expected empty mask for 3-char token, got %q", view.BotToken)
	}
}

func TestGetTelegram_PropagatesError(t *testing.T) {
	sentinel := errors.New("db down")
	repo := &fakeChannelsRepo{settingsErr: sentinel}
	uc := NewUseCase(repo, nil, "", "")
	_, err := uc.GetTelegram(context.Background(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

func TestUpdateTelegram_DefaultsAppliedWhenOmitted(t *testing.T) {
	repo := &fakeChannelsRepo{}
	tg := &fakeTelegram{}
	uc := NewUseCase(repo, tg, "", "")
	_, err := uc.UpdateTelegram(context.Background(), uuid.New(), UpdateCommand{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := repo.upsertReceived
	if !got.Enabled {
		t.Errorf("expected Enabled=true default")
	}
	if got.DMPolicy != "allow" || got.GroupPolicy != "allow" {
		t.Errorf("expected default allow policies")
	}
}

func TestUpdateTelegram_EnabledPointerRespected(t *testing.T) {
	repo := &fakeChannelsRepo{}
	uc := NewUseCase(repo, nil, "", "")
	no := false
	_, err := uc.UpdateTelegram(context.Background(), uuid.New(), UpdateCommand{Enabled: &no})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.upsertReceived.Enabled {
		t.Errorf("expected Enabled=false when pointer is explicit false")
	}
}

func TestUpdateTelegram_SideEffectsRunWhenTokenProvided(t *testing.T) {
	repo := &fakeChannelsRepo{}
	tg := &fakeTelegram{getUsernameRet: "@mybot"}
	poller := &fakePoller{}
	uc := NewUseCase(repo, tg, "https://example.com/", "test-secret")
	uc.SetPoller(poller)

	_, err := uc.UpdateTelegram(context.Background(), uuid.New(), UpdateCommand{BotToken: "TOKEN"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !tg.setWebhookCalled {
		t.Errorf("expected SetWebhook to be called")
	}
	// The webhook URL must NOT contain the raw bot token — it should
	// use an opaque HMAC-derived identifier to prevent token leakage
	// in access logs. Verify the URL starts with the base + /webhook/
	// and does NOT contain the plaintext token.
	if !strings.HasPrefix(tg.setWebhookURL, "https://example.com/webhook/") {
		t.Errorf("expected webhook URL to start with base/webhook/, got %q", tg.setWebhookURL)
	}
	if strings.Contains(tg.setWebhookURL, "TOKEN") {
		t.Errorf("webhook URL must NOT contain the raw bot token, got %q", tg.setWebhookURL)
	}
	if !poller.ensureCalled || poller.ensureToken != "TOKEN" {
		t.Errorf("expected poller.EnsurePoller(TOKEN)")
	}
	if !tg.getUsernameCalled {
		t.Errorf("expected GetBotUsername call")
	}
	if !repo.updateUsernameCalled || repo.updateUsernameVal != "@mybot" {
		t.Errorf("expected UpdateBotUsername(@mybot), got called=%v val=%q",
			repo.updateUsernameCalled, repo.updateUsernameVal)
	}
}

func TestUpdateTelegram_NoSideEffectsWithoutToken(t *testing.T) {
	repo := &fakeChannelsRepo{}
	tg := &fakeTelegram{}
	poller := &fakePoller{}
	uc := NewUseCase(repo, tg, "https://example.com", "test-secret")
	uc.SetPoller(poller)

	_, err := uc.UpdateTelegram(context.Background(), uuid.New(), UpdateCommand{BotToken: ""})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tg.setWebhookCalled || poller.ensureCalled || tg.getUsernameCalled {
		t.Errorf("expected no side effects when BotToken is empty")
	}
}

func TestUpdateTelegram_SwallowsUsernameFetchFailure(t *testing.T) {
	repo := &fakeChannelsRepo{}
	tg := &fakeTelegram{getUsernameErr: errors.New("getMe timeout")}
	uc := NewUseCase(repo, tg, "", "")
	res, err := uc.UpdateTelegram(context.Background(), uuid.New(), UpdateCommand{BotToken: "TOKEN"})
	if err != nil {
		t.Fatalf("usecase should swallow telegram errors, got %v", err)
	}
	if res.Status != "updated" {
		t.Errorf("expected status=updated, got %q", res.Status)
	}
	if repo.updateUsernameCalled {
		t.Errorf("UpdateBotUsername must not run when GetBotUsername failed")
	}
}

func TestMaskBotToken(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"abc", ""},
		{"abcdef", ""},
		{"abcdefg", "abcdef***"},
		{"1234567890:ABCDEF", "123456***"},
	}
	for _, tc := range cases {
		if got := maskBotToken(tc.in); got != tc.want {
			t.Errorf("maskBotToken(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestTrimTrailingSlash(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"/", ""},
		{"foo", "foo"},
		{"foo/", "foo"},
		{"foo///", "foo"},
	}
	for _, tc := range cases {
		if got := trimTrailingSlash(tc.in); got != tc.want {
			t.Errorf("trimTrailingSlash(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
