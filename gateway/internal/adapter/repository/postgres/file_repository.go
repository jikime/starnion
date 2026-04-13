package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type FileRepository struct {
	db *database.DB
}

func NewFileRepository(db *database.DB) *FileRepository {
	return &FileRepository{db: db}
}

// ── files table ───────────────────────────────────────────────────

func (r *FileRepository) ListFiles(ctx context.Context, userID uuid.UUID, filter entity.FileFilter) ([]entity.File, int, error) {
	where := "WHERE user_id = $1"
	args := []any{userID}
	idx := 2
	if filter.FileType == "document" || filter.FileType == "image" || filter.FileType == "audio" {
		where += " AND file_type = $" + strconv.Itoa(idx)
		args = append(args, filter.FileType)
		idx++
	}
	if filter.Name != "" {
		where += " AND name ILIKE $" + strconv.Itoa(idx)
		args = append(args, "%"+filter.Name+"%")
		idx++
	}

	var total int
	if err := r.db.Pool().QueryRow(ctx,
		"SELECT COUNT(*) FROM files "+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("postgres files count: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	page := filter.Page
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	listArgs := append(append([]any{}, args...), limit, offset)
	rows, err := r.db.Pool().Query(ctx,
		"SELECT id, name, mime, file_type, url, object_key, size, source, sub_type, "+
			"indexed, COALESCE(prompt,''), COALESCE(analysis,''), COALESCE(transcript,''), "+
			"duration, metadata, created_at FROM files "+where+
			" ORDER BY created_at DESC LIMIT $"+strconv.Itoa(idx)+
			" OFFSET $"+strconv.Itoa(idx+1),
		listArgs...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("postgres files list: %w", err)
	}
	defer rows.Close()
	var out []entity.File
	for rows.Next() {
		var f entity.File
		if err := rows.Scan(&f.ID, &f.Name, &f.MIME, &f.FileType, &f.URL,
			&f.ObjectKey, &f.Size, &f.Source, &f.SubType, &f.Indexed,
			&f.Prompt, &f.Analysis, &f.Transcript, &f.Duration, &f.Metadata, &f.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("postgres files scan: %w", err)
		}
		out = append(out, f)
	}
	return out, total, rows.Err()
}

func (r *FileRepository) TypeCounts(ctx context.Context, userID uuid.UUID) (map[string]int, error) {
	counts := map[string]int{"document": 0, "image": 0, "audio": 0}
	rows, err := r.db.Pool().Query(ctx,
		`SELECT file_type, COUNT(*) FROM files WHERE user_id = $1 GROUP BY file_type`, userID,
	)
	if err != nil {
		return counts, fmt.Errorf("postgres files type counts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var ft string
		var n int
		if err := rows.Scan(&ft, &n); err == nil {
			counts[ft] = n
		}
	}
	return counts, rows.Err()
}

func (r *FileRepository) GetFile(ctx context.Context, userID uuid.UUID, id string) (entity.File, bool, error) {
	var f entity.File
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, name, mime, file_type, url, object_key, size, source, sub_type,
		        indexed, COALESCE(prompt,''), COALESCE(analysis,''), COALESCE(transcript,''),
		        duration, metadata, created_at
		 FROM files WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&f.ID, &f.Name, &f.MIME, &f.FileType, &f.URL, &f.ObjectKey, &f.Size,
		&f.Source, &f.SubType, &f.Indexed, &f.Prompt, &f.Analysis, &f.Transcript,
		&f.Duration, &f.Metadata, &f.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.File{}, false, nil
	}
	if err != nil {
		return entity.File{}, false, fmt.Errorf("postgres file get: %w", err)
	}
	return f, true, nil
}

func (r *FileRepository) GetObjectKey(ctx context.Context, userID uuid.UUID, id string) (string, error) {
	var key string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT object_key FROM files WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("postgres file object key: %w", err)
	}
	return key, nil
}

func (r *FileRepository) InsertFile(ctx context.Context, userID uuid.UUID, f entity.FileCreate) (int64, error) {
	metadata := f.Metadata
	if len(metadata) == 0 {
		metadata = []byte("{}")
	}
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO files (user_id, name, mime, file_type, url, object_key, size, source, sub_type, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
		userID, f.Name, f.MIME, f.FileType, f.URL, f.ObjectKey, f.Size,
		f.Source, f.SubType, metadata, f.CreatedAt,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres file insert: %w", err)
	}
	return id, nil
}

func (r *FileRepository) DeleteFile(ctx context.Context, userID uuid.UUID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM files WHERE id = $1 AND user_id = $2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres file delete: %w", err)
	}
	return nil
}

func (r *FileRepository) PatchFile(ctx context.Context, userID uuid.UUID, id string, patch entity.FilePatch) error {
	sets := []string{}
	args := []any{}
	idx := 1
	if patch.Transcript != nil {
		sets = append(sets, "transcript = $"+strconv.Itoa(idx))
		args = append(args, *patch.Transcript)
		idx++
	}
	if patch.Analysis != nil {
		sets = append(sets, "analysis = $"+strconv.Itoa(idx))
		args = append(args, *patch.Analysis)
		idx++
	}
	if patch.SubType != nil {
		sets = append(sets, "sub_type = $"+strconv.Itoa(idx))
		args = append(args, *patch.SubType)
		idx++
	}
	if patch.Prompt != nil {
		sets = append(sets, "prompt = $"+strconv.Itoa(idx))
		args = append(args, *patch.Prompt)
		idx++
	}
	if len(sets) == 0 {
		return nil
	}
	args = append(args, id, userID)
	query := "UPDATE files SET "
	for i, s := range sets {
		if i > 0 {
			query += ", "
		}
		query += s
	}
	query += " WHERE id = $" + strconv.Itoa(idx) + " AND user_id = $" + strconv.Itoa(idx+1)
	if _, err := r.db.Pool().Exec(ctx, query, args...); err != nil {
		return fmt.Errorf("postgres file patch: %w", err)
	}
	return nil
}

// ── Document indexing ────────────────────────────────────────────

func (r *FileRepository) GetDocumentForIndex(ctx context.Context, userID uuid.UUID, id string) (int64, string, string, string, bool, error) {
	var fileID int64
	var name, fileType, objectKey string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, name, file_type, object_key FROM files
		 WHERE id = $1 AND user_id = $2 AND file_type = 'document'`,
		id, userID,
	).Scan(&fileID, &name, &fileType, &objectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", "", "", false, nil
	}
	if err != nil {
		return 0, "", "", "", false, fmt.Errorf("postgres file document get: %w", err)
	}
	return fileID, name, fileType, objectKey, true, nil
}

func (r *FileRepository) ReplaceFileSections(ctx context.Context, fileID int64, chunks []entity.IndexedChunk) (int, error) {
	tx, err := r.db.Pool().BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("postgres file sections begin: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM file_sections WHERE file_id = $1`, fileID,
	); err != nil {
		_ = tx.Rollback(ctx)
		return 0, fmt.Errorf("postgres file sections delete: %w", err)
	}
	success := 0
	for _, ch := range chunks {
		meta, _ := json.Marshal(map[string]any{
			"chunk":     ch.Index,
			"doc_title": ch.DocTitle,
			"embedding": ch.Embedding != nil,
		})
		if ch.Embedding != nil {
			vecLit := vectorLiteralFloat32(ch.Embedding)
			_, insErr := tx.Exec(ctx,
				`INSERT INTO file_sections (file_id, content, embedding, content_tsv, metadata)
				 VALUES ($1, $2, $3::vector, to_tsvector('simple', $2), $4::jsonb)`,
				fileID, ch.Content, vecLit, string(meta),
			)
			if insErr != nil {
				continue
			}
		} else {
			_, insErr := tx.Exec(ctx,
				`INSERT INTO file_sections (file_id, content, embedding, content_tsv, metadata)
				 VALUES ($1, $2, NULL, to_tsvector('simple', $2), $3::jsonb)`,
				fileID, ch.Content, string(meta),
			)
			if insErr != nil {
				continue
			}
		}
		success++
	}
	if success == 0 {
		_ = tx.Rollback(ctx)
		return 0, fmt.Errorf("postgres file sections: no chunks inserted")
	}
	if _, err := tx.Exec(ctx,
		`UPDATE files SET indexed = TRUE WHERE id = $1`, fileID,
	); err != nil {
		_ = tx.Rollback(ctx)
		return 0, fmt.Errorf("postgres file sections mark indexed: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("postgres file sections commit: %w", err)
	}
	return success, nil
}

func (r *FileRepository) MarkFileIndexed(ctx context.Context, fileID int64) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE files SET indexed = TRUE WHERE id = $1`, fileID,
	)
	if err != nil {
		return fmt.Errorf("postgres file mark indexed: %w", err)
	}
	return nil
}

// ── Hybrid search ────────────────────────────────────────────────

func (r *FileRepository) SearchSectionsVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.FileSectionHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT fs.id, fs.content, f.id, f.name, f.file_type,
		        1 - (fs.embedding <=> $1::vector) AS similarity
		 FROM file_sections fs
		 JOIN files f ON f.id = fs.file_id
		 WHERE f.user_id = $2 AND fs.embedding IS NOT NULL
		 ORDER BY fs.embedding <=> $1::vector
		 LIMIT $3`,
		vectorLit, userID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres file search vector: %w", err)
	}
	defer rows.Close()
	var out []entity.FileSectionHit
	for rows.Next() {
		var hit entity.FileSectionHit
		if err := rows.Scan(&hit.SectionID, &hit.Content, &hit.FileID, &hit.FileName, &hit.FileType, &hit.Similarity); err != nil {
			return nil, fmt.Errorf("postgres file search vector scan: %w", err)
		}
		out = append(out, hit)
	}
	return out, rows.Err()
}

func (r *FileRepository) SearchSectionsText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.FileSectionHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT fs.id, fs.content, f.id, f.name, f.file_type,
		        ts_rank(fs.content_tsv, plainto_tsquery('simple', $1)) AS similarity
		 FROM file_sections fs
		 JOIN files f ON f.id = fs.file_id
		 WHERE f.user_id = $2
		   AND (fs.content_tsv @@ plainto_tsquery('simple', $1) OR fs.content ILIKE $4)
		 ORDER BY similarity DESC
		 LIMIT $3`,
		query, userID, limit, "%"+query+"%",
	)
	if err != nil {
		return nil, fmt.Errorf("postgres file search text: %w", err)
	}
	defer rows.Close()
	var out []entity.FileSectionHit
	for rows.Next() {
		var hit entity.FileSectionHit
		if err := rows.Scan(&hit.SectionID, &hit.Content, &hit.FileID, &hit.FileName, &hit.FileType, &hit.Similarity); err != nil {
			return nil, fmt.Errorf("postgres file search text scan: %w", err)
		}
		out = append(out, hit)
	}
	return out, rows.Err()
}

// vectorLiteralFloat32 converts a float32 slice into the pgvector
// `[f1,f2,...]` literal used in `$n::vector` query bindings.
// Duplicated from infrastructure/embedding so the postgres adapter
// does not import the embedding package (which would pull in the
// HTTP client).
func vectorLiteralFloat32(v []float32) string {
	out := "["
	for i, f := range v {
		if i > 0 {
			out += ","
		}
		out += fmt.Sprintf("%g", f)
	}
	out += "]"
	return out
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.FileRepository = (*FileRepository)(nil)
