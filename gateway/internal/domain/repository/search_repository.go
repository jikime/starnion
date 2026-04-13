package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// SearchRepository is the persistence port for the saved-search
// aggregate and for the hybrid-search read queries. Keeping both read
// shapes on one interface avoids a third "search_hit_repository" file
// while letting tests fake them together.
type SearchRepository interface {
	// ── Saved searches (CRUD over the `searches` table) ──
	ListSaved(ctx context.Context, userID uuid.UUID, query string, limit, offset int) ([]entity.SavedSearch, int, error)
	GetSaved(ctx context.Context, userID uuid.UUID, id string) (entity.SavedSearch, error)
	CreateSaved(ctx context.Context, userID uuid.UUID, query, result string) (int64, error)
	DeleteSaved(ctx context.Context, userID uuid.UUID, id string) error

	// ── Hybrid search (text + optional vector) ──
	// SearchDiaryText runs an ILIKE search over planner_diary.
	SearchDiaryText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error)
	// SearchKnowledgeText runs a FTS + ILIKE search over knowledge_base.
	SearchKnowledgeText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error)
	// SearchDiaryVector runs a pgvector cosine-similarity search.
	SearchDiaryVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error)
	// SearchKnowledgeVector runs a pgvector cosine-similarity search.
	SearchKnowledgeVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error)
}
