package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// PersonaCreate is the input shape for Create. All string fields are
// pre-trimmed and length-capped by the usecase.
type PersonaCreate struct {
	Name         string
	Description  string
	Provider     string
	Model        string
	SystemPrompt string
	BotName      string
	UserName     string
	IsDefault    bool
}

// PersonaUpdate is the input shape for Update. Empty strings mean
// "leave this column unchanged"; IsDefault is a tri-state pointer so
// nil distinguishes "don't touch" from "explicitly set to false".
type PersonaUpdate struct {
	Name         string
	Description  string
	Provider     string
	Model        string
	SystemPrompt string
	BotName      string
	UserName     string
	IsDefault    *bool
}

// PersonaRepository is the persistence port for the persona aggregate.
type PersonaRepository interface {
	List(ctx context.Context, userID uuid.UUID) ([]entity.Persona, error)
	Create(ctx context.Context, userID uuid.UUID, cmd PersonaCreate) (uuid.UUID, error)

	// Update applies a partial update. When patch.IsDefault == true the
	// implementation must atomically clear every other persona's
	// is_default flag for the same user (single-transaction swap).
	Update(ctx context.Context, userID uuid.UUID, personaID uuid.UUID, patch PersonaUpdate) error

	// Delete removes a persona. Default personas cannot be deleted —
	// the implementation must enforce this and return domain.ErrInvalidArgument.
	Delete(ctx context.Context, userID uuid.UUID, personaID uuid.UUID) error

	// Default returns the current default persona for the user (id + name).
	// Used by GET /profile/persona. Returns (ActivePersona{}, nil) when
	// the user has no default configured.
	Default(ctx context.Context, userID uuid.UUID) (entity.ActivePersona, error)

	// SetActivePersonaID updates the user's preferences JSONB with the
	// active persona selector — used by PATCH /profile/persona.
	SetActivePersonaID(ctx context.Context, userID uuid.UUID, personaID string) error

	// ExistsForUser returns true when personaID belongs to userID. Used
	// to block cross-user persona assignment.
	ExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error)
}
