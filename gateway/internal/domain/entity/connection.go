package entity

import (
	"time"

	"github.com/google/uuid"
)

// ConnectionCategory is the canonical 4-value enum for a connection's
// relationship type. The DB CHECK constraint in 007_connections.sql
// enforces these exact lowercase strings.
type ConnectionCategory string

const (
	CategoryFamily       ConnectionCategory = "family"
	CategoryFriend       ConnectionCategory = "friend"
	CategoryBusiness     ConnectionCategory = "business"
	CategoryAcquaintance ConnectionCategory = "acquaintance"
)

// AllowedCategories is iteration-friendly for validation loops.
var AllowedCategories = []ConnectionCategory{
	CategoryFamily,
	CategoryFriend,
	CategoryBusiness,
	CategoryAcquaintance,
}

// IsValid returns true iff the category matches one of the four
// canonical values, case-sensitive (BR-CAT-1).
func (c ConnectionCategory) IsValid() bool {
	for _, ok := range AllowedCategories {
		if c == ok {
			return true
		}
	}
	return false
}

// SocialProfiles is the JSONB payload stored in connections.social_profiles.
// Phase 1 allows exactly 5 keys; unknown keys are rejected at the usecase
// layer (BR-SOCIAL-1). All fields are optional — a nil map or an empty
// map both serialize to the same `{}` on the wire.
//
// Stored and returned as a plain map so the merge-patch logic in
// mergeSocialProfiles can walk the keys directly.
type SocialProfiles map[string]string

// KnownSocialPlatforms is the closed set of accepted keys for Phase 1.
// The usecase rejects any key not in this list.
var KnownSocialPlatforms = []string{"facebook", "instagram", "x", "linkedin", "threads"}

// BusinessCard is the JSONB payload stored in connections.business_card.
// Populated by the connect-ocr skill (UC-106) and by the
// POST /connections/:id/business-card attach endpoint (UC-110). All
// fields except ImageURL are optional; the gateway sets ScannedAt on write.
type BusinessCard struct {
	ImageURL      string    `json:"image_url"`
	CompanyNameEN string    `json:"company_name_en,omitempty"`
	Dept          string    `json:"dept,omitempty"`
	Address       string    `json:"address,omitempty"`
	Website       string    `json:"website,omitempty"`
	Fax           string    `json:"fax,omitempty"`
	ScannedAt     time.Time `json:"scanned_at"`
	OCRRawText    string    `json:"ocr_raw_text,omitempty"`
}

// Connection is the canonical aggregate for the Connect (인맥) feature.
// Nullable columns are modelled as pointer types so the repository layer
// can distinguish "unset" from "empty string" and the handler layer can
// marshal `null` correctly on the wire.
type Connection struct {
	ID                     uuid.UUID
	UserID                 uuid.UUID
	Name                   string
	Role                   *string
	Company                *string
	Category               ConnectionCategory
	Email                  *string
	Phone                  *string
	Birthday               *time.Time
	MeetingLocation        *string
	GroupKey               *string
	Tags                   []string
	ContextNotes           string
	LastContactAt          *time.Time
	ContactFrequencyTarget int
	ConnectionScore        float64
	BusinessCard           *BusinessCard
	SocialProfiles         SocialProfiles
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// ConnectionListFilter carries the query-string filters accepted by the
// list endpoint (UC-104). Zero values mean "no filter".
type ConnectionListFilter struct {
	// Categories is the set of categories to include. Empty → all.
	Categories []ConnectionCategory
	// Query is a substring match applied to `name` (ILIKE %q%).
	Query string
	// Sort is one of: score_desc (default), name_asc, last_contact_desc,
	// last_contact_asc, created_desc. The usecase validates.
	Sort string
	// Limit is clamped to 1..200 by the usecase. Zero → default 50.
	Limit int
	// Offset is the pagination offset. Negative → 0.
	Offset int
}

// ConnectionListResult is the paginated return for UC-104. Items is
// always non-nil (empty slice rather than nil) so the handler can
// marshal `"items": []` without a special case.
type ConnectionListResult struct {
	Items  []Connection
	Total  int
	Limit  int
	Offset int
}
