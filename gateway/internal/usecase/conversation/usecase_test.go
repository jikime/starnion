package conversation

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// fakeRepo is an in-memory repository for testing the conversation
// usecase in isolation from the database. It is intentionally
// unopinionated — each test wires the handful of fields it cares
// about and leaves the rest zero so new tests can extend it without
// churning every existing case.
type fakeRepo struct {
	personaOK      bool
	personaErr     error
	createCalled   bool
	createTitle    string
	createPersona  string
	createID       uuid.UUID
	patchCalled    bool
	patchReceived  repository.ConversationPatch
	listRows       []entity.Conversation
	listErr        error
	messagesRows   []entity.Message
	messagesHasMrr bool
	messagesCursor string
	messagesErr    error
	lastMsgQuery   repository.MessageQuery
}

func (f *fakeRepo) List(ctx context.Context, userID uuid.UUID, before time.Time, limit int) ([]entity.Conversation, error) {
	return f.listRows, f.listErr
}

func (f *fakeRepo) Create(ctx context.Context, userID uuid.UUID, title, personaID string) (uuid.UUID, error) {
	f.createCalled = true
	f.createTitle = title
	f.createPersona = personaID
	if f.createID == uuid.Nil {
		f.createID = uuid.New()
	}
	return f.createID, nil
}

func (f *fakeRepo) Patch(ctx context.Context, userID, convID uuid.UUID, patch repository.ConversationPatch) error {
	f.patchCalled = true
	f.patchReceived = patch
	return nil
}

func (f *fakeRepo) Get(ctx context.Context, userID, convID uuid.UUID) (*entity.Conversation, error) {
	return nil, nil
}

func (f *fakeRepo) Delete(ctx context.Context, userID, convID uuid.UUID) error { return nil }

func (f *fakeRepo) PersonaExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error) {
	return f.personaOK, f.personaErr
}

func (f *fakeRepo) VerifyOwnership(ctx context.Context, userID, convID uuid.UUID) error { return nil }

func (f *fakeRepo) ListMessages(ctx context.Context, q repository.MessageQuery) ([]entity.Message, bool, string, error) {
	f.lastMsgQuery = q
	return f.messagesRows, f.messagesHasMrr, f.messagesCursor, f.messagesErr
}

func (f *fakeRepo) DeleteMessage(ctx context.Context, userID, convID, msgID uuid.UUID) error {
	return nil
}

func (f *fakeRepo) Touch(ctx context.Context, convID uuid.UUID) error { return nil }

func (f *fakeRepo) AppendMessage(ctx context.Context, m repository.MessageInsert) (uuid.UUID, error) {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return m.ID, nil
}

func (f *fakeRepo) CreateWithThread(ctx context.Context, userID uuid.UUID, title, platform, threadID string) (uuid.UUID, error) {
	return uuid.New(), nil
}

func (f *fakeRepo) FindLatestByThread(ctx context.Context, userID uuid.UUID, platform, threadID string) (uuid.UUID, bool, error) {
	return uuid.Nil, false, nil
}

func (f *fakeRepo) UpdateTitle(ctx context.Context, convID uuid.UUID, title string) error {
	return nil
}

func (f *fakeRepo) ResolveOrCreate(ctx context.Context, userID uuid.UUID, threadID, title string) (uuid.UUID, error) {
	return uuid.New(), nil
}

func TestCreate_DefaultTitle(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	if _, err := uc.Create(context.Background(), uuid.New(), CreateCommand{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.createTitle != defaultTitle {
		t.Errorf("expected default title %q, got %q", defaultTitle, repo.createTitle)
	}
}

func TestCreate_TrimsOversizedTitle(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	long := strings.Repeat("a", maxTitleLen+50)
	if _, err := uc.Create(context.Background(), uuid.New(), CreateCommand{Title: long}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.createTitle) != maxTitleLen {
		t.Errorf("expected title trimmed to %d chars, got %d", maxTitleLen, len(repo.createTitle))
	}
}

func TestCreate_RejectsInvalidPersonaID(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	_, err := uc.Create(context.Background(), uuid.New(), CreateCommand{PersonaID: "not-a-uuid"})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected ErrInvalidArgument, got %v", err)
	}
	if repo.createCalled {
		t.Errorf("repo.Create should not be invoked when persona id is invalid")
	}
}

func TestCreate_RejectsCrossUserPersona(t *testing.T) {
	repo := &fakeRepo{personaOK: false}
	uc := NewUseCase(repo)
	_, err := uc.Create(context.Background(), uuid.New(), CreateCommand{PersonaID: uuid.New().String()})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if repo.createCalled {
		t.Errorf("repo.Create should not run when persona ownership check fails")
	}
}

func TestCreate_AcceptsValidPersona(t *testing.T) {
	personaID := uuid.New().String()
	repo := &fakeRepo{personaOK: true}
	uc := NewUseCase(repo)
	if _, err := uc.Create(context.Background(), uuid.New(), CreateCommand{PersonaID: personaID}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.createPersona != personaID {
		t.Errorf("expected persona %q forwarded to repo, got %q", personaID, repo.createPersona)
	}
}

func TestPatch_RejectsEmptyUpdate(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	err := uc.Patch(context.Background(), uuid.New(), uuid.New(), PatchCommand{})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected ErrInvalidArgument on empty patch, got %v", err)
	}
	if repo.patchCalled {
		t.Errorf("repo.Patch should not run on empty patch")
	}
}

func TestPatch_TrimsOversizedTitle(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	long := strings.Repeat("x", maxTitleLen+50)
	if err := uc.Patch(context.Background(), uuid.New(), uuid.New(), PatchCommand{Title: &long}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.patchReceived.Title == nil || len(*repo.patchReceived.Title) != maxTitleLen {
		t.Errorf("expected patch title trimmed to %d chars", maxTitleLen)
	}
}

func TestList_MarksHasMoreAndCursor(t *testing.T) {
	// Produce defaultListLimit+1 rows so the usecase trims the
	// overflow and sets HasMore/NextCursor from the last kept row.
	rows := make([]entity.Conversation, defaultListLimit+1)
	now := time.Now().UTC()
	for i := range rows {
		rows[i] = entity.Conversation{
			ID:        uuid.New(),
			UpdatedAt: now.Add(-time.Duration(i) * time.Minute),
		}
	}
	repo := &fakeRepo{listRows: rows}
	uc := NewUseCase(repo)
	res, err := uc.List(context.Background(), uuid.New(), time.Time{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.HasMore {
		t.Errorf("expected HasMore=true when repo returns limit+1 rows")
	}
	if len(res.Conversations) != defaultListLimit {
		t.Errorf("expected %d conversations kept, got %d", defaultListLimit, len(res.Conversations))
	}
	if res.NextCursor == "" {
		t.Errorf("expected non-empty NextCursor when HasMore is true")
	}
}

func TestListMessages_CapsLimit(t *testing.T) {
	repo := &fakeRepo{}
	uc := NewUseCase(repo)
	// Over-limit request should be coerced back to the default, not
	// forwarded verbatim (which would let a client bypass paging).
	_, err := uc.ListMessages(context.Background(), uuid.New(), uuid.New(), maxMessageLimit*2, time.Time{}, uuid.Nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.lastMsgQuery.Limit != 30 {
		t.Errorf("expected oversized limit coerced to 30, got %d", repo.lastMsgQuery.Limit)
	}
}
