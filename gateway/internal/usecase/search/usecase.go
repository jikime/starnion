// Package search hosts the saved-search CRUD and hybrid-search use
// cases. Hybrid search combines FTS results (always) with pgvector
// cosine-similarity results (only when the user has an embedding
// provider configured). De-duplication and ranking live here so they
// can be unit-tested against a fake SearchRepository.
package search

import (
	"context"
	"sort"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

const (
	maxQueryLen       = 1000
	maxResultLen      = 50000
	maxHybridQueryLen = 500
	// vectorScoreFloor is the minimum cosine similarity (0..1) a vector
	// hit must reach before it's mixed into the results. Anything lower
	// than this was pulling in unrelated content on small corpora.
	vectorScoreFloor = 0.5
	// snippetRuneLimit truncates long result text to this many runes
	// before returning it — picked to match the legacy handler's UI.
	snippetRuneLimit = 200
)

// Embedder is the minimal port the search usecase needs from the
// embedding infrastructure package. It is satisfied by a thin adapter
// in the http/search package so this usecase has zero knowledge of
// HTTP provider config or Gemini/OpenAI clients.
type Embedder interface {
	// Generate returns the embedding vector for the given text, or an
	// error if the user has no embedding provider configured.
	Generate(ctx context.Context, userID uuid.UUID, text string) ([]float32, error)
	// VectorLiteral converts the vector to the pgvector `[f1,f2,...]`
	// literal used in `$n::vector` bindings.
	VectorLiteral(vec []float32) string
}

// UseCase bundles the search operations behind a small interface the
// HTTP handler consumes.
type UseCase struct {
	repo     repository.SearchRepository
	embedder Embedder
}

func NewUseCase(repo repository.SearchRepository, embedder Embedder) *UseCase {
	return &UseCase{repo: repo, embedder: embedder}
}

// SavedSearchPage is the response DTO for GET /api/v1/searches.
type SavedSearchPage struct {
	Searches []entity.SavedSearch
	Total    int
	Page     int
	Limit    int
}

// ListSaved returns paginated saved searches with an optional query
// filter that searches both the query and result columns.
func (u *UseCase) ListSaved(ctx context.Context, userID uuid.UUID, query string, page, limit int) (SavedSearchPage, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	rows, total, err := u.repo.ListSaved(ctx, userID, query, limit, offset)
	if err != nil {
		return SavedSearchPage{}, err
	}
	if rows == nil {
		rows = []entity.SavedSearch{}
	}
	return SavedSearchPage{
		Searches: rows,
		Total:    total,
		Page:     page,
		Limit:    limit,
	}, nil
}

// GetSaved returns a single saved search by id.
func (u *UseCase) GetSaved(ctx context.Context, userID uuid.UUID, id string) (entity.SavedSearch, error) {
	return u.repo.GetSaved(ctx, userID, id)
}

// CreateSaved validates the request and persists a new saved search.
// Returns the new row id.
func (u *UseCase) CreateSaved(ctx context.Context, userID uuid.UUID, query, result string) (int64, error) {
	query = trim(query, maxQueryLen)
	result = trim(result, maxResultLen)
	return u.repo.CreateSaved(ctx, userID, query, result)
}

// DeleteSaved removes a saved search owned by the user.
func (u *UseCase) DeleteSaved(ctx context.Context, userID uuid.UUID, id string) error {
	return u.repo.DeleteSaved(ctx, userID, id)
}

// Hybrid runs FTS across planner diary and knowledge base, and (when
// the user has an embedder configured) also runs a pgvector search
// across the same tables. Results are de-duplicated by (type, id) —
// the highest score wins — and sorted by descending score.
func (u *UseCase) Hybrid(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error) {
	query = trim(query, maxHybridQueryLen)
	if limit < 1 || limit > 50 {
		limit = 10
	}

	// (type:id) -> index into `results`; used for de-duplication.
	index := map[string]int{}
	var results []entity.SearchHit

	add := func(hit entity.SearchHit) {
		hit.Text = snippetRune(hit.Text, snippetRuneLimit)
		key := hit.Type + ":" + hit.ID
		if prev, ok := index[key]; ok {
			if hit.Score > results[prev].Score {
				results[prev].Score = hit.Score
			}
			return
		}
		index[key] = len(results)
		results = append(results, hit)
	}

	// ── FTS path (always runs) ───────────────────────────────────────
	if hits, err := u.repo.SearchDiaryText(ctx, userID, query, limit); err == nil {
		for _, h := range hits {
			add(h)
		}
	}
	if hits, err := u.repo.SearchKnowledgeText(ctx, userID, query, limit); err == nil {
		for _, h := range hits {
			add(h)
		}
	}

	// ── Vector path (only when embedder is configured) ───────────────
	if u.embedder != nil {
		if vec, err := u.embedder.Generate(ctx, userID, query); err == nil {
			vecLit := u.embedder.VectorLiteral(vec)
			if hits, err := u.repo.SearchDiaryVector(ctx, userID, vecLit, limit); err == nil {
				for _, h := range hits {
					if h.Score > vectorScoreFloor {
						add(h)
					}
				}
			}
			if hits, err := u.repo.SearchKnowledgeVector(ctx, userID, vecLit, limit); err == nil {
				for _, h := range hits {
					if h.Score > vectorScoreFloor {
						add(h)
					}
				}
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})
	if results == nil {
		results = []entity.SearchHit{}
	}
	return results, nil
}

func trim(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}

// snippetRune returns at most maxRunes runes from s, appending "..."
// if truncated. Safe for multi-byte (CJK) text.
func snippetRune(s string, maxRunes int) string {
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "..."
}
