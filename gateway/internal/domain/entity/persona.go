package entity

import (
	"time"

	"github.com/google/uuid"
)

// Persona is a stored prompt template the user can select for a
// conversation. One persona per user is flagged as the default and is
// used when a conversation is created without an explicit persona_id.
// SystemKey identifies built-in seed personas (e.g. "default_assistant",
// "empathy_friend") so the i18n layer can localise their names.
type Persona struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	Name         string
	Description  string
	Provider     string
	Model        string
	SystemPrompt string
	BotName      string
	UserName     string
	IsDefault    bool
	SystemKey    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ActivePersona is the view returned by GET /profile/persona — it
// combines the default persona lookup with user's preferences-level
// active_persona_id selector.
type ActivePersona struct {
	ID   string
	Name string
}
