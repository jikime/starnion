// Package files hosts the unified files domain use cases:
// document/image/audio CRUD, multipart upload, signed-URL
// issuance, text extraction + embedding indexing, and hybrid
// (semantic + full-text) search.
//
// The heaviest external dependencies (MinIO, text extractor
// subprocess) live behind small ports so the usecase layer stays
// testable.
package files

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/adapter/http/signedurl"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
)

// Embedder is the port the usecase calls to resolve and generate
// per-user embeddings. Satisfied by a thin adapter in the
// http/files package that wraps infrastructure/embedding.
type Embedder interface {
	// Generate returns the embedding vector for `text` using the
	// user's configured provider. Non-nil error when no provider
	// is configured or the API call fails.
	Generate(ctx context.Context, userID uuid.UUID, text string) ([]float32, error)
	// VectorLiteral converts the vector to the pgvector
	// `[f1,f2,...]` literal used for `$n::vector` bindings.
	VectorLiteral(vec []float32) string
	// Enabled reports whether the user has a provider configured
	// right now. Called by the indexer to decide whether to run
	// the embedding worker pool at all.
	Enabled(ctx context.Context, userID uuid.UUID) bool
}

// TextExtractor is the port for the external text extraction
// subprocess (python3 scripts/extract_text.py). Satisfied by a
// small adapter that shells out.
type TextExtractor interface {
	Extract(ctx context.Context, data []byte, ext, filename string) (string, error)
}

type UseCase struct {
	repo          repository.FileRepository
	embedder      Embedder
	extractor     TextExtractor
	jwtSecret     string
	encryptionKey string
}

func NewUseCase(repo repository.FileRepository, embedder Embedder, extractor TextExtractor, jwtSecret, encryptionKey string) *UseCase {
	return &UseCase{
		repo:          repo,
		embedder:      embedder,
		extractor:     extractor,
		jwtSecret:     jwtSecret,
		encryptionKey: encryptionKey,
	}
}

// ── List / Get / Delete / Patch ──────────────────────────────────

// ListResult is the response DTO for GET /files. TypeCounts is
// non-nil only when the caller did NOT filter by file_type.
type ListResult struct {
	Files      []entity.File
	Total      int
	Page       int
	Limit      int
	TypeCounts map[string]int
}

func (u *UseCase) ListFiles(ctx context.Context, userID uuid.UUID, filter entity.FileFilter) (ListResult, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 || filter.Limit > 100 {
		filter.Limit = 20
	}
	files, total, err := u.repo.ListFiles(ctx, userID, filter)
	if err != nil {
		return ListResult{}, err
	}
	if files == nil {
		files = []entity.File{}
	}
	res := ListResult{
		Files: files,
		Total: total,
		Page:  filter.Page,
		Limit: filter.Limit,
	}
	// Fetch type counts only when no type filter is set — the UI
	// uses them to render the tab badges.
	if filter.FileType == "" {
		if counts, err := u.repo.TypeCounts(ctx, userID); err == nil {
			res.TypeCounts = counts
		}
	}
	return res, nil
}

func (u *UseCase) GetFile(ctx context.Context, userID uuid.UUID, id string) (entity.File, error) {
	f, found, err := u.repo.GetFile(ctx, userID, id)
	if err != nil {
		return entity.File{}, err
	}
	if !found {
		return entity.File{}, domain.ErrNotFound
	}
	return f, nil
}

func (u *UseCase) InsertFile(ctx context.Context, userID uuid.UUID, f entity.FileCreate) (int64, error) {
	return u.repo.InsertFile(ctx, userID, f)
}

func (u *UseCase) DeleteFile(ctx context.Context, userID uuid.UUID, id string) (objectKey string, err error) {
	// Fetch object key before the delete so the handler can wipe
	// the object from the media store after the DB row is gone.
	objectKey, _ = u.repo.GetObjectKey(ctx, userID, id)
	if delErr := u.repo.DeleteFile(ctx, userID, id); delErr != nil {
		return "", delErr
	}
	return objectKey, nil
}

func (u *UseCase) PatchFile(ctx context.Context, userID uuid.UUID, id string, patch entity.FilePatch) error {
	if patch.Transcript == nil && patch.Analysis == nil && patch.SubType == nil && patch.Prompt == nil {
		return fmt.Errorf("%w: nothing to update", domain.ErrInvalidArgument)
	}
	return u.repo.PatchFile(ctx, userID, id, patch)
}

// ── Signed URL ───────────────────────────────────────────────────

// SignedURLResult is the response DTO for GET /files/:id/signed-url.
type SignedURLResult struct {
	URL       string
	ExpiresIn int
}

// SignedURL looks up the file's object key and issues a short-lived
// HMAC-signed URL scoped to the caller's user id.
func (u *UseCase) SignedURL(ctx context.Context, userID uuid.UUID, id string) (SignedURLResult, error) {
	key, err := u.repo.GetObjectKey(ctx, userID, id)
	if err != nil {
		return SignedURLResult{}, err
	}
	if key == "" {
		return SignedURLResult{}, domain.ErrNotFound
	}
	query := signedurl.Sign(key, userID.String(), u.jwtSecret, signedurl.DefaultTTL)
	return SignedURLResult{
		URL:       "/api/files/" + key + "?" + query,
		ExpiresIn: int(signedurl.DefaultTTL.Seconds()),
	}, nil
}

// ── Indexing ─────────────────────────────────────────────────────

// IndexResult is the response DTO for POST /files/:id/index.
type IndexResult struct {
	FileID     int64
	Indexed    bool
	Chunks     int
	Embedding  bool
	SearchMode string
}

// IndexFile reads the file bytes from the passed-in data (the HTTP
// adapter fetches them from the media store), chunks the extracted
// text, embeds the chunks in parallel when a provider is available,
// and replaces the file_sections rows inside a single transaction.
func (u *UseCase) IndexFile(ctx context.Context, userID uuid.UUID, fileIDStr string, readFile func(ctx context.Context, objectKey string) ([]byte, error)) (IndexResult, error) {
	fileID, name, fileType, objectKey, ok, err := u.repo.GetDocumentForIndex(ctx, userID, fileIDStr)
	if err != nil {
		return IndexResult{}, err
	}
	if !ok {
		return IndexResult{}, domain.ErrNotFound
	}

	embeddingEnabled := u.embedder != nil && u.embedder.Enabled(ctx, userID)

	data, err := readFile(ctx, objectKey)
	if err != nil {
		return IndexResult{}, fmt.Errorf("%w: read file", err)
	}
	text, err := u.extractor.Extract(ctx, data, fileType, name)
	if err != nil {
		return IndexResult{}, fmt.Errorf("text extraction failed: %w", err)
	}
	if strings.TrimSpace(text) == "" {
		return IndexResult{}, fmt.Errorf("%w: no text content found", domain.ErrInvalidArgument)
	}

	chunks := ChunkText(text, 1000, 200)
	if len(chunks) == 0 {
		return IndexResult{}, fmt.Errorf("%w: no text chunks produced", domain.ErrInvalidArgument)
	}

	// Compute embeddings outside the tx — 8 workers so a 30-page PDF
	// doesn't serialise 50 embedding RTTs on one connection.
	indexed := make([]entity.IndexedChunk, len(chunks))
	for i := range chunks {
		indexed[i] = entity.IndexedChunk{Index: i, Content: chunks[i], DocTitle: name}
	}
	if embeddingEnabled {
		const workerCount = 8
		sem := make(chan struct{}, workerCount)
		var wg sync.WaitGroup
		for i := range indexed {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int) {
				defer wg.Done()
				defer func() { <-sem }()
				emb, err := u.embedder.Generate(ctx, userID, indexed[i].Content)
				if err != nil {
					return // leave embedding nil — insert will fall back to text-only
				}
				indexed[i].Embedding = emb
			}(i)
		}
		wg.Wait()
	}

	success, err := u.repo.ReplaceFileSections(ctx, fileID, indexed)
	if err != nil {
		return IndexResult{}, err
	}
	searchMode := "full-text"
	if embeddingEnabled {
		searchMode = "semantic + full-text"
	}
	return IndexResult{
		FileID:     fileID,
		Indexed:    true,
		Chunks:     success,
		Embedding:  embeddingEnabled,
		SearchMode: searchMode,
	}, nil
}

// ChunkText splits text into overlapping chunks for embedding
// indexing. Exported so the http handler or other callers can
// preview chunking without going through IndexFile.
func ChunkText(text string, chunkSize, overlap int) []string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return nil
	}
	step := chunkSize - overlap
	if step <= 0 {
		step = chunkSize
	}
	var chunks []string
	for i := 0; i < len(runes); i += step {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunk := strings.TrimSpace(string(runes[i:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		if end >= len(runes) {
			break
		}
	}
	return chunks
}

// ── Hybrid search ───────────────────────────────────────────────

// SearchResult is the response DTO for GET /files/search.
type SearchResult struct {
	Hits       []entity.FileSectionHit
	Query      string
	SearchMode string
}

// Search runs the vector path first (when an embedder is available),
// and falls back to text-only search when the vector call errors.
func (u *UseCase) Search(ctx context.Context, userID uuid.UUID, query string, limit int) (SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return SearchResult{}, fmt.Errorf("%w: q is required", domain.ErrInvalidArgument)
	}
	if len(query) > 500 {
		return SearchResult{}, fmt.Errorf("%w: query too long (max 500 chars)", domain.ErrInvalidArgument)
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}

	if u.embedder != nil && u.embedder.Enabled(ctx, userID) {
		if vec, err := u.embedder.Generate(ctx, userID, query); err == nil {
			hits, err := u.repo.SearchSectionsVector(ctx, userID, u.embedder.VectorLiteral(vec), limit)
			if err == nil && len(hits) > 0 {
				return SearchResult{Hits: hits, Query: query, SearchMode: "semantic"}, nil
			}
		}
	}
	hits, err := u.repo.SearchSectionsText(ctx, userID, query, limit)
	if err != nil {
		return SearchResult{}, err
	}
	return SearchResult{Hits: hits, Query: query, SearchMode: "full-text"}, nil
}

// Compile-time reference to prevent the `time` import from being
// dropped (used by the embedding request timeout in future).
var _ = time.Second

// Compile-time reference to prevent the `json` import from being
// dropped (used by the FileCreate metadata pass-through).
var _ = json.Marshal
