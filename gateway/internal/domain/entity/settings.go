package entity

import "time"

// Provider is one row in the `providers` table. APIKey is **plaintext**
// as decrypted by the repository — the HTTP handler masks it before
// marshalling.
type Provider struct {
	ID            string
	Provider      string
	APIKey        string // plaintext
	BaseURL       string
	EnabledModels []string
	EndpointType  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ProviderMeta is the non-secret projection returned by Get. It omits
// the API key so no one is tempted to return it to the UI.
type ProviderMeta struct {
	ID            string
	Provider      string
	BaseURL       string
	EnabledModels []string
	EndpointType  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ModelPricing is one row in the `model_pricing` table.
type ModelPricing struct {
	Model         string
	Provider      string
	InputUSD      float64
	OutputUSD     float64
	CacheInputUSD float64
	UpdatedAt     time.Time
}

// ModelAssignment pins a (provider, model) pair to a use case (e.g.
// "chat", "embedding", "report").
type ModelAssignment struct {
	ID        string
	UseCase   string
	Provider  string
	Model     string
	UpdatedAt time.Time
}
