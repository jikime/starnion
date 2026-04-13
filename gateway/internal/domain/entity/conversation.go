package entity

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Conversation is a chat thread owned by a user. persona_id is optional
// and points to the persona template the user selected when creating
// the thread.
type Conversation struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	Title       string
	Platform    string
	ThreadID    string
	PersonaID   string
	PersonaName string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Message is one turn inside a conversation.
type Message struct {
	ID            uuid.UUID
	Role          string // "user" | "assistant" | "system"
	Content       string
	Attachments   json.RawMessage
	CreatedAt     time.Time
	BotName       string
	ModelUsed     string
	InputTokens   int
	OutputTokens  int
	ContextTokens int
	ContextWindow int
	ToolEvents    json.RawMessage
}
