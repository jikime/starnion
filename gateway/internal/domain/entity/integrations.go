package entity

import "time"

// IntegrationKey is one row in integration_keys. APIKey is plaintext
// as decrypted by the repository.
type IntegrationKey struct {
	Provider string
	APIKey   string
}

// GoogleTokens is one row in google_tokens. Access and refresh tokens
// are **plaintext** as decrypted by the repository.
type GoogleTokens struct {
	AccessToken  string
	RefreshToken string
	Scopes       string
	ExpiresAt    time.Time
}
