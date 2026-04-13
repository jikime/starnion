package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

// FileRepository owns the `files` table plus the `file_sections`
// index table used by hybrid search.
type FileRepository interface {
	// ── files table ──────────────────────────────────────────────
	ListFiles(ctx context.Context, userID uuid.UUID, filter entity.FileFilter) ([]entity.File, int, error)
	// TypeCounts returns {"document": N, "image": N, "audio": N}.
	// Only called when the list endpoint is unfiltered.
	TypeCounts(ctx context.Context, userID uuid.UUID) (map[string]int, error)

	GetFile(ctx context.Context, userID uuid.UUID, id string) (entity.File, bool, error)
	GetObjectKey(ctx context.Context, userID uuid.UUID, id string) (string, error)
	InsertFile(ctx context.Context, userID uuid.UUID, f entity.FileCreate) (int64, error)
	DeleteFile(ctx context.Context, userID uuid.UUID, id string) error
	PatchFile(ctx context.Context, userID uuid.UUID, id string, patch entity.FilePatch) error

	// ── Document indexing (file_sections) ────────────────────────
	// GetDocumentForIndex returns (id, name, file_type, object_key)
	// for a file that is a document and owned by the user. Returns
	// ok=false when the file does not exist or is not a document.
	GetDocumentForIndex(ctx context.Context, userID uuid.UUID, id string) (fileID int64, name, fileType, objectKey string, ok bool, err error)

	// ReplaceFileSections deletes all existing sections for the
	// file and inserts the new chunks inside a single transaction.
	// MarkIndexed is called once the rows are committed.
	ReplaceFileSections(ctx context.Context, fileID int64, chunks []entity.IndexedChunk) (inserted int, err error)
	MarkFileIndexed(ctx context.Context, fileID int64) error

	// ── Hybrid search ───────────────────────────────────────────
	SearchSectionsVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.FileSectionHit, error)
	SearchSectionsText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.FileSectionHit, error)
}
