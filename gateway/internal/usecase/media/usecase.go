// Package media hosts the media CRUD use cases (images, audios,
// transcripts). The heavier I/O endpoints (upload, transcribe, TTS,
// serve) live in the HTTP adapter because they are tightly coupled
// to the request/response lifecycle — the usecase layer is only
// the CRUD + provider-key lookup surface.
package media

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

type UseCase struct {
	repo repository.MediaRepository
}

func NewUseCase(repo repository.MediaRepository) *UseCase {
	return &UseCase{repo: repo}
}

// ── Image pagination helpers ─────────────────────────────────────

// ImagePage bundles a page of image rows with pagination metadata.
type ImagePage struct {
	Images []entity.Image
	Total  int
	Page   int
	Limit  int
}

func (u *UseCase) ListImages(ctx context.Context, userID uuid.UUID, page, limit int) (ImagePage, error) {
	page, limit = clampPage(page, limit)
	offset := (page - 1) * limit
	rows, err := u.repo.ListImages(ctx, userID, limit, offset)
	if err != nil {
		return ImagePage{}, err
	}
	total, err := u.repo.CountImages(ctx, userID)
	if err != nil {
		return ImagePage{}, err
	}
	if rows == nil {
		rows = []entity.Image{}
	}
	return ImagePage{Images: rows, Total: total, Page: page, Limit: limit}, nil
}

func (u *UseCase) GetImage(ctx context.Context, userID uuid.UUID, id string) (entity.Image, error) {
	img, found, err := u.repo.GetImage(ctx, userID, id)
	if err != nil {
		return entity.Image{}, err
	}
	if !found {
		return entity.Image{}, domain.ErrNotFound
	}
	return img, nil
}

func (u *UseCase) DeleteImage(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteImage(ctx, userID, id)
}

// InsertImage is called by the HTTP upload handler after the object
// has been persisted to mediastore.
func (u *UseCase) InsertImage(ctx context.Context, userID uuid.UUID, img entity.ImageCreate) error {
	return u.repo.InsertImage(ctx, userID, img)
}

// InsertImageForUserID is the agent-facing variant used by the
// internal screenshot-upload flow. The user id is looked up from a
// conversation via UserIDByConversation.
func (u *UseCase) InsertImageForUserID(ctx context.Context, userID string, img entity.ImageCreate) error {
	return u.repo.InsertImageForUserID(ctx, userID, img)
}

// ── Audio pagination + transcript helpers ───────────────────────

type AudioPage struct {
	Audios []entity.Audio
	Total  int
	Page   int
	Limit  int
}

func (u *UseCase) ListAudios(ctx context.Context, userID uuid.UUID, page, limit int) (AudioPage, error) {
	page, limit = clampPage(page, limit)
	offset := (page - 1) * limit
	rows, err := u.repo.ListAudios(ctx, userID, limit, offset)
	if err != nil {
		return AudioPage{}, err
	}
	total, err := u.repo.CountAudios(ctx, userID)
	if err != nil {
		return AudioPage{}, err
	}
	if rows == nil {
		rows = []entity.Audio{}
	}
	return AudioPage{Audios: rows, Total: total, Page: page, Limit: limit}, nil
}

func (u *UseCase) GetAudio(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, error) {
	a, found, err := u.repo.GetAudio(ctx, userID, id)
	if err != nil {
		return entity.Audio{}, err
	}
	if !found {
		return entity.Audio{}, domain.ErrNotFound
	}
	return a, nil
}

func (u *UseCase) GetAudioTranscript(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, error) {
	a, found, err := u.repo.GetAudioTranscript(ctx, userID, id)
	if err != nil {
		return entity.Audio{}, err
	}
	if !found {
		return entity.Audio{}, domain.ErrNotFound
	}
	return a, nil
}

func (u *UseCase) DeleteAudio(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteAudio(ctx, userID, id)
}

func (u *UseCase) InsertAudio(ctx context.Context, userID uuid.UUID, a entity.AudioCreate) error {
	return u.repo.InsertAudio(ctx, userID, a)
}

// ── Provider key + conversation lookups ─────────────────────────

// STTProvider is the pair (apiKey, vendor) the handler uses to call
// a speech-to-text backend. Vendor is one of "openai" or "groq".
type STTProvider struct {
	APIKey string
	Vendor string
}

// ResolveSTT returns the STT provider to use for the given user,
// preferring OpenAI when both keys are configured. Returns an error
// when neither provider is set up.
func (u *UseCase) ResolveSTT(ctx context.Context, userID uuid.UUID) (STTProvider, error) {
	openai, err := u.repo.GetProviderPlainKey(ctx, userID, "openai")
	if err != nil {
		return STTProvider{}, err
	}
	if openai != "" {
		return STTProvider{APIKey: openai, Vendor: "openai"}, nil
	}
	groq, err := u.repo.GetProviderPlainKey(ctx, userID, "groq")
	if err != nil {
		return STTProvider{}, err
	}
	if groq != "" {
		return STTProvider{APIKey: groq, Vendor: "groq"}, nil
	}
	return STTProvider{}, fmt.Errorf("%w: no STT provider configured", domain.ErrUnavailable)
}

// ResolveOpenAIKey returns the plain OpenAI API key for the user,
// or ErrUnavailable when not configured. Used by the TTS handler
// (TTS is only supported by OpenAI at the moment).
func (u *UseCase) ResolveOpenAIKey(ctx context.Context, userID uuid.UUID) (string, error) {
	key, err := u.repo.GetProviderPlainKey(ctx, userID, "openai")
	if err != nil {
		return "", err
	}
	if key == "" {
		return "", fmt.Errorf("%w: openai api key not configured", domain.ErrUnavailable)
	}
	return key, nil
}

// UserIDByConversation resolves a conversation id to its owning
// user id. Used by the internal screenshot upload flow.
func (u *UseCase) UserIDByConversation(ctx context.Context, conversationID string) (string, error) {
	return u.repo.UserIDByConversation(ctx, conversationID)
}

// ── Helpers ─────────────────────────────────────────────────────

func clampPage(page, limit int) (int, int) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	return page, limit
}
