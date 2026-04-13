package persona

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// fakePersonaRepo is an in-memory stand-in for the persona repository
// port. Each test wires only the fields it cares about; unused hooks
// return zero values.
type fakePersonaRepo struct {
	createReceived  repository.PersonaCreate
	createCalled    bool
	createID        uuid.UUID
	updateReceived  repository.PersonaUpdate
	updateCalled    bool
	existsForUserOK bool
	existsForUserE  error
	setActiveCalled bool
	setActiveVal    string
}

func (f *fakePersonaRepo) List(ctx context.Context, userID uuid.UUID) ([]entity.Persona, error) {
	return nil, nil
}

func (f *fakePersonaRepo) Create(ctx context.Context, userID uuid.UUID, cmd repository.PersonaCreate) (uuid.UUID, error) {
	f.createCalled = true
	f.createReceived = cmd
	if f.createID == uuid.Nil {
		f.createID = uuid.New()
	}
	return f.createID, nil
}

func (f *fakePersonaRepo) Update(ctx context.Context, userID, personaID uuid.UUID, patch repository.PersonaUpdate) error {
	f.updateCalled = true
	f.updateReceived = patch
	return nil
}

func (f *fakePersonaRepo) Delete(ctx context.Context, userID, personaID uuid.UUID) error {
	return nil
}

func (f *fakePersonaRepo) Default(ctx context.Context, userID uuid.UUID) (entity.ActivePersona, error) {
	return entity.ActivePersona{}, nil
}

func (f *fakePersonaRepo) SetActivePersonaID(ctx context.Context, userID uuid.UUID, personaID string) error {
	f.setActiveCalled = true
	f.setActiveVal = personaID
	return nil
}

func (f *fakePersonaRepo) ExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error) {
	return f.existsForUserOK, f.existsForUserE
}

func TestCreate_RequiresName(t *testing.T) {
	repo := &fakePersonaRepo{}
	uc := NewUseCase(repo)
	_, err := uc.Create(context.Background(), uuid.New(), CreateCommand{})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected ErrInvalidArgument, got %v", err)
	}
	if repo.createCalled {
		t.Errorf("repo.Create should not run when name is empty")
	}
}

func TestCreate_TrimsOversizedFields(t *testing.T) {
	repo := &fakePersonaRepo{}
	uc := NewUseCase(repo)
	_, err := uc.Create(context.Background(), uuid.New(), CreateCommand{
		Name:         strings.Repeat("n", maxName+10),
		Description:  strings.Repeat("d", maxDescription+10),
		SystemPrompt: strings.Repeat("s", maxSystemPrompt+50),
		BotName:      strings.Repeat("b", maxBotName+10),
		UserName:     strings.Repeat("u", maxUserName+10),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := repo.createReceived
	if len(got.Name) != maxName {
		t.Errorf("Name: expected %d, got %d", maxName, len(got.Name))
	}
	if len(got.Description) != maxDescription {
		t.Errorf("Description: expected %d, got %d", maxDescription, len(got.Description))
	}
	if len(got.SystemPrompt) != maxSystemPrompt {
		t.Errorf("SystemPrompt: expected %d, got %d", maxSystemPrompt, len(got.SystemPrompt))
	}
	if len(got.BotName) != maxBotName {
		t.Errorf("BotName: expected %d, got %d", maxBotName, len(got.BotName))
	}
	if len(got.UserName) != maxUserName {
		t.Errorf("UserName: expected %d, got %d", maxUserName, len(got.UserName))
	}
}

func TestUpdate_TrimsOversizedFields(t *testing.T) {
	repo := &fakePersonaRepo{}
	uc := NewUseCase(repo)
	err := uc.Update(context.Background(), uuid.New(), uuid.New(), UpdateCommand{
		Name:         strings.Repeat("n", maxName+5),
		SystemPrompt: strings.Repeat("s", maxSystemPrompt+5),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.updateCalled {
		t.Fatalf("expected repo.Update to be called")
	}
	if len(repo.updateReceived.Name) != maxName {
		t.Errorf("expected Name trimmed to %d, got %d", maxName, len(repo.updateReceived.Name))
	}
	if len(repo.updateReceived.SystemPrompt) != maxSystemPrompt {
		t.Errorf("expected SystemPrompt trimmed to %d, got %d", maxSystemPrompt, len(repo.updateReceived.SystemPrompt))
	}
}

func TestSetActive_EmptyClearsWithoutValidation(t *testing.T) {
	repo := &fakePersonaRepo{}
	uc := NewUseCase(repo)
	if err := uc.SetActive(context.Background(), uuid.New(), ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.setActiveCalled || repo.setActiveVal != "" {
		t.Errorf("expected SetActivePersonaID to be called with empty string")
	}
}

func TestSetActive_RejectsInvalidUUID(t *testing.T) {
	repo := &fakePersonaRepo{}
	uc := NewUseCase(repo)
	err := uc.SetActive(context.Background(), uuid.New(), "not-a-uuid")
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected ErrInvalidArgument, got %v", err)
	}
	if repo.setActiveCalled {
		t.Errorf("SetActivePersonaID must not run on invalid uuid input")
	}
}

func TestSetActive_RejectsCrossUserPersona(t *testing.T) {
	repo := &fakePersonaRepo{existsForUserOK: false}
	uc := NewUseCase(repo)
	err := uc.SetActive(context.Background(), uuid.New(), uuid.New().String())
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if repo.setActiveCalled {
		t.Errorf("SetActivePersonaID must not run when persona is not owned by user")
	}
}

func TestSetActive_HappyPath(t *testing.T) {
	pid := uuid.New().String()
	repo := &fakePersonaRepo{existsForUserOK: true}
	uc := NewUseCase(repo)
	if err := uc.SetActive(context.Background(), uuid.New(), pid); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.setActiveVal != pid {
		t.Errorf("expected %q forwarded to repo, got %q", pid, repo.setActiveVal)
	}
}
