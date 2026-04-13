// Package conversation hosts the conversation + message use cases.
// Business rules that used to live in handler/conversation.go (title
// length cap, default title, persona ownership check, pagination
// limits) now live here and are independently testable.
package conversation

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	maxTitleLen      = 200
	defaultTitle     = "새 대화"
	defaultListLimit = 50
	maxMessageLimit  = 100
)

type UseCase struct {
	repo repository.ConversationRepository
}

func NewUseCase(repo repository.ConversationRepository) *UseCase {
	return &UseCase{repo: repo}
}

// CreateCommand is the input DTO for POST /conversations.
type CreateCommand struct {
	Title     string
	PersonaID string
}

// PatchCommand mirrors the PATCH body; the usecase forwards validated
// values to the repository.
type PatchCommand struct {
	Title     *string
	PersonaID *string
}

// ListResult is the response shape for GET /conversations.
type ListResult struct {
	Conversations []entity.Conversation
	HasMore       bool
	NextCursor    string // RFC3339Nano of the oldest conv's updated_at when HasMore
}

// ListMessagesResult is the response shape for GET /conversations/:id/messages.
type ListMessagesResult struct {
	Messages   []entity.Message
	HasMore    bool
	NextCursor string // message UUID to pass as `before` on the next call
}

// List returns up to defaultListLimit conversations for the user, with
// an optional `before` cursor (updated_at) for pagination.
func (u *UseCase) List(ctx context.Context, userID uuid.UUID, before time.Time) (ListResult, error) {
	rows, err := u.repo.List(ctx, userID, before, defaultListLimit)
	if err != nil {
		return ListResult{}, err
	}
	hasMore := len(rows) > defaultListLimit
	if hasMore {
		rows = rows[:defaultListLimit]
	}
	var cursor string
	if hasMore && len(rows) > 0 {
		cursor = rows[len(rows)-1].UpdatedAt.UTC().Format(time.RFC3339Nano)
	}
	return ListResult{Conversations: rows, HasMore: hasMore, NextCursor: cursor}, nil
}

// Create inserts a new conversation after validating title length and
// persona ownership.
func (u *UseCase) Create(ctx context.Context, userID uuid.UUID, cmd CreateCommand) (uuid.UUID, error) {
	title := cmd.Title
	if title == "" {
		title = defaultTitle
	}
	if len(title) > maxTitleLen {
		title = title[:maxTitleLen]
	}
	if cmd.PersonaID != "" {
		if _, err := uuid.Parse(cmd.PersonaID); err != nil {
			return uuid.Nil, fmt.Errorf("%w: invalid persona_id", domain.ErrInvalidArgument)
		}
		ok, err := u.repo.PersonaExistsForUser(ctx, userID, cmd.PersonaID)
		if err != nil {
			return uuid.Nil, err
		}
		if !ok {
			return uuid.Nil, domain.ErrNotFound
		}
	}
	return u.repo.Create(ctx, userID, title, cmd.PersonaID)
}

// Patch applies a partial update.
func (u *UseCase) Patch(ctx context.Context, userID, convID uuid.UUID, cmd PatchCommand) error {
	if cmd.Title == nil && cmd.PersonaID == nil {
		return fmt.Errorf("%w: nothing to update", domain.ErrInvalidArgument)
	}
	if cmd.Title != nil && len(*cmd.Title) > maxTitleLen {
		trimmed := (*cmd.Title)[:maxTitleLen]
		cmd.Title = &trimmed
	}
	return u.repo.Patch(ctx, userID, convID, repository.ConversationPatch{
		Title:     cmd.Title,
		PersonaID: cmd.PersonaID,
	})
}

// Get returns a single conversation by id.
func (u *UseCase) Get(ctx context.Context, userID, convID uuid.UUID) (*entity.Conversation, error) {
	return u.repo.Get(ctx, userID, convID)
}

// Delete removes a conversation (cascade on messages via FK).
func (u *UseCase) Delete(ctx context.Context, userID, convID uuid.UUID) error {
	return u.repo.Delete(ctx, userID, convID)
}

// ListMessages returns the message page, capping the limit at maxMessageLimit.
func (u *UseCase) ListMessages(ctx context.Context, userID, convID uuid.UUID, limit int, since time.Time, before uuid.UUID) (ListMessagesResult, error) {
	if limit <= 0 || limit > maxMessageLimit {
		limit = 30
	}
	msgs, hasMore, cursor, err := u.repo.ListMessages(ctx, repository.MessageQuery{
		ConversationID: convID,
		UserID:         userID,
		Limit:          limit,
		Since:          since,
		Before:         before,
	})
	if err != nil {
		return ListMessagesResult{}, err
	}
	// Reverse so messages are chronological (DESC → ASC).
	if since.IsZero() {
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
	}
	return ListMessagesResult{Messages: msgs, HasMore: hasMore, NextCursor: cursor}, nil
}

// DeleteMessage removes a single message the user owns.
func (u *UseCase) DeleteMessage(ctx context.Context, userID, convID, msgID uuid.UUID) error {
	return u.repo.DeleteMessage(ctx, userID, convID, msgID)
}

// ── agentchat pipeline bridges ────────────────────────────────────
//
// These thin methods pass through to the repository for the
// chat/ws/stream/telegram webhook flows in internal/adapter/http/
// agentchat. They live here so the agentchat package never has to
// hold a *database.DB just to touch the conversations / messages
// tables — one CA slice owns the schema knowledge.

// Touch bumps conversations.updated_at so the conversation list
// order reflects the latest activity.
func (u *UseCase) Touch(ctx context.Context, convID uuid.UUID) error {
	return u.repo.Touch(ctx, convID)
}

// AppendMessage writes one row into the messages table. Pass the
// optional observability fields (BotName, ModelUsed, …) on the
// assistant-message branch so usage-log reconciliation has the
// right per-call metadata.
func (u *UseCase) AppendMessage(ctx context.Context, m repository.MessageInsert) (uuid.UUID, error) {
	return u.repo.AppendMessage(ctx, m)
}

// CreateWithThread creates a platform-threaded conversation row
// (telegram bot first-contact, new /chat/stream session).
func (u *UseCase) CreateWithThread(ctx context.Context, userID uuid.UUID, title, platform, threadID string) (uuid.UUID, error) {
	return u.repo.CreateWithThread(ctx, userID, title, platform, threadID)
}

// FindLatestByThread locates the most recent conversation for
// a (platform, thread_id) pair owned by the user. Returns
// (uuid.Nil, false, nil) when no match exists.
func (u *UseCase) FindLatestByThread(ctx context.Context, userID uuid.UUID, platform, threadID string) (uuid.UUID, bool, error) {
	return u.repo.FindLatestByThread(ctx, userID, platform, threadID)
}

// UpdateTitle rewrites just the title column on an existing
// conversation — used when a Telegram username changes between
// visits so the conversation list stays current.
func (u *UseCase) UpdateTitle(ctx context.Context, convID uuid.UUID, title string) error {
	return u.repo.UpdateTitle(ctx, convID, title)
}

// ResolveOrCreate returns the id of an existing conversation
// matching threadID for userID, or creates a new one. The web
// chat/stream/WS pipelines call this on every new message so a
// client can keep using a thread id that maps to a real row.
func (u *UseCase) ResolveOrCreate(ctx context.Context, userID uuid.UUID, threadID, title string) (uuid.UUID, error) {
	return u.repo.ResolveOrCreate(ctx, userID, threadID, title)
}
