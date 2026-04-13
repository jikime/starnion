package entity

import "time"

// Notification is one in-app alert row owned by a user. Deliveries to
// external channels (Telegram, email, …) are tracked separately by the
// dispatcher; this struct represents the row as persisted for the
// in-app notification centre.
type Notification struct {
	ID        int64
	Type      string
	Message   string
	Read      bool
	CreatedAt time.Time
}
