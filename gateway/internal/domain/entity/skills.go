package entity

import "time"

// SkillMeta is the YAML frontmatter the gateway reads from every
// agent/skills/<id>/SKILL.md file. The fields mirror the UI-facing
// skill-catalogue shape — see infrastructure/skillcat for the
// filesystem scanner that populates them.
type SkillMeta struct {
	ID               string
	DisplayName      string
	Description      string
	Emoji            string
	Category         string
	EnabledByDefault bool
	RequiresAPIKey   bool
	APIKeyProvider   string
	APIKeyType       string
	APIKeyLabel      string
	APIKeyLabel1     string
	APIKeyLabel2     string
	UsesProvider     bool
}

// SkillCatalogueEntry is one row in the /skills response — the
// SKILL.md metadata merged with per-user enablement state and
// credential status.
type SkillCatalogueEntry struct {
	Meta           SkillMeta
	DisplayName    string // after i18n override
	Description    string // after i18n override
	Enabled        bool
	HasAPIKey      bool
	MaskedKey      string
	OAuthConnected bool
	OAuthExpiresAt *time.Time
}
