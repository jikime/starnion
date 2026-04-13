package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// UserProfilePatch describes a partial update to a user's profile. Nil
// fields are left untouched — non-nil fields overwrite the stored value.
// Preferences is a JSON-merge patch applied on top of the stored JSONB
// document rather than a full replacement.
type UserProfilePatch struct {
	DisplayName *string
	AvatarURL   *string
	Preferences map[string]any
}

// UserRepository is the persistence port for the user aggregate. Concrete
// implementations live under internal/adapter/repository/postgres. The
// usecase layer depends only on this interface so it can be unit-tested
// against in-memory fakes.
type UserRepository interface {
	// FindByID returns the user with the given ID or domain.ErrNotFound.
	FindByID(ctx context.Context, id uuid.UUID) (*entity.User, error)

	// UpdateProfile applies the given patch to the user's profile columns
	// and, if patch.Preferences is non-empty, merges it into the JSONB
	// preferences document in a single UPDATE. Returns domain.ErrNotFound
	// when the target user does not exist.
	UpdateProfile(ctx context.Context, id uuid.UUID, patch UserProfilePatch) error

	// GetPreferences returns the raw preferences JSON blob. It is returned
	// as json.RawMessage so the handler can pass it through without
	// unmarshal/remarshal overhead for clients that only need the blob.
	GetPreferences(ctx context.Context, id uuid.UUID) (json.RawMessage, error)

	// ReplacePreferences overwrites the entire preferences JSONB document.
	ReplacePreferences(ctx context.Context, id uuid.UUID, prefs map[string]any) error
}
