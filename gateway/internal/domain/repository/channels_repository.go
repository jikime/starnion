package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// ChannelsRepository is the persistence port for the telegram channel
// settings + pairing workflow. The repo speaks **plaintext** bot
// tokens — the postgres impl handles encryption/decryption so the
// usecase layer never has to touch crypto primitives directly.
type ChannelsRepository interface {
	// ── Telegram channel settings ─────────────────────────────────
	GetTelegramSettings(ctx context.Context, userID uuid.UUID) (entity.TelegramChannelSettings, bool, error)
	UpsertTelegramSettings(ctx context.Context, userID uuid.UUID, settings ChannelUpdate) error
	UpdateBotUsername(ctx context.Context, userID uuid.UUID, username string) error

	// ── Telegram pairing ──────────────────────────────────────────
	ListPairingRequests(ctx context.Context, userID uuid.UUID) ([]entity.PairingRequest, error)
	ListApprovedContacts(ctx context.Context, userID uuid.UUID) ([]entity.ApprovedContact, error)
	UpsertPairingRequest(ctx context.Context, userID uuid.UUID, telegramID, displayName, messageText string) (string, error)
	// ApprovePairingTx transactionally marks the request approved,
	// inserts an approved_contacts row, and upserts platform_identities.
	// Returns (telegramID, displayName, ok=false when the request
	// does not exist or is already resolved).
	ApprovePairingTx(ctx context.Context, userID uuid.UUID, pairingID string) (telegramID, displayName string, ok bool, err error)
	DenyPairing(ctx context.Context, userID uuid.UUID, pairingID string) error
}

// ChannelUpdate is the write shape for UpsertTelegramSettings.
// BotToken is plaintext; the postgres impl encrypts it on write. A
// zero-length token means "update everything except the token".
type ChannelUpdate struct {
	Enabled     bool
	BotToken    string // plaintext, may be ""
	DMPolicy    string
	GroupPolicy string
}
