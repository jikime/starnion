package repository

import (
	"context"

	"github.com/google/uuid"
)

// UserSkillsRepository owns the user_skills table. Integration keys
// and Google tokens are handled by IntegrationsRepository — the
// skills usecase delegates there via the integrations usecase.
type UserSkillsRepository interface {
	// ListEnabled returns a map of skill_id -> enabled for the user.
	// Missing rows mean "use the SKILL.md default".
	ListEnabled(ctx context.Context, userID uuid.UUID) (map[string]bool, error)

	// Toggle flips (or seeds) the enabled flag for a single skill.
	Toggle(ctx context.Context, userID uuid.UUID, skillID string, enabled bool) error

	// GetUserLanguage reads the user's preferred UI language from
	// the `users.preferences` JSONB. Falls back to "ko" when unset.
	GetUserLanguage(ctx context.Context, userID uuid.UUID) string
}
