package entity

import (
	"encoding/json"
	"time"
)

// File is one row in the `files` table — the unified storage for
// documents, images, and audios. NULL columns in the DB are
// represented as empty strings so the handler layer can marshal
// them directly without null checks everywhere.
type File struct {
	ID         int64
	Name       string
	MIME       string
	FileType   string // "document" | "image" | "audio"
	URL        string
	ObjectKey  string
	Size       int64
	Source     string
	SubType    string
	Indexed    bool
	Prompt     string
	Analysis   string
	Transcript string
	Duration   int
	Metadata   json.RawMessage
	CreatedAt  time.Time
}

// FileFilter bundles the query-string filters accepted by the
// list endpoint. Empty strings mean "no filter".
type FileFilter struct {
	FileType string // "document" | "image" | "audio" | ""
	Name     string // ILIKE substring
	Page     int
	Limit    int
}

// FileCreate is the write shape for InsertFile. Metadata is JSON
// that the repository persists as-is to the JSONB column.
type FileCreate struct {
	Name      string
	MIME      string
	FileType  string
	URL       string
	ObjectKey string
	Size      int64
	Source    string
	SubType   string
	Metadata  json.RawMessage
	CreatedAt time.Time
}

// FilePatch is a dynamic-field update shape. Non-nil pointers are
// applied; nil fields are left alone. Matches the legacy PATCH
// handler semantics.
type FilePatch struct {
	Transcript *string
	Analysis   *string
	SubType    *string
	Prompt     *string
}

// FileSectionHit is one chunk returned from the hybrid search
// endpoint. Similarity is the (1 - cosine) distance for vector
// search or ts_rank for full-text search.
type FileSectionHit struct {
	SectionID  int64
	FileID     int64
	FileName   string
	FileType   string
	Content    string
	Similarity float64
}

// IndexedChunk is one chunk after text extraction + embedding. The
// repository layer consumes a slice of these inside a transaction
// to replace the file_sections rows for a single file.
type IndexedChunk struct {
	Index     int
	Content   string
	Embedding []float32 // nil when embedding failed or disabled
	DocTitle  string    // used for the metadata JSONB
}
