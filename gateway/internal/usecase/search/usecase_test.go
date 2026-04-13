package search

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// fakeSearchRepo is a configurable stub over the SearchRepository
// port. Each field controls one method's return shape; the
// *Received maps/slices capture arguments so tests can assert the
// usecase forwarded the right values.
type fakeSearchRepo struct {
	listRows      []entity.SavedSearch
	listTotal     int
	listErr       error
	listLastLimit int
	listLastOff   int

	createReceived struct {
		query, result string
	}
	createID int64

	diaryTextHits     []entity.SearchHit
	knowledgeTextHits []entity.SearchHit
	diaryVectorHits   []entity.SearchHit
	knowledgeVecHits  []entity.SearchHit
}

func (f *fakeSearchRepo) ListSaved(ctx context.Context, userID uuid.UUID, query string, limit, offset int) ([]entity.SavedSearch, int, error) {
	f.listLastLimit = limit
	f.listLastOff = offset
	return f.listRows, f.listTotal, f.listErr
}

func (f *fakeSearchRepo) GetSaved(ctx context.Context, userID uuid.UUID, id string) (entity.SavedSearch, error) {
	return entity.SavedSearch{}, nil
}

func (f *fakeSearchRepo) CreateSaved(ctx context.Context, userID uuid.UUID, query, result string) (int64, error) {
	f.createReceived.query = query
	f.createReceived.result = result
	if f.createID == 0 {
		f.createID = 1
	}
	return f.createID, nil
}

func (f *fakeSearchRepo) DeleteSaved(ctx context.Context, userID uuid.UUID, id string) error {
	return nil
}

func (f *fakeSearchRepo) SearchDiaryText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error) {
	return f.diaryTextHits, nil
}

func (f *fakeSearchRepo) SearchKnowledgeText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error) {
	return f.knowledgeTextHits, nil
}

func (f *fakeSearchRepo) SearchDiaryVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error) {
	return f.diaryVectorHits, nil
}

func (f *fakeSearchRepo) SearchKnowledgeVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error) {
	return f.knowledgeVecHits, nil
}

// fakeEmbedder controls whether the vector path runs.
type fakeEmbedder struct {
	vec    []float32
	errVal error
}

func (f *fakeEmbedder) Generate(ctx context.Context, userID uuid.UUID, text string) ([]float32, error) {
	if f.errVal != nil {
		return nil, f.errVal
	}
	return f.vec, nil
}

func (f *fakeEmbedder) VectorLiteral(vec []float32) string {
	return "[vector]"
}

func TestListSaved_CoercesPagination(t *testing.T) {
	cases := []struct {
		name                   string
		page, limit            int
		wantLimit, wantOffset  int
	}{
		{"zero page coerces to 1", 0, 20, 20, 0},
		{"negative page coerces to 1", -5, 20, 20, 0},
		{"oversize limit coerces to 20", 1, 500, 20, 0},
		{"zero limit coerces to 20", 2, 0, 20, 20},
		{"valid 3/50 preserved", 3, 50, 50, 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeSearchRepo{}
			uc := NewUseCase(repo, nil)
			_, err := uc.ListSaved(context.Background(), uuid.New(), "", tc.page, tc.limit)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if repo.listLastLimit != tc.wantLimit {
				t.Errorf("limit: got %d, want %d", repo.listLastLimit, tc.wantLimit)
			}
			if repo.listLastOff != tc.wantOffset {
				t.Errorf("offset: got %d, want %d", repo.listLastOff, tc.wantOffset)
			}
		})
	}
}

func TestListSaved_NilRowsBecomeEmpty(t *testing.T) {
	repo := &fakeSearchRepo{listRows: nil}
	uc := NewUseCase(repo, nil)
	page, _ := uc.ListSaved(context.Background(), uuid.New(), "", 1, 10)
	if page.Searches == nil {
		t.Errorf("Searches must not be nil")
	}
}

func TestListSaved_PropagatesRepoError(t *testing.T) {
	sentinel := errors.New("db down")
	repo := &fakeSearchRepo{listErr: sentinel}
	uc := NewUseCase(repo, nil)
	_, err := uc.ListSaved(context.Background(), uuid.New(), "", 1, 10)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel, got %v", err)
	}
}

func TestCreateSaved_TrimsOversizeInputs(t *testing.T) {
	repo := &fakeSearchRepo{}
	uc := NewUseCase(repo, nil)
	longQ := strings.Repeat("q", maxQueryLen+100)
	longR := strings.Repeat("r", maxResultLen+100)
	_, err := uc.CreateSaved(context.Background(), uuid.New(), longQ, longR)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.createReceived.query) != maxQueryLen {
		t.Errorf("query: got %d, want %d", len(repo.createReceived.query), maxQueryLen)
	}
	if len(repo.createReceived.result) != maxResultLen {
		t.Errorf("result: got %d, want %d", len(repo.createReceived.result), maxResultLen)
	}
}

func TestHybrid_DeduplicatesByTypeAndId(t *testing.T) {
	// Same (type, id) hit appears in both FTS and vector paths —
	// usecase should merge, keeping the higher score.
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{
			{Type: "diary", ID: "1", Text: "A", Score: 0.3},
			{Type: "diary", ID: "2", Text: "B", Score: 0.4},
		},
		diaryVectorHits: []entity.SearchHit{
			{Type: "diary", ID: "1", Text: "A", Score: 0.9}, // higher — wins
		},
	}
	uc := NewUseCase(repo, &fakeEmbedder{vec: []float32{0.1, 0.2}})
	hits, err := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Expect exactly 2 results (diary:1, diary:2) with no duplicates.
	if len(hits) != 2 {
		t.Fatalf("expected 2 deduped hits, got %d", len(hits))
	}
	// diary:1 should win with the higher vector score (0.9)
	var top *entity.SearchHit
	for i, h := range hits {
		if h.ID == "1" {
			top = &hits[i]
		}
	}
	if top == nil || top.Score < 0.89 {
		t.Errorf("expected diary:1 to have score ~0.9, got %+v", top)
	}
}

func TestHybrid_VectorFloorSkipsLowScores(t *testing.T) {
	// Vector hits below vectorScoreFloor (0.5) must NOT be mixed in.
	// Here the only vector hit is 0.4 → should be dropped, leaving
	// only the FTS hits.
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{
			{Type: "diary", ID: "1", Text: "only FTS", Score: 0.3},
		},
		diaryVectorHits: []entity.SearchHit{
			{Type: "diary", ID: "2", Text: "below floor", Score: 0.4},
		},
	}
	uc := NewUseCase(repo, &fakeEmbedder{vec: []float32{0.1}})
	hits, _ := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	if len(hits) != 1 {
		t.Fatalf("expected 1 hit (low-score vector dropped), got %d", len(hits))
	}
	if hits[0].ID != "1" {
		t.Errorf("expected the FTS hit to survive, got %+v", hits[0])
	}
}

func TestHybrid_NoEmbedderSkipsVectorPath(t *testing.T) {
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{
			{Type: "diary", ID: "1", Text: "FTS only", Score: 0.3},
		},
		diaryVectorHits: []entity.SearchHit{
			{Type: "diary", ID: "99", Text: "should not appear", Score: 0.99},
		},
	}
	uc := NewUseCase(repo, nil) // no embedder
	hits, _ := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	if len(hits) != 1 {
		t.Fatalf("expected 1 hit (vector path skipped), got %d", len(hits))
	}
	if hits[0].ID == "99" {
		t.Errorf("vector hit leaked despite nil embedder")
	}
}

func TestHybrid_EmbedderErrorFallsBackToFTS(t *testing.T) {
	// If the embedder fails (no provider configured), the usecase
	// must still return the FTS results rather than erroring out.
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{{Type: "diary", ID: "1", Score: 0.5}},
	}
	uc := NewUseCase(repo, &fakeEmbedder{errVal: errors.New("no provider")})
	hits, err := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	if err != nil {
		t.Fatalf("expected graceful fallback, got error: %v", err)
	}
	if len(hits) != 1 {
		t.Errorf("expected FTS hit to survive embedder failure, got %d hits", len(hits))
	}
}

func TestHybrid_SortedByScoreDescending(t *testing.T) {
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{
			{Type: "diary", ID: "1", Score: 0.3},
			{Type: "diary", ID: "2", Score: 0.7},
			{Type: "diary", ID: "3", Score: 0.5},
		},
	}
	uc := NewUseCase(repo, nil)
	hits, _ := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	for i := 1; i < len(hits); i++ {
		if hits[i].Score > hits[i-1].Score {
			t.Errorf("hits must be sorted descending by score, got %+v", hits)
			break
		}
	}
}

func TestHybrid_SnippetRuneLimitTruncatesCJK(t *testing.T) {
	// Use a single Korean-repeated string longer than snippetRuneLimit.
	longText := strings.Repeat("가", snippetRuneLimit+50)
	repo := &fakeSearchRepo{
		diaryTextHits: []entity.SearchHit{{Type: "diary", ID: "1", Text: longText, Score: 0.9}},
	}
	uc := NewUseCase(repo, nil)
	hits, _ := uc.Hybrid(context.Background(), uuid.New(), "query", 10)
	if len(hits) != 1 {
		t.Fatalf("expected 1 hit")
	}
	runeCount := len([]rune(hits[0].Text))
	// Truncated to snippetRuneLimit runes + 3 ellipsis dots.
	if runeCount != snippetRuneLimit+3 {
		t.Errorf("expected %d runes (snippet + '...'), got %d", snippetRuneLimit+3, runeCount)
	}
	if !strings.HasSuffix(hits[0].Text, "...") {
		t.Errorf("truncated snippet should end with '...', got %q", hits[0].Text)
	}
}
