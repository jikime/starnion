package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// ConversationPatch is a sparse update for PATCH /conversations/:id.
// Nil fields are unchanged; empty-string PersonaID means "clear the
// persona link" so the caller must distinguish nil from "".
type ConversationPatch struct {
	Title     *string
	PersonaID *string
}

// MessageQuery selects messages inside a conversation. Exactly one of
// Since or Before may be set; if both are empty the most recent `Limit`
// messages are returned.
type MessageQuery struct {
	ConversationID uuid.UUID
	UserID         uuid.UUID
	Limit          int
	Since          time.Time // non-zero → return messages with created_at > Since
	Before         uuid.UUID // non-zero → return messages older than this message
}

// ConversationRepository is the persistence port for conversation +
// message aggregates.
type ConversationRepository interface {
	// List returns up to limit+1 conversations so the caller can detect
	// "has more" without a second query. Pass zero time to start from
	// the newest.
	List(ctx context.Context, userID uuid.UUID, before time.Time, limit int) ([]entity.Conversation, error)

	Create(ctx context.Context, userID uuid.UUID, title, personaID string) (uuid.UUID, error)
	Patch(ctx context.Context, userID, convID uuid.UUID, patch ConversationPatch) error
	Get(ctx context.Context, userID, convID uuid.UUID) (*entity.Conversation, error)
	Delete(ctx context.Context, userID, convID uuid.UUID) error

	// PersonaExistsForUser validates a persona UUID belongs to the given
	// user — used to prevent cross-user persona assignment.
	PersonaExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error)

	// VerifyOwnership returns nil when userID owns convID and
	// domain.ErrNotFound otherwise.
	VerifyOwnership(ctx context.Context, userID, convID uuid.UUID) error

	ListMessages(ctx context.Context, q MessageQuery) ([]entity.Message, bool, string, error)
	DeleteMessage(ctx context.Context, userID, convID, msgID uuid.UUID) error

	// ── agentchat pipeline support ───────────────────────────────
	// These methods back the chat/ws/stream/telegram webhook
	// pipelines in internal/adapter/http/agentchat so those
	// handlers stop embedding raw SQL for the conversations +
	// messages tables. They are intentionally narrow (no entity
	// projections, no business rules) because the pipeline is a
	// hot-path and its stateful flow predates the CA slice model.

	// Touch bumps conversations.updated_at to NOW() for ordering
	// in the conversation list view. Called after every message
	// is appended.
	Touch(ctx context.Context, convID uuid.UUID) error

	// AppendMessage inserts one row into the messages table and
	// returns the new message id. Role is "user" | "assistant" |
	// "tool"; optional observability fields (BotName, ModelUsed,
	// InputTokens, …) are recorded alongside assistant messages
	// for usage-log reconciliation.
	AppendMessage(ctx context.Context, m MessageInsert) (uuid.UUID, error)

	// CreateWithThread creates a conversation tagged with a
	// platform + thread_id (e.g. platform="telegram", thread_id=
	// "<chat_id>"). Used by the Telegram webhook on first-contact
	// and by the /chat/stream endpoint when the client opens a
	// fresh session without a known conv id.
	CreateWithThread(ctx context.Context, userID uuid.UUID, title, platform, threadID string) (uuid.UUID, error)

	// FindLatestByThread returns the most recent conversation id
	// for the given (userID, platform, thread_id). Multiple rows
	// may exist — /new in Telegram creates a second conversation
	// for the same thread — so the latest row wins.
	FindLatestByThread(ctx context.Context, userID uuid.UUID, platform, threadID string) (uuid.UUID, bool, error)

	// UpdateTitle sets just the title column. Used by the
	// Telegram handler when a username changes between visits.
	UpdateTitle(ctx context.Context, convID uuid.UUID, title string) error

	// ResolveOrCreate returns a conversation ID suitable for the
	// chat/ws/stream web pipelines:
	//
	//   - threadID empty        → create a brand-new conversation
	//                              (uuid.New) owned by userID.
	//   - threadID found for user → return that UUID unchanged.
	//   - threadID looks like a UUID but not found → INSERT a new
	//     row with that UUID (ON CONFLICT DO NOTHING so a racing
	//     insert is a no-op) and return it.
	//   - threadID does NOT parse → fall back to uuid.New().
	//
	// The "use supplied UUID" branch matches the legacy agentchat
	// behaviour where the web client owns the conversation ID.
	ResolveOrCreate(ctx context.Context, userID uuid.UUID, threadID, title string) (uuid.UUID, error)
}

// MessageInsert is the write shape for AppendMessage. Fields
// after Content are optional — zero values mean "column stays
// NULL" except for the integer counters which default to 0.
type MessageInsert struct {
	ID             uuid.UUID
	ConversationID uuid.UUID
	Role           string
	Content        string
	Attachments    []byte // JSON blob; nil = no attachments
	BotName        string
	ModelUsed      string
	InputTokens    int
	OutputTokens   int
	ContextTokens  int
	ContextWindow  int
	ToolEvents     []byte // JSON blob of tool_use/tool_result events; nil = no tool events
}
