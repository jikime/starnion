package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// MediaRepository owns the `images` and `audios` tables plus a
// small number of read helpers used by the HTTP upload / transcribe
// handlers (provider key lookup, conversation → user lookup).
type MediaRepository interface {
	// ── Images ──────────────────────────────────────────────────
	ListImages(ctx context.Context, userID uuid.UUID, limit, offset int) ([]entity.Image, error)
	CountImages(ctx context.Context, userID uuid.UUID) (int, error)
	GetImage(ctx context.Context, userID uuid.UUID, id string) (entity.Image, bool, error)
	DeleteImage(ctx context.Context, userID uuid.UUID, id string) error
	InsertImage(ctx context.Context, userID uuid.UUID, img entity.ImageCreate) error
	// InsertImageForUserID is the internal variant used by the
	// screenshot upload flow — user id comes from a conversation
	// lookup and is typed as a raw string.
	InsertImageForUserID(ctx context.Context, userID string, img entity.ImageCreate) error

	// ── Audios ──────────────────────────────────────────────────
	ListAudios(ctx context.Context, userID uuid.UUID, limit, offset int) ([]entity.Audio, error)
	CountAudios(ctx context.Context, userID uuid.UUID) (int, error)
	GetAudio(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, bool, error)
	GetAudioTranscript(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, bool, error)
	DeleteAudio(ctx context.Context, userID uuid.UUID, id string) error
	InsertAudio(ctx context.Context, userID uuid.UUID, a entity.AudioCreate) error

	// ── Lookups ────────────────────────────────────────────────
	// GetProviderPlainKey returns the decrypted api_key for a
	// provider row (openai/groq/…). Empty string when no row or
	// decryption fails. Used by transcribe/TTS endpoints.
	GetProviderPlainKey(ctx context.Context, userID uuid.UUID, provider string) (string, error)
	// UserIDByConversation resolves a conversation id to its
	// owning user id. Used by the agent screenshot upload flow.
	UserIDByConversation(ctx context.Context, conversationID string) (string, error)
}
