package entity

import "time"

// TelegramChannelSettings is one row in channel_settings where
// channel = 'telegram'. BotToken is the **plaintext** token after
// the repository decrypts it — callers that expose this struct over
// HTTP must mask it before responding.
type TelegramChannelSettings struct {
	Enabled     bool
	BotToken    string // plaintext (decrypted)
	BotUsername string
	DMPolicy    string // "allow" | "ask" | "deny"
	GroupPolicy string // "allow" | "ask" | "deny"
}

// PairingRequest is one row in telegram_pairing_requests.
type PairingRequest struct {
	ID          string
	TelegramID  string
	DisplayName string
	Status      string // "pending" | "approved" | "denied"
	RequestedAt time.Time
}

// ApprovedContact is one row in telegram_approved_contacts.
type ApprovedContact struct {
	ID          string
	TelegramID  string
	DisplayName string
	ApprovedAt  time.Time
}
