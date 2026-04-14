// Unit tests for the Connect usecase. The fake repository is an
// in-memory map keyed by connection id — it preserves enough state
// across calls for merge-patch and monotonic semantics tests to
// exercise the real code paths without Postgres.
//
// Every business rule listed in usecase.go's package doc has at
// least one dedicated test here. When a BR is touched by multiple
// tests the table-driven case names call it out.
package connect

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// ── fake repo ─────────────────────────────────────────────────────

type fakeConnRepo struct {
	store      map[uuid.UUID]entity.Connection
	activities []activityRecord
	nextActID  int64

	createErr error
	updateErr error
	getErr    error

	touchNow func() time.Time // used for the monotonic GREATEST at the "repo" layer
}

type activityRecord struct {
	id           int64
	userID       uuid.UUID
	connectionID uuid.UUID
	kind         string
	label        string
	occurredAt   time.Time
	note         string
	durationMin  int
	weight       float64
	createdAt    time.Time
}

func newFakeConnRepo() *fakeConnRepo {
	return &fakeConnRepo{
		store:    map[uuid.UUID]entity.Connection{},
		touchNow: time.Now,
	}
}

func (f *fakeConnRepo) Create(ctx context.Context, c *entity.Connection) error {
	if f.createErr != nil {
		return f.createErr
	}
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	f.store[c.ID] = *c
	return nil
}

func (f *fakeConnRepo) GetByID(ctx context.Context, userID, id uuid.UUID) (entity.Connection, error) {
	if f.getErr != nil {
		return entity.Connection{}, f.getErr
	}
	c, ok := f.store[id]
	if !ok || c.UserID != userID {
		return entity.Connection{}, domain.ErrNotFound
	}
	return c, nil
}

func (f *fakeConnRepo) List(ctx context.Context, userID uuid.UUID, filter entity.ConnectionListFilter) (entity.ConnectionListResult, error) {
	items := make([]entity.Connection, 0)
	for _, c := range f.store {
		if c.UserID != userID {
			continue
		}
		items = append(items, c)
	}
	return entity.ConnectionListResult{Items: items, Total: len(items), Limit: filter.Limit, Offset: filter.Offset}, nil
}

func (f *fakeConnRepo) Update(ctx context.Context, c *entity.Connection) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	existing, ok := f.store[c.ID]
	if !ok || existing.UserID != c.UserID {
		return domain.ErrNotFound
	}
	c.CreatedAt = existing.CreatedAt
	c.UpdatedAt = time.Now().UTC()
	f.store[c.ID] = *c
	return nil
}

func (f *fakeConnRepo) Delete(ctx context.Context, userID, id uuid.UUID) error {
	existing, ok := f.store[id]
	if !ok || existing.UserID != userID {
		return domain.ErrNotFound
	}
	delete(f.store, id)
	return nil
}

// Touch mirrors the postgres GREATEST semantics so BR-109-1 tests
// exercise the same monotonic behaviour the production SQL enforces.
func (f *fakeConnRepo) Touch(ctx context.Context, userID, id uuid.UUID, occurredAt time.Time, note string, durationMin int) (entity.Connection, error) {
	existing, ok := f.store[id]
	if !ok || existing.UserID != userID {
		return entity.Connection{}, domain.ErrNotFound
	}
	if existing.LastContactAt == nil || occurredAt.After(*existing.LastContactAt) {
		t := occurredAt
		existing.LastContactAt = &t
	}
	f.store[id] = existing
	f.nextActID++
	f.activities = append(f.activities, activityRecord{
		id:           f.nextActID,
		userID:       userID,
		connectionID: id,
		kind:         "manual",
		occurredAt:   occurredAt,
		note:         note,
		durationMin:  durationMin,
		weight:       1,
		createdAt:    time.Now().UTC(),
	})
	return existing, nil
}

// ── Activity timeline (UC-111/112/113) ────────────────────────────

func (f *fakeConnRepo) ListActivities(ctx context.Context, userID, connID uuid.UUID, limit, offset int) (entity.ActivityListResult, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	// Ownership check: allow the query even if unowned — the repo
	// returns empty. Usecase guards with GetByID.
	matches := make([]activityRecord, 0)
	for _, a := range f.activities {
		if a.userID == userID && a.connectionID == connID {
			matches = append(matches, a)
		}
	}
	// DESC by occurred_at
	sort.Slice(matches, func(i, j int) bool {
		if !matches[i].occurredAt.Equal(matches[j].occurredAt) {
			return matches[i].occurredAt.After(matches[j].occurredAt)
		}
		return matches[i].id > matches[j].id
	})
	total := len(matches)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	page := matches[offset:end]

	items := make([]entity.ConnectionActivity, 0, len(page))
	for _, a := range page {
		items = append(items, recordToEntity(a))
	}
	return entity.ActivityListResult{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

func (f *fakeConnRepo) CreateActivity(ctx context.Context, userID, connID uuid.UUID, in entity.ActivityInput) (entity.ConnectionActivity, error) {
	existing, ok := f.store[connID]
	if !ok || existing.UserID != userID {
		return entity.ConnectionActivity{}, domain.ErrNotFound
	}
	weight := in.Weight
	if weight == 0 {
		weight = 1
	}
	f.nextActID++
	rec := activityRecord{
		id:           f.nextActID,
		userID:       userID,
		connectionID: connID,
		kind:         string(in.Kind),
		label:        in.Label,
		occurredAt:   in.OccurredAt,
		note:         in.Note,
		durationMin:  in.DurationMin,
		weight:       weight,
		createdAt:    time.Now().UTC(),
	}
	f.activities = append(f.activities, rec)

	// Monotonic advance of last_contact_at (matches real repo).
	if existing.LastContactAt == nil || in.OccurredAt.After(*existing.LastContactAt) {
		t := in.OccurredAt
		existing.LastContactAt = &t
		f.store[connID] = existing
	}
	return recordToEntity(rec), nil
}

func (f *fakeConnRepo) DeleteActivity(ctx context.Context, userID uuid.UUID, activityID int64) error {
	for i, a := range f.activities {
		if a.id == activityID && a.userID == userID {
			f.activities = append(f.activities[:i], f.activities[i+1:]...)
			return nil
		}
	}
	return domain.ErrNotFound
}

func (f *fakeConnRepo) IngestActivities(ctx context.Context, userID uuid.UUID, batch []entity.ActivityInput, connIDs []uuid.UUID) (int, error) {
	if len(batch) != len(connIDs) {
		return 0, errors.New("fake ingest: length mismatch")
	}
	// De-dup helper on (connection_id, kind, occurred_at).
	type key struct {
		conn uuid.UUID
		kind string
		at   time.Time
	}
	seen := make(map[key]struct{})
	for _, a := range f.activities {
		seen[key{a.connectionID, a.kind, a.occurredAt}] = struct{}{}
	}
	inserted := 0
	for i, in := range batch {
		cid := connIDs[i]
		existing, ok := f.store[cid]
		if !ok || existing.UserID != userID {
			continue // silently drop cross-tenant
		}
		k := key{cid, string(in.Kind), in.OccurredAt}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		weight := in.Weight
		if weight == 0 {
			weight = 1
		}
		f.nextActID++
		f.activities = append(f.activities, activityRecord{
			id:           f.nextActID,
			userID:       userID,
			connectionID: cid,
			kind:         string(in.Kind),
			label:        in.Label,
			occurredAt:   in.OccurredAt,
			note:         in.Note,
			durationMin:  in.DurationMin,
			weight:       weight,
			createdAt:    time.Now().UTC(),
		})
		inserted++
		// Advance last_contact_at.
		if existing.LastContactAt == nil || in.OccurredAt.After(*existing.LastContactAt) {
			t := in.OccurredAt
			existing.LastContactAt = &t
			f.store[cid] = existing
		}
	}
	return inserted, nil
}

func (f *fakeConnRepo) CountRecentActivities(ctx context.Context, userID, connID uuid.UUID, since time.Time) (int, float64, error) {
	count := 0
	sum := 0.0
	for _, a := range f.activities {
		if a.userID == userID && a.connectionID == connID && !a.occurredAt.Before(since) {
			count++
			sum += a.weight
		}
	}
	return count, sum, nil
}

func (f *fakeConnRepo) UpdateConnectionScore(ctx context.Context, userID, connID uuid.UUID, score float64) error {
	existing, ok := f.store[connID]
	if !ok || existing.UserID != userID {
		return domain.ErrNotFound
	}
	if score < 0 {
		score = 0
	}
	if score > 1 {
		score = 1
	}
	existing.ConnectionScore = score
	f.store[connID] = existing
	return nil
}

func (f *fakeConnRepo) ListAllForUser(ctx context.Context, userID uuid.UUID) ([]entity.Connection, error) {
	out := make([]entity.Connection, 0)
	for _, c := range f.store {
		if c.UserID == userID {
			out = append(out, c)
		}
	}
	return out, nil
}

func (f *fakeConnRepo) ListDriftingConnections(ctx context.Context, userID uuid.UUID) ([]entity.DriftingConnection, error) {
	out := make([]entity.DriftingConnection, 0)
	now := time.Now()
	for _, c := range f.store {
		if c.UserID != userID {
			continue
		}
		anchor := c.CreatedAt
		if c.LastContactAt != nil {
			anchor = *c.LastContactAt
		}
		overdue := int(now.Sub(anchor).Hours()/24) - c.ContactFrequencyTarget
		if overdue <= 0 {
			continue
		}
		out = append(out, entity.DriftingConnection{
			ID:            c.ID,
			Name:          c.Name,
			Company:       c.Company,
			Category:      c.Category,
			LastContactAt: c.LastContactAt,
			DaysOverdue:   overdue,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].DaysOverdue > out[j].DaysOverdue })
	return out, nil
}

func recordToEntity(a activityRecord) entity.ConnectionActivity {
	var label *string
	if a.label != "" {
		l := a.label
		label = &l
	}
	var note *string
	if a.note != "" {
		n := a.note
		note = &n
	}
	return entity.ConnectionActivity{
		ID:           a.id,
		UserID:       a.userID,
		ConnectionID: a.connectionID,
		Kind:         entity.ActivityKind(a.kind),
		Label:        label,
		OccurredAt:   a.occurredAt,
		DurationMin:  a.durationMin,
		Weight:       a.weight,
		Note:         note,
		CreatedAt:    a.createdAt,
	}
}

// ── helpers ───────────────────────────────────────────────────────

func strptr(s string) *string { return &s }
func intptr(i int) *int       { return &i }

func mustCreate(t *testing.T, uc *UseCase, userID uuid.UUID, in CreateInput) entity.Connection {
	t.Helper()
	c, err := uc.Create(context.Background(), userID, in)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	return c
}

// ── UC-101 Create ─────────────────────────────────────────────────

func TestCreate_RequiresName(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.Create(context.Background(), uuid.New(), CreateInput{Name: "   "})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected ErrInvalidArgument, got %v", err)
	}
	var fe *FieldError
	if !errors.As(err, &fe) || fe.Field != "name" {
		t.Errorf("expected FieldError on 'name', got %+v", err)
	}
}

func TestCreate_DefaultsCategoryAndScore(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	c := mustCreate(t, uc, uuid.New(), CreateInput{Name: "Alice"})
	if c.Category != entity.CategoryAcquaintance {
		t.Errorf("default category should be acquaintance, got %s", c.Category)
	}
	if c.ConnectionScore != defaultScore {
		t.Errorf("default score should be %v, got %v", defaultScore, c.ConnectionScore)
	}
	if c.ContactFrequencyTarget != defaultFreqTarget {
		t.Errorf("default freq should be %d, got %d", defaultFreqTarget, c.ContactFrequencyTarget)
	}
}

// BR-CAT-1: category match is case-sensitive.
func TestCreate_CategoryCaseSensitive(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.Create(context.Background(), uuid.New(), CreateInput{
		Name:     "Alice",
		Category: strptr("Business"), // capital B — must reject
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("BR-CAT-1: 'Business' must fail, got %v", err)
	}
	// Lowercase passes.
	_, err = uc.Create(context.Background(), uuid.New(), CreateInput{
		Name:     "Bob",
		Category: strptr("business"),
	})
	if err != nil {
		t.Fatalf("BR-CAT-1: 'business' must pass, got %v", err)
	}
}

// BR-SOCIAL-1: URL regex enforced per platform.
func TestCreate_SocialURLValidation(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	cases := []struct {
		name     string
		platform string
		url      string
		ok       bool
	}{
		{"facebook ok", "facebook", "https://facebook.com/alice", true},
		{"facebook fb-short ok", "facebook", "https://fb.com/alice", true},
		{"facebook wrong host", "facebook", "https://example.com/alice", false},
		{"instagram ok", "instagram", "https://instagram.com/alice", true},
		{"instagram http ok", "instagram", "http://instagram.com/alice", true},
		{"x ok", "x", "https://x.com/alice", true},
		{"x twitter ok", "x", "https://twitter.com/alice", true},
		{"x wrong host", "x", "https://example.com/alice", false},
		{"linkedin in ok", "linkedin", "https://linkedin.com/in/alice", true},
		{"linkedin company ok", "linkedin", "https://linkedin.com/company/acme", true},
		{"linkedin naked reject", "linkedin", "https://linkedin.com/alice", false},
		{"threads ok", "threads", "https://threads.net/@alice", true},
		{"threads com ok", "threads", "https://threads.com/@alice", true},
		{"threads wrong host", "threads", "https://example.com/@alice", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := uc.Create(context.Background(), uuid.New(), CreateInput{
				Name: "T",
				SocialProfiles: map[string]*string{
					tc.platform: strptr(tc.url),
				},
			})
			if tc.ok && err != nil {
				t.Errorf("expected accept, got %v", err)
			}
			if !tc.ok && !errors.Is(err, domain.ErrInvalidArgument) {
				t.Errorf("expected reject, got %v", err)
			}
		})
	}
}

// BR-SOCIAL-1: unknown keys are rejected.
func TestCreate_RejectsUnknownSocialKey(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.Create(context.Background(), uuid.New(), CreateInput{
		Name: "T",
		SocialProfiles: map[string]*string{
			"tiktok": strptr("https://tiktok.com/@alice"),
		},
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("unknown social key must 400, got %v", err)
	}
}

// BR-TAG-1: dedupe case-insensitive, preserve first casing.
func TestCreate_TagNormalization(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	c := mustCreate(t, uc, uuid.New(), CreateInput{
		Name: "T",
		Tags: []string{" Mentor ", "mentor", "MENTOR", "", "investor"},
	})
	if len(c.Tags) != 2 {
		t.Fatalf("expected dedupe to 2 tags, got %v", c.Tags)
	}
	if c.Tags[0] != "Mentor" || c.Tags[1] != "investor" {
		t.Errorf("first-seen casing not preserved, got %v", c.Tags)
	}
}

func TestCreate_TagsTooMany(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	tags := make([]string, 17)
	for i := range tags {
		tags[i] = "tag" + string(rune('a'+i))
	}
	_, err := uc.Create(context.Background(), uuid.New(), CreateInput{Name: "T", Tags: tags})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected tag count validation, got %v", err)
	}
}

// BR-CONTEXT-1: 4096 char limit.
func TestCreate_ContextNotesLimit(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	// 4097 runes → reject. ASCII, so bytes == runes.
	long := strings.Repeat("a", maxContextNotesChars+1)
	_, err := uc.Create(context.Background(), uuid.New(), CreateInput{
		Name:         "T",
		ContextNotes: &long,
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected notes-too-long, got %v", err)
	}
	// Exactly 4096 → pass.
	ok := strings.Repeat("a", maxContextNotesChars)
	if _, err := uc.Create(context.Background(), uuid.New(), CreateInput{Name: "T", ContextNotes: &ok}); err != nil {
		t.Errorf("4096 chars must be accepted, got %v", err)
	}
}

// ── UC-102 Update ─────────────────────────────────────────────────

// BR-SOCIAL-2 merge semantics: nil value deletes, absent preserves,
// value replaces. Validate upfront → bad URL on key N leaves keys
// 1..N-1 untouched.
func TestUpdate_SocialMergePatch(t *testing.T) {
	repo := newFakeConnRepo()
	uc := NewUseCase(repo)
	userID := uuid.New()

	c := mustCreate(t, uc, userID, CreateInput{
		Name: "Alice",
		SocialProfiles: map[string]*string{
			"facebook":  strptr("https://facebook.com/alice"),
			"instagram": strptr("https://instagram.com/alice"),
		},
	})

	// Case 1: present with null → delete; present with value → replace;
	// absent → preserve.
	updated, err := uc.Update(context.Background(), userID, c.ID, UpdatePatch{
		SocialProfilesPatch: map[string]*string{
			"facebook": nil, // delete
			"x":        strptr("https://x.com/alice"),
		},
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if _, exists := updated.SocialProfiles["facebook"]; exists {
		t.Errorf("facebook should be deleted")
	}
	if updated.SocialProfiles["instagram"] != "https://instagram.com/alice" {
		t.Errorf("instagram should be preserved")
	}
	if updated.SocialProfiles["x"] != "https://x.com/alice" {
		t.Errorf("x should be added")
	}

	// Case 2: empty patch object → no-op on the stored value.
	pre := updated.SocialProfiles
	updated2, err := uc.Update(context.Background(), userID, c.ID, UpdatePatch{
		SocialProfilesPatch: map[string]*string{},
	})
	if err != nil {
		t.Fatalf("empty patch failed: %v", err)
	}
	if len(updated2.SocialProfiles) != len(pre) {
		t.Errorf("empty patch must be a no-op, before %v after %v", pre, updated2.SocialProfiles)
	}
}

// BR-SOCIAL-2: reject the whole patch if any URL is invalid, do not
// partially write valid keys.
func TestUpdate_SocialAtomicRejection(t *testing.T) {
	repo := newFakeConnRepo()
	uc := NewUseCase(repo)
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})

	_, err := uc.Update(context.Background(), userID, c.ID, UpdatePatch{
		SocialProfilesPatch: map[string]*string{
			"instagram": strptr("https://instagram.com/ok"),
			"facebook":  strptr("not-a-url"),
		},
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected 400, got %v", err)
	}
	got, _ := repo.GetByID(context.Background(), userID, c.ID)
	if len(got.SocialProfiles) != 0 {
		t.Errorf("partial write leaked: %v", got.SocialProfiles)
	}
}

// BR-SCORE-1: the UpdatePatch DTO has no ConnectionScore field,
// so any attempt at the HTTP layer is structurally impossible. The
// row's score must stay at its default after a PATCH that changes
// everything else.
func TestUpdate_ScoreIsImmutable(t *testing.T) {
	repo := newFakeConnRepo()
	uc := NewUseCase(repo)
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})
	if c.ConnectionScore != defaultScore {
		t.Fatalf("seed score wrong")
	}
	updated, err := uc.Update(context.Background(), userID, c.ID, UpdatePatch{
		Name:     strptr("A2"),
		Category: strptr("business"),
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if updated.ConnectionScore != defaultScore {
		t.Errorf("score must not change via PATCH, got %v", updated.ConnectionScore)
	}
}

func TestUpdate_NotFound(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.Update(context.Background(), uuid.New(), uuid.New(), UpdatePatch{Name: strptr("x")})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// ── UC-106 ScanBusinessCard ───────────────────────────────────────

// BR-SOCIAL-3: the OCR path must not populate social_profiles.
// The DTO has no field for it, so even if the agent sends one the
// stored row ends up with `{}`.
func TestScanBusinessCard_NeverSetsSocialProfiles(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c, err := uc.ScanBusinessCard(context.Background(), userID, ScanInput{
		Name: "Bob",
		BusinessCard: entity.BusinessCard{
			ImageURL:      "https://cdn.example/card.jpg",
			CompanyNameEN: "Acme",
		},
	})
	if err != nil {
		t.Fatalf("scan failed: %v", err)
	}
	if len(c.SocialProfiles) != 0 {
		t.Errorf("BR-SOCIAL-3: social_profiles must be empty after scan, got %v", c.SocialProfiles)
	}
	if c.BusinessCard == nil || c.BusinessCard.ScannedAt.IsZero() {
		t.Errorf("expected business_card with ScannedAt populated")
	}
}

func TestScanBusinessCard_RequiresImageURL(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.ScanBusinessCard(context.Background(), uuid.New(), ScanInput{
		Name:         "Bob",
		BusinessCard: entity.BusinessCard{},
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected 400, got %v", err)
	}
}

// ── UC-107 UpdateSocialProfiles ───────────────────────────────────

func TestUpdateSocialProfiles_EmptyPatchIsNoop(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{
		Name: "A",
		SocialProfiles: map[string]*string{
			"linkedin": strptr("https://linkedin.com/in/a"),
		},
	})
	got, err := uc.UpdateSocialProfiles(context.Background(), userID, c.ID, map[string]*string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.SocialProfiles["linkedin"] != "https://linkedin.com/in/a" {
		t.Errorf("no-op patch must preserve existing, got %v", got.SocialProfiles)
	}
}

// ── UC-108 UpdateContextNotes ─────────────────────────────────────

func TestUpdateContextNotes_Limit(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})

	long := strings.Repeat("a", maxContextNotesChars+1)
	_, err := uc.UpdateContextNotes(context.Background(), userID, c.ID, long)
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected 400, got %v", err)
	}

	ok := strings.Repeat("a", maxContextNotesChars)
	if _, err := uc.UpdateContextNotes(context.Background(), userID, c.ID, ok); err != nil {
		t.Errorf("4096 chars must be accepted, got %v", err)
	}
}

// ── UC-109 RecordManualContact ────────────────────────────────────

// BR-109-1: earlier touches never rewind last_contact_at.
func TestTouch_MonotonicLastContact(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})

	later := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	earlier := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	// Pretend "now" is well past both touches so future-tolerance doesn't fire.
	uc.SetClock(func() time.Time { return time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC) })

	got1, err := uc.RecordManualContact(context.Background(), userID, c.ID, later, "", 0)
	if err != nil {
		t.Fatalf("later touch failed: %v", err)
	}
	if got1.LastContactAt == nil || !got1.LastContactAt.Equal(later) {
		t.Fatalf("expected last=%v, got %v", later, got1.LastContactAt)
	}

	got2, err := uc.RecordManualContact(context.Background(), userID, c.ID, earlier, "", 0)
	if err != nil {
		t.Fatalf("earlier touch failed: %v", err)
	}
	if got2.LastContactAt == nil || !got2.LastContactAt.Equal(later) {
		t.Errorf("earlier touch must not rewind last_contact_at, got %v", got2.LastContactAt)
	}
}

// BR-109-1 / UC-109 A1: future occurred_at >60s must 400.
func TestTouch_RejectsFutureOccurredAt(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})

	now := time.Date(2026, 4, 13, 12, 0, 0, 0, time.UTC)
	uc.SetClock(func() time.Time { return now })

	// 120s in the future → reject.
	_, err := uc.RecordManualContact(context.Background(), userID, c.ID, now.Add(2*time.Minute), "", 0)
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected future rejection, got %v", err)
	}

	// 30s in the future → accept (within tolerance).
	if _, err := uc.RecordManualContact(context.Background(), userID, c.ID, now.Add(30*time.Second), "", 0); err != nil {
		t.Errorf("30s future must be accepted, got %v", err)
	}
}

func TestTouch_DefaultsOccurredAtToNow(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "A"})

	fixed := time.Date(2026, 4, 13, 12, 0, 0, 0, time.UTC)
	uc.SetClock(func() time.Time { return fixed })

	got, err := uc.RecordManualContact(context.Background(), userID, c.ID, time.Time{}, "coffee", 15)
	if err != nil {
		t.Fatalf("touch failed: %v", err)
	}
	if got.LastContactAt == nil || !got.LastContactAt.Equal(fixed) {
		t.Errorf("zero occurred_at should default to now, got %v", got.LastContactAt)
	}
}

func TestTouch_NotFound(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.RecordManualContact(context.Background(), uuid.New(), uuid.New(), time.Now(), "", 0)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// ── UC-104 List sort validation ───────────────────────────────────

func TestList_InvalidSortRejected(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	_, err := uc.List(context.Background(), uuid.New(), ListParams{Sort: "random"})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected 400, got %v", err)
	}
}

func TestList_CategoryCSVValidation(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	// "Family" capital → BR-CAT-1 reject.
	_, err := uc.List(context.Background(), uuid.New(), ListParams{CategoriesCSV: "family,Friend"})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected rejection of capitalized category, got %v", err)
	}
}

// ── UC-111/112/113 Activity timeline ──────────────────────────────

func TestCreateActivity_ValidatesLengths(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "Alice"})

	// label too long
	_, err := uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		Label: strings.Repeat("가", maxActivityLabelChars+1),
		Note:  "x",
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Errorf("expected label_too_long, got %v", err)
	}

	// note too long
	_, err = uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		Note: strings.Repeat("a", maxActivityNoteChars+1),
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Errorf("expected note_too_long, got %v", err)
	}

	// duration too long
	_, err = uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		DurationMin: maxActivityDurationMin + 1,
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Errorf("expected duration_too_long, got %v", err)
	}
}

func TestCreateActivity_RejectsFutureOccurredAt(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "Bob"})

	future := time.Now().Add(5 * time.Minute)
	_, err := uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		Label:      "meeting",
		OccurredAt: &future,
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Fatalf("expected future_occurred_at rejection, got %v", err)
	}
}

func TestCreateActivity_RejectsInvalidKind(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "Carol"})

	_, err := uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		Kind:  "linkedin_message",
		Label: "chat",
	})
	if !errors.Is(err, domain.ErrInvalidArgument) {
		t.Errorf("expected invalid_kind rejection, got %v", err)
	}
}

func TestCreateActivity_AdvancesLastContactAt(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "Dave"})

	t1 := time.Now().Add(-48 * time.Hour)
	_, err := uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
		Label:      "meeting",
		OccurredAt: &t1,
		Note:       "Q2 kickoff",
	})
	if err != nil {
		t.Fatalf("CreateActivity failed: %v", err)
	}

	reloaded, err := uc.Get(context.Background(), userID, c.ID)
	if err != nil {
		t.Fatalf("Show failed: %v", err)
	}
	if reloaded.LastContactAt == nil || !reloaded.LastContactAt.Equal(t1) {
		t.Errorf("expected last_contact_at = %v, got %v", t1, reloaded.LastContactAt)
	}
}

func TestListActivities_PaginatesByOccurredAt(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	userID := uuid.New()
	c := mustCreate(t, uc, userID, CreateInput{Name: "Eve"})

	base := time.Now().Add(-7 * 24 * time.Hour)
	for i := 0; i < 5; i++ {
		occ := base.Add(time.Duration(i) * 24 * time.Hour)
		_, err := uc.CreateActivity(context.Background(), userID, c.ID, CreateActivityInput{
			Label:      "note",
			OccurredAt: &occ,
			Note:       "entry",
		})
		if err != nil {
			t.Fatalf("CreateActivity #%d: %v", i, err)
		}
	}

	res, err := uc.ListActivities(context.Background(), userID, c.ID, 3, 0)
	if err != nil {
		t.Fatalf("ListActivities failed: %v", err)
	}
	if res.Total != 5 || len(res.Items) != 3 {
		t.Errorf("expected 3 of 5 items on page 1, got %d of %d", len(res.Items), res.Total)
	}
	// DESC: first item is the newest (index 4 from the loop).
	if !res.Items[0].OccurredAt.Equal(base.Add(4 * 24 * time.Hour)) {
		t.Errorf("expected newest first, got %v", res.Items[0].OccurredAt)
	}
}

func TestDeleteActivity_TenantIsolation(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	alice := uuid.New()
	bob := uuid.New()
	c := mustCreate(t, uc, alice, CreateInput{Name: "A"})

	a, err := uc.CreateActivity(context.Background(), alice, c.ID, CreateActivityInput{Label: "m", Note: "n"})
	if err != nil {
		t.Fatalf("CreateActivity: %v", err)
	}

	// Bob tries to delete Alice's activity.
	err = uc.DeleteActivity(context.Background(), bob, a.ID)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound across tenants, got %v", err)
	}

	// Alice's delete succeeds.
	if err := uc.DeleteActivity(context.Background(), alice, a.ID); err != nil {
		t.Errorf("expected success for owner, got %v", err)
	}
}

func TestListActivities_CrossTenantBlocked(t *testing.T) {
	uc := NewUseCase(newFakeConnRepo())
	alice := uuid.New()
	bob := uuid.New()
	c := mustCreate(t, uc, alice, CreateInput{Name: "A"})

	_, err := uc.ListActivities(context.Background(), bob, c.ID, 10, 0)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound for cross-tenant list, got %v", err)
	}
}

// ── UC-202 computeScore (pure function) ───────────────────────────

func TestComputeScore_NeverContactedAcquaintance(t *testing.T) {
	// daysSinceContact = "infinity" → recency ≈ 0
	// activity_weight_90d = 0          → frequency = 0
	// importance(acquaintance) = 0.4   → 0.2 * 0.4 = 0.08
	got := computeScore(1_000_000, 0, 30, entity.CategoryAcquaintance, nil)
	want := 0.20 * 0.4
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("expected %.4f, got %.4f", want, got)
	}
}

func TestComputeScore_FreshFamilyContact(t *testing.T) {
	// Contacted today (d=0 → recency=1), no activities logged,
	// category=family (importance 0.9). Max recency term.
	got := computeScore(0, 0, 30, entity.CategoryFamily, nil)
	want := 0.45*1 + 0.35*0 + 0.20*0.9
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("expected %.4f, got %.4f", want, got)
	}
}

func TestComputeScore_FrequencySaturation(t *testing.T) {
	// target=30 → expected activities = 90/30 = 3
	// weight >= 3 → frequency saturates at 1
	got := computeScore(0, 5, 30, entity.CategoryFriend, nil)
	want := 0.45*1 + 0.35*1 + 0.20*0.7
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("expected %.4f, got %.4f", want, got)
	}
}

func TestComputeScore_RecencyDecay(t *testing.T) {
	// At d = 2*target the recency term is exp(-1) ≈ 0.3679.
	// With no activities and business (0.7), expected:
	//   0.45*0.3679 + 0.35*0 + 0.20*0.7 = 0.3055
	got := computeScore(60, 0, 30, entity.CategoryBusiness, nil)
	want := 0.45*math.Exp(-1) + 0.35*0 + 0.20*0.7
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("expected %.4f, got %.4f", want, got)
	}
}

func TestComputeScore_Clamped(t *testing.T) {
	// Absurd inputs can't push the score out of [0, 1].
	hi := computeScore(0, 1000, 30, entity.CategoryFamily, nil)
	if hi > 1.0 || hi < 0.0 {
		t.Errorf("hi out of range: %v", hi)
	}
	lo := computeScore(math.MaxInt32, 0, 1, entity.CategoryAcquaintance, nil)
	if lo > 1.0 || lo < 0.0 {
		t.Errorf("lo out of range: %v", lo)
	}
}

func TestRecomputeScoresForUser_PersistsChange(t *testing.T) {
	repo := newFakeConnRepo()
	uc := NewUseCase(repo)
	userID := uuid.New()

	// Create a business connection contacted 2 days ago.
	c := mustCreate(t, uc, userID, CreateInput{
		Name:     "Test",
		Category: strptr("business"),
	})
	two := time.Now().Add(-2 * 24 * time.Hour)
	if _, err := uc.RecordManualContact(context.Background(), userID, c.ID, two, "", 0); err != nil {
		t.Fatalf("touch: %v", err)
	}

	// Initial score is the default (0.5).
	changed, err := uc.RecomputeScoresForUser(context.Background(), userID)
	if err != nil {
		t.Fatalf("recompute: %v", err)
	}
	if changed != 1 {
		t.Errorf("expected 1 score change (default → computed), got %d", changed)
	}

	reloaded, _ := uc.Get(context.Background(), userID, c.ID)
	if reloaded.ConnectionScore == 0.5 {
		t.Errorf("score stayed at default 0.5 — recompute did not persist")
	}

	// Running again with no new data should be a no-op.
	changed2, err := uc.RecomputeScoresForUser(context.Background(), userID)
	if err != nil {
		t.Fatalf("recompute 2: %v", err)
	}
	if changed2 != 0 {
		t.Errorf("expected idempotent second pass, got %d changes", changed2)
	}
}
