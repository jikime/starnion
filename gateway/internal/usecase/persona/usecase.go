// Package persona hosts the persona CRUD + active-persona selector use
// cases. Validation rules (name ≤ 100 chars, description ≤ 500,
// system_prompt ≤ 8000) live here instead of the HTTP handler so they
// are testable against a fake PersonaRepository.
package persona

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	maxName         = 100
	maxDescription  = 500
	maxBotName      = 100
	maxUserName     = 100
	maxSystemPrompt = 8000
)

type UseCase struct {
	repo repository.PersonaRepository
}

func NewUseCase(repo repository.PersonaRepository) *UseCase {
	return &UseCase{repo: repo}
}

type CreateCommand struct {
	Name         string
	Description  string
	Provider     string
	Model        string
	SystemPrompt string
	BotName      string
	UserName     string
	IsDefault    bool
}

type UpdateCommand struct {
	Name         string
	Description  string
	Provider     string
	Model        string
	SystemPrompt string
	BotName      string
	UserName     string
	IsDefault    *bool
}

func (u *UseCase) List(ctx context.Context, userID uuid.UUID) ([]entity.Persona, error) {
	return u.repo.List(ctx, userID)
}

func (u *UseCase) Create(ctx context.Context, userID uuid.UUID, cmd CreateCommand) (uuid.UUID, error) {
	if cmd.Name == "" {
		return uuid.Nil, fmt.Errorf("%w: name is required", domain.ErrInvalidArgument)
	}
	trim := func(s string, max int) string {
		if len(s) > max {
			return s[:max]
		}
		return s
	}
	return u.repo.Create(ctx, userID, repository.PersonaCreate{
		Name:         trim(cmd.Name, maxName),
		Description:  trim(cmd.Description, maxDescription),
		Provider:     cmd.Provider,
		Model:        cmd.Model,
		SystemPrompt: trim(cmd.SystemPrompt, maxSystemPrompt),
		BotName:      trim(cmd.BotName, maxBotName),
		UserName:     trim(cmd.UserName, maxUserName),
		IsDefault:    cmd.IsDefault,
	})
}

func (u *UseCase) Update(ctx context.Context, userID, personaID uuid.UUID, cmd UpdateCommand) error {
	trim := func(s string, max int) string {
		if len(s) > max {
			return s[:max]
		}
		return s
	}
	return u.repo.Update(ctx, userID, personaID, repository.PersonaUpdate{
		Name:         trim(cmd.Name, maxName),
		Description:  trim(cmd.Description, maxDescription),
		Provider:     cmd.Provider,
		Model:        cmd.Model,
		SystemPrompt: trim(cmd.SystemPrompt, maxSystemPrompt),
		BotName:      trim(cmd.BotName, maxBotName),
		UserName:     trim(cmd.UserName, maxUserName),
		IsDefault:    cmd.IsDefault,
	})
}

func (u *UseCase) Delete(ctx context.Context, userID, personaID uuid.UUID) error {
	return u.repo.Delete(ctx, userID, personaID)
}

// GetActive returns the user's current active persona view. Used by
// GET /profile/persona — the handler was previously in handler/user.go
// as a raw SQL call; it now flows through the persona usecase like every
// other domain operation.
func (u *UseCase) GetActive(ctx context.Context, userID uuid.UUID) (entity.ActivePersona, error) {
	return u.repo.Default(ctx, userID)
}

// SetActive validates personaID (when non-empty) and writes it to the
// user's preferences JSONB.
func (u *UseCase) SetActive(ctx context.Context, userID uuid.UUID, personaID string) error {
	if personaID != "" {
		if _, err := uuid.Parse(personaID); err != nil {
			return fmt.Errorf("%w: invalid persona_id", domain.ErrInvalidArgument)
		}
		exists, err := u.repo.ExistsForUser(ctx, userID, personaID)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrNotFound
		}
	}
	return u.repo.SetActivePersonaID(ctx, userID, personaID)
}
