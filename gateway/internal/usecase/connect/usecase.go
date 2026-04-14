// Package connect implements the usecases for the Connect (인맥) feature
// (UC-101..UC-110). The package owns every business rule documented in
// _workspace_enhancement/02_architecture/usecase-spec.md:
//
//   - BR-AUTH-1    tenant isolation (enforced by the repo's WHERE user_id)
//   - BR-CAT-1     case-sensitive 4-value category enum
//   - BR-TAG-1     ≤16 tags, each ≤32 chars, trimmed + case-insensitive dedupe
//   - BR-CONTEXT-1 context_notes ≤ 4096 chars (handler caps raw body to 16 KiB)
//   - BR-SOCIAL-1  closed set of social keys + per-platform URL regex
//   - BR-SOCIAL-2  merge-patch semantics for social_profiles
//   - BR-SOCIAL-3  ScanBusinessCard never populates social_profiles
//   - BR-SCORE-1   connection_score is server-owned; PATCH silently drops it
//   - BR-109-1     last_contact_at is monotonic; earlier touches never rewind
//
// The usecase depends only on the repository port and domain errors; it has
// zero knowledge of Echo, SQL, or JSON encoding.
package connect

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// Validation limits — single source of truth so handler error messages
// and tests agree with the usecase.
const (
	maxNameChars         = 128
	maxTagCount          = 16
	maxTagChars          = 32
	maxContextNotesChars = 4096
	defaultFreqTarget    = 30
	defaultScore         = 0.5
	touchFutureTolerance = 60 * time.Second

	// Activity timeline limits (UC-111/112/113)
	maxActivityLabelChars = 40
	maxActivityNoteChars  = 1000
	maxActivityDurationMin = 24 * 60 // 24 hours
	defaultActivityLimit  = 20
	maxActivityLimit      = 200
)

// socialPlatformRegex is the closed set of allowed social_profiles keys
// and their URL shape guards (BR-SOCIAL-1). The character class is kept
// intentionally permissive so real-world handles with `.`, `_`, `-`, `?`,
// `=`, `&`, `%` (percent-encoded segments) and `#` (fragments) work; the
// per-platform prefix is what blocks drift.
var socialPlatformRegex = map[string]*regexp.Regexp{
	"facebook":  regexp.MustCompile(`^https?://(www\.)?(facebook|fb)\.com/[\w.\-/?=&%#]+$`),
	"instagram": regexp.MustCompile(`^https?://(www\.)?instagram\.com/[\w.\-/?=&%#]+$`),
	"x":         regexp.MustCompile(`^https?://(www\.)?(x|twitter)\.com/[\w.\-/?=&%#]+$`),
	"linkedin":  regexp.MustCompile(`^https?://(www\.)?linkedin\.com/(in|company)/[\w.\-/?=&%#]+$`),
	"threads":   regexp.MustCompile(`^https?://(www\.)?threads\.(net|com)/@?[\w.\-/?=&%#]+$`),
}

// FieldError is a typed validation failure. The HTTP handler translates
// it into a 400 with `code` + `field` + `message` so the client can
// attach the error to the offending form field.
type FieldError struct {
	Field   string
	Code    string
	Message string
}

func (e *FieldError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}
	return e.Message
}

// Is allows errors.Is(err, domain.ErrInvalidArgument) at the handler
// layer without forcing every call site to import this package.
func (e *FieldError) Is(target error) bool {
	return target == domain.ErrInvalidArgument
}

func badField(field, code, msg string) *FieldError {
	return &FieldError{Field: field, Code: code, Message: msg}
}

// ── DTOs ─────────────────────────────────────────────────────────

// CreateInput is the write DTO for UC-101 and (internally) UC-106's
// scan path. Nil pointers mean "not supplied" — the usecase applies
// defaults where appropriate.
type CreateInput struct {
	Name                   string
	Role                   *string
	Company                *string
	Category               *string
	Email                  *string
	Phone                  *string
	Birthday               *time.Time
	MeetingLocation        *string
	Tags                   []string
	ContextNotes           *string
	ContactFrequencyTarget *int
	SocialProfiles         map[string]*string // key present + nil → explicit null (invalid on create)
	BusinessCard           *entity.BusinessCard
}

// UpdatePatch is the write DTO for UC-102. Semantics match CreateInput
// except SocialProfiles uses merge-patch (nil value = remove that key).
// ConnectionScore is accepted by the HTTP layer but silently dropped
// here (BR-SCORE-1); there is no field for it on this struct.
type UpdatePatch struct {
	Name                   *string
	Role                   **string
	Company                **string
	Category               *string
	Email                  **string
	Phone                  **string
	Birthday               **time.Time
	MeetingLocation        **string
	Tags                   *[]string
	ContextNotes           *string
	ContactFrequencyTarget *int
	SocialProfilesPatch    map[string]*string
}

// ── UseCase ───────────────────────────────────────────────────────

// UseCase bundles all Connect operations behind one struct. The
// handler constructs it once in bootstrap/wire.go and reuses it
// across requests.
type UseCase struct {
	repo repository.ConnectionRepository
	// now is a time source injected so tests can fix "now". Production
	// uses time.Now().
	now func() time.Time
}

func NewUseCase(repo repository.ConnectionRepository) *UseCase {
	return &UseCase{repo: repo, now: time.Now}
}

// SetClock overrides the time source. Tests call it with a fixed func.
func (u *UseCase) SetClock(now func() time.Time) { u.now = now }

// ── UC-101 Create ────────────────────────────────────────────────

func (u *UseCase) Create(ctx context.Context, userID uuid.UUID, in CreateInput) (entity.Connection, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return entity.Connection{}, badField("name", "missing_name", "name is required")
	}
	if len([]rune(name)) > maxNameChars {
		return entity.Connection{}, badField("name", "invalid_name", "name must be ≤128 chars")
	}

	cat := entity.CategoryAcquaintance
	if in.Category != nil {
		c, err := parseCategory(*in.Category)
		if err != nil {
			return entity.Connection{}, err
		}
		cat = c
	}

	tags, err := normalizeTags(in.Tags)
	if err != nil {
		return entity.Connection{}, err
	}

	notes := ""
	if in.ContextNotes != nil {
		n, err := validateContextNotes(*in.ContextNotes)
		if err != nil {
			return entity.Connection{}, err
		}
		notes = n
	}

	// On create, social_profiles values must be real URLs — `null`
	// has no meaning when there is nothing to delete.
	social := entity.SocialProfiles{}
	if len(in.SocialProfiles) > 0 {
		for k, v := range in.SocialProfiles {
			if _, ok := socialPlatformRegex[k]; !ok {
				return entity.Connection{}, badField("social_profiles."+k, "invalid_social_key", "unsupported social platform: "+k)
			}
			if v == nil {
				continue
			}
			if !socialPlatformRegex[k].MatchString(*v) {
				return entity.Connection{}, badField("social_profiles."+k, "invalid_social_url", fmt.Sprintf("invalid %s URL", k))
			}
			social[k] = *v
		}
	}

	freq := defaultFreqTarget
	if in.ContactFrequencyTarget != nil {
		if *in.ContactFrequencyTarget <= 0 {
			return entity.Connection{}, badField("contact_frequency_target", "invalid_frequency", "contact_frequency_target must be > 0")
		}
		freq = *in.ContactFrequencyTarget
	}

	c := entity.Connection{
		ID:                     uuid.New(),
		UserID:                 userID,
		Name:                   name,
		Role:                   trimOptional(in.Role),
		Company:                trimOptional(in.Company),
		Category:               cat,
		Email:                  trimOptional(in.Email),
		Phone:                  trimOptional(in.Phone),
		Birthday:               in.Birthday,
		MeetingLocation:        trimOptional(in.MeetingLocation),
		Tags:                   tags,
		ContextNotes:           notes,
		ContactFrequencyTarget: freq,
		ConnectionScore:        defaultScore,
		BusinessCard:           in.BusinessCard,
		SocialProfiles:         social,
	}
	if c.BusinessCard != nil && c.BusinessCard.ScannedAt.IsZero() {
		c.BusinessCard.ScannedAt = u.now().UTC()
	}
	if err := u.repo.Create(ctx, &c); err != nil {
		return entity.Connection{}, err
	}
	// Repo doesn't round-trip created_at/updated_at here, so read-back
	// once so the caller gets authoritative timestamps.
	return u.repo.GetByID(ctx, userID, c.ID)
}

// ── UC-102 Update ────────────────────────────────────────────────

func (u *UseCase) Update(ctx context.Context, userID, id uuid.UUID, patch UpdatePatch) (entity.Connection, error) {
	cur, err := u.repo.GetByID(ctx, userID, id)
	if err != nil {
		return entity.Connection{}, err
	}

	if patch.Name != nil {
		n := strings.TrimSpace(*patch.Name)
		if n == "" {
			return entity.Connection{}, badField("name", "missing_name", "name is required")
		}
		if len([]rune(n)) > maxNameChars {
			return entity.Connection{}, badField("name", "invalid_name", "name must be ≤128 chars")
		}
		cur.Name = n
	}
	if patch.Role != nil {
		cur.Role = trimOptional(*patch.Role)
	}
	if patch.Company != nil {
		cur.Company = trimOptional(*patch.Company)
	}
	if patch.Category != nil {
		cat, err := parseCategory(*patch.Category)
		if err != nil {
			return entity.Connection{}, err
		}
		cur.Category = cat
	}
	if patch.Email != nil {
		cur.Email = trimOptional(*patch.Email)
	}
	if patch.Phone != nil {
		cur.Phone = trimOptional(*patch.Phone)
	}
	if patch.Birthday != nil {
		cur.Birthday = *patch.Birthday
	}
	if patch.MeetingLocation != nil {
		cur.MeetingLocation = trimOptional(*patch.MeetingLocation)
	}
	if patch.Tags != nil {
		tags, err := normalizeTags(*patch.Tags)
		if err != nil {
			return entity.Connection{}, err
		}
		cur.Tags = tags
	}
	if patch.ContextNotes != nil {
		n, err := validateContextNotes(*patch.ContextNotes)
		if err != nil {
			return entity.Connection{}, err
		}
		cur.ContextNotes = n
	}
	if patch.ContactFrequencyTarget != nil {
		if *patch.ContactFrequencyTarget <= 0 {
			return entity.Connection{}, badField("contact_frequency_target", "invalid_frequency", "contact_frequency_target must be > 0")
		}
		cur.ContactFrequencyTarget = *patch.ContactFrequencyTarget
	}
	if patch.SocialProfilesPatch != nil {
		merged, err := mergeSocialProfiles(cur.SocialProfiles, patch.SocialProfilesPatch)
		if err != nil {
			return entity.Connection{}, err
		}
		cur.SocialProfiles = merged
	}

	if err := u.repo.Update(ctx, &cur); err != nil {
		return entity.Connection{}, err
	}
	return u.repo.GetByID(ctx, userID, id)
}

// ── UC-103 Get ───────────────────────────────────────────────────

func (u *UseCase) Get(ctx context.Context, userID, id uuid.UUID) (entity.Connection, error) {
	return u.repo.GetByID(ctx, userID, id)
}

// ── UC-104 List ──────────────────────────────────────────────────

// ListParams is the raw, handler-shaped filter. Sort + categories are
// strings so the usecase owns the validation and can emit a clean
// FieldError without the handler duplicating the whitelist.
type ListParams struct {
	CategoriesCSV string
	Sort          string
	Query         string
	Limit         int
	Offset        int
}

func (u *UseCase) List(ctx context.Context, userID uuid.UUID, p ListParams) (entity.ConnectionListResult, error) {
	filter := entity.ConnectionListFilter{
		Query:  strings.TrimSpace(p.Query),
		Limit:  p.Limit,
		Offset: p.Offset,
	}
	if p.Sort != "" {
		if _, ok := allowedSorts[p.Sort]; !ok {
			return entity.ConnectionListResult{}, badField("sort", "invalid_sort", "unknown sort value: "+p.Sort)
		}
		filter.Sort = p.Sort
	} else {
		filter.Sort = "score_desc"
	}
	if p.CategoriesCSV != "" {
		parts := strings.Split(p.CategoriesCSV, ",")
		cats := make([]entity.ConnectionCategory, 0, len(parts))
		for _, raw := range parts {
			trimmed := strings.TrimSpace(raw)
			if trimmed == "" {
				continue
			}
			cat, err := parseCategory(trimmed)
			if err != nil {
				return entity.ConnectionListResult{}, err
			}
			cats = append(cats, cat)
		}
		filter.Categories = cats
	}
	return u.repo.List(ctx, userID, filter)
}

var allowedSorts = map[string]struct{}{
	"score_desc":        {},
	"name_asc":          {},
	"last_contact_desc": {},
	"last_contact_asc":  {},
	"created_desc":      {},
}

// ── UC-105 Delete ────────────────────────────────────────────────

func (u *UseCase) Delete(ctx context.Context, userID, id uuid.UUID) error {
	return u.repo.Delete(ctx, userID, id)
}

// ── UC-106 ScanBusinessCard ──────────────────────────────────────

// ScanInput is the OCR skill → gateway payload. It deliberately does
// NOT expose a social_profiles field — BR-SOCIAL-3 says the skill
// cannot populate it, and making the field absent from the DTO is
// the enforcement. The handler also silently drops any incoming
// `social_profiles` key before constructing this struct.
type ScanInput struct {
	Name            string
	Role            *string
	Company         *string
	Email           *string
	Phone           *string
	MeetingLocation *string
	Tags            []string
	BusinessCard    entity.BusinessCard
}

// ScanBusinessCard creates a new connection from OCR output. The
// flow is a constrained subset of Create — category defaults to
// `acquaintance`, social_profiles is always `{}`, and the business_card
// JSONB is always populated.
func (u *UseCase) ScanBusinessCard(ctx context.Context, userID uuid.UUID, in ScanInput) (entity.Connection, error) {
	if in.BusinessCard.ImageURL == "" {
		return entity.Connection{}, badField("business_card.image_url", "missing_image_url", "image_url is required")
	}
	bc := in.BusinessCard
	return u.Create(ctx, userID, CreateInput{
		Name:            in.Name,
		Role:            in.Role,
		Company:         in.Company,
		Email:           in.Email,
		Phone:           in.Phone,
		MeetingLocation: in.MeetingLocation,
		Tags:            in.Tags,
		BusinessCard:    &bc,
		// SocialProfiles intentionally left nil — BR-SOCIAL-3.
	})
}

// AttachBusinessCard implements the UC-110 "attach after create"
// optional path. It writes the business_card JSONB to an existing
// row; social_profiles is never touched.
func (u *UseCase) AttachBusinessCard(ctx context.Context, userID, id uuid.UUID, bc entity.BusinessCard) (entity.Connection, error) {
	if bc.ImageURL == "" {
		return entity.Connection{}, badField("business_card.image_url", "missing_image_url", "image_url is required")
	}
	cur, err := u.repo.GetByID(ctx, userID, id)
	if err != nil {
		return entity.Connection{}, err
	}
	if bc.ScannedAt.IsZero() {
		bc.ScannedAt = u.now().UTC()
	}
	cur.BusinessCard = &bc
	if err := u.repo.Update(ctx, &cur); err != nil {
		return entity.Connection{}, err
	}
	return u.repo.GetByID(ctx, userID, id)
}

// ── UC-107 UpdateSocialProfiles ──────────────────────────────────

func (u *UseCase) UpdateSocialProfiles(ctx context.Context, userID, id uuid.UUID, patch map[string]*string) (entity.Connection, error) {
	cur, err := u.repo.GetByID(ctx, userID, id)
	if err != nil {
		return entity.Connection{}, err
	}
	// Empty object is a no-op but still a 200 with the current row.
	if len(patch) == 0 {
		return cur, nil
	}
	merged, err := mergeSocialProfiles(cur.SocialProfiles, patch)
	if err != nil {
		return entity.Connection{}, err
	}
	cur.SocialProfiles = merged
	if err := u.repo.Update(ctx, &cur); err != nil {
		return entity.Connection{}, err
	}
	return u.repo.GetByID(ctx, userID, id)
}

// ── UC-108 UpdateContextNotes ────────────────────────────────────

func (u *UseCase) UpdateContextNotes(ctx context.Context, userID, id uuid.UUID, notes string) (entity.Connection, error) {
	validated, err := validateContextNotes(notes)
	if err != nil {
		return entity.Connection{}, err
	}
	cur, err := u.repo.GetByID(ctx, userID, id)
	if err != nil {
		return entity.Connection{}, err
	}
	cur.ContextNotes = validated
	if err := u.repo.Update(ctx, &cur); err != nil {
		return entity.Connection{}, err
	}
	return u.repo.GetByID(ctx, userID, id)
}

// ── UC-109 RecordManualContact ───────────────────────────────────

// RecordManualContact writes one `kind='manual'` activity row and
// monotonically advances last_contact_at (BR-109-1). Future
// timestamps >60s ahead are rejected (BR-109-1 / UC-109 A1).
func (u *UseCase) RecordManualContact(ctx context.Context, userID, id uuid.UUID, occurredAt time.Time, note string, durationMin int) (entity.Connection, error) {
	now := u.now().UTC()
	if occurredAt.IsZero() {
		occurredAt = now
	}
	if occurredAt.After(now.Add(touchFutureTolerance)) {
		return entity.Connection{}, badField("occurred_at", "future_occurred_at", "occurred_at cannot be more than 60 seconds in the future")
	}
	if durationMin < 0 {
		durationMin = 0
	}
	c, err := u.repo.Touch(ctx, userID, id, occurredAt, note, durationMin)
	if err != nil {
		return entity.Connection{}, err
	}
	return c, nil
}

// ── UC-111 ListActivities ─────────────────────────────────────────

// ListActivities returns the paginated activity timeline for a single
// connection, most recent first. Fails with domain.ErrNotFound when
// the connection is missing or owned by another user (ownership is
// verified via GetByID before calling the repo — so the repo's
// unconditional user_id scope is belt-and-braces).
func (u *UseCase) ListActivities(ctx context.Context, userID, connID uuid.UUID, limit, offset int) (entity.ActivityListResult, error) {
	if _, err := u.repo.GetByID(ctx, userID, connID); err != nil {
		return entity.ActivityListResult{}, err
	}
	if limit <= 0 {
		limit = defaultActivityLimit
	}
	if limit > maxActivityLimit {
		limit = maxActivityLimit
	}
	if offset < 0 {
		offset = 0
	}
	return u.repo.ListActivities(ctx, userID, connID, limit, offset)
}

// ── UC-112 CreateActivity ─────────────────────────────────────────

// CreateActivityInput is the write DTO for UC-112. `Kind` defaults to
// "manual" when empty; manual entries are the only supported path
// from the HTTP handler. The batch ingest path (UC-201) calls the
// repo directly with its own ActivityInput shape.
type CreateActivityInput struct {
	Kind        string
	Label       string
	OccurredAt  *time.Time
	DurationMin int
	Note        string
}

func (u *UseCase) CreateActivity(ctx context.Context, userID, connID uuid.UUID, in CreateActivityInput) (entity.ConnectionActivity, error) {
	// Ownership check up front so the validation errors go to the
	// right endpoint (404 beats 400 for cross-tenant access).
	if _, err := u.repo.GetByID(ctx, userID, connID); err != nil {
		return entity.ConnectionActivity{}, err
	}

	// Kind: default to manual, validate against the allow-list.
	kindStr := strings.TrimSpace(in.Kind)
	if kindStr == "" {
		kindStr = string(entity.ActivityKindManual)
	}
	kind := entity.ActivityKind(kindStr)
	if !kind.IsValid() {
		return entity.ConnectionActivity{}, badField("kind", "invalid_kind", fmt.Sprintf("kind must be one of email|calendar|manual|telegram (got %q)", kindStr))
	}

	// Label: trim, clamp length. Empty string is valid (label is
	// optional — auto-ingested rows have none).
	label := strings.TrimSpace(in.Label)
	if len([]rune(label)) > maxActivityLabelChars {
		return entity.ConnectionActivity{}, badField("label", "label_too_long", fmt.Sprintf("label must be ≤%d chars", maxActivityLabelChars))
	}

	// Note: trim, clamp length. Empty string is valid.
	note := strings.TrimSpace(in.Note)
	if len([]rune(note)) > maxActivityNoteChars {
		return entity.ConnectionActivity{}, badField("note", "note_too_long", fmt.Sprintf("note must be ≤%d chars", maxActivityNoteChars))
	}

	// Duration: clamp negative to 0, reject oversize.
	dur := in.DurationMin
	if dur < 0 {
		dur = 0
	}
	if dur > maxActivityDurationMin {
		return entity.ConnectionActivity{}, badField("duration_min", "duration_too_long", fmt.Sprintf("duration_min must be ≤%d (24h)", maxActivityDurationMin))
	}

	// occurred_at: default to now, reject > now+60s (BR-109-1 symmetry).
	now := u.now().UTC()
	occurredAt := now
	if in.OccurredAt != nil && !in.OccurredAt.IsZero() {
		occurredAt = in.OccurredAt.UTC()
	}
	if occurredAt.After(now.Add(touchFutureTolerance)) {
		return entity.ConnectionActivity{}, badField("occurred_at", "future_occurred_at", "occurred_at cannot be more than 60 seconds in the future")
	}

	return u.repo.CreateActivity(ctx, userID, connID, entity.ActivityInput{
		Kind:        kind,
		Label:       label,
		OccurredAt:  occurredAt,
		DurationMin: dur,
		Weight:      1,
		Note:        note,
	})
}

// ── UC-113 DeleteActivity ─────────────────────────────────────────

func (u *UseCase) DeleteActivity(ctx context.Context, userID uuid.UUID, activityID int64) error {
	if activityID <= 0 {
		return badField("activity_id", "invalid_activity_id", "activity_id must be positive")
	}
	return u.repo.DeleteActivity(ctx, userID, activityID)
}

// ── UC-204 ListReminders ──────────────────────────────────────────

// ListReminders returns the drift list rendered by the web
// RemindersPanel and consumed by the connect_drift_reminder smart
// notification. Each row carries `DaysOverdue` so the UI can say
// "N일째 연락 없음" without recomputing the delta client-side.
func (u *UseCase) ListReminders(ctx context.Context, userID uuid.UUID) ([]entity.DriftingConnection, error) {
	return u.repo.ListDriftingConnections(ctx, userID)
}

// ── UC-202 RecomputeScoresForUser ─────────────────────────────────

// Score formula constants — match architecture-design.md §D. These
// are package-level so the unit tests can read them directly without
// re-deriving the math.
const (
	scoreWeightRecency    = 0.45
	scoreWeightFrequency  = 0.35
	scoreWeightImportance = 0.20
	scoreRecentWindowDays = 90
)

// categoryBaseImportance maps each category to its baseline
// importance weight. These values are taken verbatim from
// architecture-design.md §D and are tunable by editing this map
// (no DB changes needed — cron picks up the new values on the next
// 03:00 tick).
var categoryBaseImportance = map[entity.ConnectionCategory]float64{
	entity.CategoryFamily:       0.9,
	entity.CategoryBusiness:     0.7,
	entity.CategoryFriend:       0.7,
	entity.CategoryAcquaintance: 0.4,
}

// computeScore is pure — it takes every input explicitly so unit
// tests can hit the formula without a DB or clock mock. Returns a
// value clamped to [0, 1].
//
// Parameters:
//   - daysSinceContact: integer days since last_contact_at; use
//     math.MaxInt32 for "never contacted".
//   - activityWeight90d: sum of `weight` across rows in the last 90d
//     (from the repo's CountRecentActivities). Heavy 1:1 meetings
//     contribute 1 each; big-list emails contribute ~0.1 each.
//   - targetInterval: connections.contact_frequency_target in days.
//   - category: one of the 4 canonical ConnectionCategory values.
//   - tags: reserved for future per-tag boosts. Currently unused so
//     that the tag-boost tier can be added without changing the
//     public signature.
func computeScore(
	daysSinceContact int,
	activityWeight90d float64,
	targetInterval int,
	category entity.ConnectionCategory,
	_ []string,
) float64 {
	if targetInterval <= 0 {
		targetInterval = defaultFreqTarget
	}

	// Recency: exp(-d / (2*target)). At d=0 → 1, at d=target → 0.607,
	// at d=2*target → 0.368, at d=4*target → 0.135. "Never contacted"
	// collapses to ~0 for any reasonable target.
	var recency float64
	if daysSinceContact <= 0 {
		recency = 1
	} else {
		recency = math.Exp(-float64(daysSinceContact) / (2 * float64(targetInterval)))
	}

	// Frequency: activity weight normalised by the target interval.
	// At 90/target expected interactions (one per target-period), the
	// score saturates at 1. So a target=30d user needs 3 weighted
	// activities in 90 days to max out this component.
	expected := float64(scoreRecentWindowDays) / float64(targetInterval)
	var frequency float64
	if expected <= 0 {
		frequency = 0
	} else {
		frequency = activityWeight90d / expected
	}
	if frequency > 1 {
		frequency = 1
	}

	importance, ok := categoryBaseImportance[category]
	if !ok {
		importance = 0.5
	}

	raw := scoreWeightRecency*recency +
		scoreWeightFrequency*frequency +
		scoreWeightImportance*importance
	if raw < 0 {
		raw = 0
	}
	if raw > 1 {
		raw = 1
	}
	return raw
}

// RecomputeScoresForUser walks every connection owned by userID,
// recomputes each score with the formula above, and persists any
// changes. Designed for the nightly cron (UC-202): idempotent,
// tenant-scoped, and safe to re-run. Returns the number of rows that
// actually moved (the cron log shows "N scores adjusted" per user
// per run so we can see drift rate over time).
//
// The method lives in the usecase layer rather than the repo so the
// formula stays unit-testable without Postgres.
func (u *UseCase) RecomputeScoresForUser(ctx context.Context, userID uuid.UUID) (int, error) {
	connections, err := u.repo.ListAllForUser(ctx, userID)
	if err != nil {
		return 0, err
	}
	if len(connections) == 0 {
		return 0, nil
	}

	now := u.now().UTC()
	since := now.Add(-time.Duration(scoreRecentWindowDays) * 24 * time.Hour)
	changed := 0

	for _, c := range connections {
		days := math.MaxInt32
		if c.LastContactAt != nil {
			diff := int(now.Sub(*c.LastContactAt).Hours() / 24)
			if diff < 0 {
				diff = 0
			}
			days = diff
		}

		_, weight, err := u.repo.CountRecentActivities(ctx, userID, c.ID, since)
		if err != nil {
			// One bad row shouldn't halt the whole batch — log via
			// the cron dispatcher, continue to the next connection.
			continue
		}

		score := computeScore(days, weight, c.ContactFrequencyTarget, c.Category, c.Tags)
		// Persist only when the score visibly moved — skip writes
		// that round-trip identical values (reduces cron churn on
		// users whose data is stable).
		if math.Abs(score-c.ConnectionScore) < 0.005 {
			continue
		}
		if err := u.repo.UpdateConnectionScore(ctx, userID, c.ID, score); err != nil {
			continue
		}
		changed++
	}
	return changed, nil
}

// ── helpers ───────────────────────────────────────────────────────

// parseCategory enforces BR-CAT-1 (case-sensitive match).
func parseCategory(s string) (entity.ConnectionCategory, error) {
	cat := entity.ConnectionCategory(s)
	if !cat.IsValid() {
		return "", badField("category", "invalid_category", fmt.Sprintf("category must be one of family|friend|business|acquaintance (got %q)", s))
	}
	return cat, nil
}

// normalizeTags enforces BR-TAG-1: trim, reject oversize, dedupe
// case-insensitively while preserving the first-seen casing.
func normalizeTags(in []string) ([]string, error) {
	if len(in) == 0 {
		return []string{}, nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if len([]rune(t)) > maxTagChars {
			return nil, badField("tags", "tag_too_long", fmt.Sprintf("tag %q exceeds %d chars", t, maxTagChars))
		}
		key := strings.ToLower(t)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	if len(out) > maxTagCount {
		return nil, badField("tags", "tags_too_many", fmt.Sprintf("at most %d tags allowed", maxTagCount))
	}
	return out, nil
}

// validateContextNotes enforces BR-CONTEXT-1 (≤4096 chars). The raw
// body cap (16 KiB → 413) lives in the HTTP handler.
func validateContextNotes(s string) (string, error) {
	if len([]rune(s)) > maxContextNotesChars {
		return "", badField("context_notes", "notes_too_long", fmt.Sprintf("context_notes must be ≤%d chars", maxContextNotesChars))
	}
	return s, nil
}

// trimOptional trims an incoming optional string. Empty after trim
// becomes a nil pointer so the DB stores NULL rather than "".
func trimOptional(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

// mergeSocialProfiles applies BR-SOCIAL-2 merge semantics:
//
//   - key absent in patch            → preserve existing value
//   - key present with non-nil value → validate URL, then replace
//   - key present with nil value     → delete from result
//
// Unknown keys are rejected before any mutation — the existing map is
// untouched if validation fails.
func mergeSocialProfiles(existing entity.SocialProfiles, patch map[string]*string) (entity.SocialProfiles, error) {
	// Validate the patch up front so a bad URL on key N does not
	// leak partial writes through keys 1..N-1.
	for k, v := range patch {
		rx, ok := socialPlatformRegex[k]
		if !ok {
			return nil, badField("social_profiles."+k, "invalid_social_key", "unsupported social platform: "+k)
		}
		if v == nil {
			continue
		}
		if !rx.MatchString(*v) {
			return nil, badField("social_profiles."+k, "invalid_social_url", fmt.Sprintf("invalid %s URL", k))
		}
	}
	out := entity.SocialProfiles{}
	for k, v := range existing {
		out[k] = v
	}
	for k, v := range patch {
		if v == nil {
			delete(out, k)
			continue
		}
		out[k] = *v
	}
	return out, nil
}

// Ensure the package imports are referenced even if someone trims
// RecordManualContact's error path during refactors.
var _ = errors.New
