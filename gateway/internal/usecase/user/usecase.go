// Package user hosts the user-profile use cases. Each exported method on
// UseCase maps to one business operation (GetProfile, UpdateProfile, …)
// and depends only on the repository port from internal/domain/repository.
// This package must not import handler, database, or anything HTTP/SQL
// specific so the logic is trivially unit-testable with a fake repo.
package user

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// UseCase orchestrates user-profile operations. It is constructed once at
// server boot with a concrete repository implementation.
type UseCase struct {
	repo repository.UserRepository
}

// NewUseCase wires the use case with its persistence port.
func NewUseCase(repo repository.UserRepository) *UseCase {
	return &UseCase{repo: repo}
}

// maxDisplayNameLen caps display_name length at the DB column limit so
// user input does not need to reach SQL to fail.
const maxDisplayNameLen = 100

// maxAvatarURLLen matches the HTTP-layer check in handler/user.go.
const maxAvatarURLLen = 512

// UpdateProfileCommand is the input DTO for UpdateProfile. It deliberately
// uses pointers for optional fields so the use case can distinguish
// "absent" from "empty string".
type UpdateProfileCommand struct {
	DisplayName *string
	AvatarURL   *string
	Language    *string
	Timezone    *string
}

// GetProfile returns the user's profile entity. It is a thin wrapper over
// the repository today; once more business rules appear (access control,
// computed fields, etc.) they belong here.
func (u *UseCase) GetProfile(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	return u.repo.FindByID(ctx, id)
}

// UpdateProfile validates the command and then delegates the actual write
// to the repository. Validation rules live here (not in the repository)
// so they can be unit-tested without a database.
func (u *UseCase) UpdateProfile(ctx context.Context, id uuid.UUID, cmd UpdateProfileCommand) (*entity.User, error) {
	displayName := cmd.DisplayName
	if displayName != nil && len(*displayName) > maxDisplayNameLen {
		trimmed := (*displayName)[:maxDisplayNameLen]
		displayName = &trimmed
	}

	if cmd.AvatarURL != nil && *cmd.AvatarURL != "" {
		raw := *cmd.AvatarURL
		if len(raw) > maxAvatarURLLen {
			return nil, fmt.Errorf("%w: avatar_url too long (max %d)", domain.ErrInvalidArgument, maxAvatarURLLen)
		}
		if !strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "https://") {
			return nil, fmt.Errorf("%w: avatar_url must start with / or https://", domain.ErrInvalidArgument)
		}
	}

	patch := repository.UserProfilePatch{
		DisplayName: displayName,
		AvatarURL:   cmd.AvatarURL,
	}
	prefPatch := map[string]any{}
	if cmd.Language != nil {
		prefPatch["language"] = *cmd.Language
	}
	if cmd.Timezone != nil {
		prefPatch["timezone"] = *cmd.Timezone
	}
	if len(prefPatch) > 0 {
		patch.Preferences = prefPatch
	}

	if err := u.repo.UpdateProfile(ctx, id, patch); err != nil {
		return nil, err
	}
	return u.repo.FindByID(ctx, id)
}

// GetPreferences returns the raw JSONB blob. No business rules apply, but
// keeping it in the usecase layer means handlers stay free of repository
// imports.
func (u *UseCase) GetPreferences(ctx context.Context, id uuid.UUID) (json.RawMessage, error) {
	return u.repo.GetPreferences(ctx, id)
}

// ReplacePreferences overwrites the preferences document and returns the
// new value for the client.
func (u *UseCase) ReplacePreferences(ctx context.Context, id uuid.UUID, prefs map[string]any) (map[string]any, error) {
	if err := u.repo.ReplacePreferences(ctx, id, prefs); err != nil {
		return nil, err
	}
	return prefs, nil
}
