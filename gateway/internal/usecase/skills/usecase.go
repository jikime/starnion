// Package skills hosts the skills catalogue + credential-management
// use case. It merges SKILL.md files (infrastructure/skillcat
// Scanner) with the user_skills table and delegates integration key
// + Google OAuth state to the integrations usecase.
package skills

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// Catalogue is the port over the filesystem SKILL.md scanner.
type Catalogue interface {
	ListAll() []entity.SkillMeta
	Get(id string) (entity.SkillMeta, error)
}

// IntegrationAccessor is the narrow slice of the integrations
// usecase the skills usecase needs. Injecting the interface (instead
// of the concrete *integrationsusecase.UseCase) keeps the dependency
// direction explicit and unit-testable.
type IntegrationAccessor interface {
	// GetPlainKey returns the decrypted API key for a provider, or
	// "" if none is configured.
	GetPlainKey(ctx context.Context, userID uuid.UUID, provider string) (string, error)
	// UpsertPlainKey persists an API key; provider must pass the
	// integrations allow-list.
	UpsertPlainKey(ctx context.Context, userID uuid.UUID, provider, apiKey string) error
	// DeletePlainKey removes the provider's row.
	DeletePlainKey(ctx context.Context, userID uuid.UUID, provider string) error
	// GetGoogleExpiresAt returns the expiry of the stored google
	// token (or zero time when no token is stored).
	GetGoogleExpiresAt(ctx context.Context, userID uuid.UUID) (time.Time, bool)
	// SignOAuthState returns a one-time-use HMAC state token for
	// the given user id.
	SignOAuthState(userID string) string
	// DisconnectGoogle revokes and deletes the user's Google tokens.
	DisconnectGoogle(ctx context.Context, userID uuid.UUID) error
	// MaskKey returns the display-safe form of an API key
	// ("***...abcd"). Lives on the port so the skills usecase
	// does not import the concrete integrations package just
	// for a 6-line helper.
	MaskKey(raw string) string
}

type UseCase struct {
	userSkills repository.UserSkillsRepository
	catalogue  Catalogue
	integ      IntegrationAccessor
}

func NewUseCase(userSkills repository.UserSkillsRepository, catalogue Catalogue, integ IntegrationAccessor) *UseCase {
	return &UseCase{userSkills: userSkills, catalogue: catalogue, integ: integ}
}

// ListCatalogue returns every skill the gateway knows about merged
// with the user's enablement state and credential status.
func (u *UseCase) ListCatalogue(ctx context.Context, userID uuid.UUID, lang string) ([]entity.SkillCatalogueEntry, error) {
	defs := u.catalogue.ListAll()
	if len(defs) == 0 {
		return []entity.SkillCatalogueEntry{}, nil
	}
	if lang == "" {
		lang = u.userSkills.GetUserLanguage(ctx, userID)
	}
	i18nMap := translations[lang]

	enabledMap, err := u.userSkills.ListEnabled(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Check Google OAuth once — a user's google_tokens row is shared
	// across every google_oauth skill.
	var googleExpiresAt *time.Time
	oauthConnected := false
	needsGoogle := false
	for _, d := range defs {
		if d.APIKeyType == "google_oauth" {
			needsGoogle = true
			break
		}
	}
	if needsGoogle {
		if t, ok := u.integ.GetGoogleExpiresAt(ctx, userID); ok {
			oauthConnected = true
			expiry := t
			googleExpiresAt = &expiry
		}
	}

	out := make([]entity.SkillCatalogueEntry, 0, len(defs))
	for _, meta := range defs {
		enabled, present := enabledMap[meta.ID]
		if !present {
			enabled = meta.EnabledByDefault
		}
		entry := entity.SkillCatalogueEntry{
			Meta:        meta,
			DisplayName: meta.DisplayName,
			Description: meta.Description,
			Enabled:     enabled,
		}
		if tr, ok := i18nMap[meta.ID]; ok {
			entry.DisplayName = tr.DisplayName
			entry.Description = tr.Description
		}
		if meta.APIKeyProvider != "" {
			if raw, err := u.integ.GetPlainKey(ctx, userID, meta.APIKeyProvider); err == nil && raw != "" {
				entry.HasAPIKey = true
				entry.MaskedKey = u.integ.MaskKey(raw)
			}
		}
		if meta.APIKeyType == "google_oauth" {
			entry.OAuthConnected = oauthConnected
			entry.OAuthExpiresAt = googleExpiresAt
		}
		out = append(out, entry)
	}
	return out, nil
}

// ToggleSkill flips the enabled flag for a single skill. When no
// user_skills row exists yet it seeds the row with the opposite of
// the SKILL.md default.
func (u *UseCase) ToggleSkill(ctx context.Context, userID uuid.UUID, skillID string) (bool, error) {
	if !isValidSkillID(skillID) {
		return false, fmt.Errorf("%w: invalid skill id", domain.ErrInvalidArgument)
	}
	enabledMap, err := u.userSkills.ListEnabled(ctx, userID)
	if err != nil {
		return false, err
	}
	current, present := enabledMap[skillID]
	if !present {
		meta, _ := u.catalogue.Get(skillID)
		current = meta.EnabledByDefault
	}
	newEnabled := !current
	if err := u.userSkills.Toggle(ctx, userID, skillID, newEnabled); err != nil {
		return false, err
	}
	return newEnabled, nil
}

// SaveAPIKey looks up the skill's configured provider, validates
// it, and writes the user's API key through the integrations
// usecase.
type SaveKeyResult struct {
	Provider  string
	MaskedKey string
}

func (u *UseCase) SaveAPIKey(ctx context.Context, userID uuid.UUID, skillID, apiKey string) (SaveKeyResult, error) {
	if !isValidSkillID(skillID) {
		return SaveKeyResult{}, fmt.Errorf("%w: invalid skill id", domain.ErrInvalidArgument)
	}
	if apiKey == "" {
		return SaveKeyResult{}, fmt.Errorf("%w: api_key is required", domain.ErrInvalidArgument)
	}
	meta, err := u.catalogue.Get(skillID)
	if err != nil {
		return SaveKeyResult{}, fmt.Errorf("%w: skill not found", domain.ErrNotFound)
	}
	if meta.APIKeyProvider == "" {
		return SaveKeyResult{}, fmt.Errorf("%w: skill has no api_key_provider configured", domain.ErrInvalidArgument)
	}
	if err := u.integ.UpsertPlainKey(ctx, userID, meta.APIKeyProvider, apiKey); err != nil {
		return SaveKeyResult{}, err
	}
	return SaveKeyResult{
		Provider:  meta.APIKeyProvider,
		MaskedKey: u.integ.MaskKey(apiKey),
	}, nil
}

// DeleteAPIKey wipes the API key for the skill's provider.
func (u *UseCase) DeleteAPIKey(ctx context.Context, userID uuid.UUID, skillID string) error {
	if !isValidSkillID(skillID) {
		return fmt.Errorf("%w: invalid skill id", domain.ErrInvalidArgument)
	}
	meta, err := u.catalogue.Get(skillID)
	if err != nil {
		return fmt.Errorf("%w: skill not found", domain.ErrNotFound)
	}
	if meta.APIKeyProvider == "" {
		return fmt.Errorf("%w: skill has no api_key_provider configured", domain.ErrInvalidArgument)
	}
	return u.integ.DeletePlainKey(ctx, userID, meta.APIKeyProvider)
}

// OAuthURLResult bundles the consent URL and the extracted per-user
// client id for the handler to return to the UI.
type OAuthURLResult struct {
	ClientID string
	State    string
}

// BuildOAuthURL returns the client id + signed state for a Google
// OAuth flow tied to the given skill. The handler assembles the
// final URL because the redirect URL is HTTP-layer config.
func (u *UseCase) BuildOAuthURL(ctx context.Context, userID uuid.UUID, skillID string) (OAuthURLResult, error) {
	if !isValidSkillID(skillID) {
		return OAuthURLResult{}, fmt.Errorf("%w: invalid skill id", domain.ErrInvalidArgument)
	}
	meta, err := u.catalogue.Get(skillID)
	if err != nil {
		return OAuthURLResult{}, fmt.Errorf("%w: skill not found", domain.ErrNotFound)
	}
	if meta.APIKeyType != "google_oauth" {
		return OAuthURLResult{}, fmt.Errorf("%w: skill is not a google_oauth skill", domain.ErrInvalidArgument)
	}
	if meta.APIKeyProvider == "" {
		return OAuthURLResult{}, fmt.Errorf("%w: skill has no api_key_provider", domain.ErrInvalidArgument)
	}
	raw, err := u.integ.GetPlainKey(ctx, userID, meta.APIKeyProvider)
	if err != nil || !strings.Contains(raw, ":") {
		return OAuthURLResult{}, fmt.Errorf("%w: google client credentials not configured", domain.ErrInvalidArgument)
	}
	clientID := strings.SplitN(raw, ":", 2)[0]
	return OAuthURLResult{
		ClientID: clientID,
		State:    u.integ.SignOAuthState(userID.String()),
	}, nil
}

// DisconnectOAuth revokes and removes the stored Google tokens.
func (u *UseCase) DisconnectOAuth(ctx context.Context, userID uuid.UUID) error {
	return u.integ.DisconnectGoogle(ctx, userID)
}

// isValidSkillID restricts skill ids to safe path characters so the
// SKILL.md path assembly in the catalogue cannot be used for path
// traversal.
func isValidSkillID(id string) bool {
	if id == "" || len(id) > 100 {
		return false
	}
	for _, r := range id {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_') {
			return false
		}
	}
	return true
}
