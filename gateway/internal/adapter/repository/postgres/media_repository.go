package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type MediaRepository struct {
	db            *database.DB
	encryptionKey string
}

func NewMediaRepository(db *database.DB, encryptionKey string) *MediaRepository {
	return &MediaRepository{db: db, encryptionKey: encryptionKey}
}

// ── Images ────────────────────────────────────────────────────────

func (r *MediaRepository) ListImages(ctx context.Context, userID uuid.UUID, limit, offset int) ([]entity.Image, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, url, name, mime, size, source, type,
		        COALESCE(prompt,''), COALESCE(analysis,''), created_at
		 FROM images WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres media images list: %w", err)
	}
	defer rows.Close()
	var out []entity.Image
	for rows.Next() {
		var img entity.Image
		if err := rows.Scan(&img.ID, &img.URL, &img.Name, &img.MIME, &img.Size,
			&img.Source, &img.Type, &img.Prompt, &img.Analysis, &img.CreatedAt); err != nil {
			return nil, fmt.Errorf("postgres media images scan: %w", err)
		}
		out = append(out, img)
	}
	return out, rows.Err()
}

func (r *MediaRepository) CountImages(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM images WHERE user_id = $1`, userID,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres media images count: %w", err)
	}
	return n, nil
}

func (r *MediaRepository) GetImage(ctx context.Context, userID uuid.UUID, id string) (entity.Image, bool, error) {
	var img entity.Image
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, url, name, mime, size, source, type,
		        COALESCE(prompt,''), COALESCE(analysis,''), created_at
		 FROM images WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&img.ID, &img.URL, &img.Name, &img.MIME, &img.Size,
		&img.Source, &img.Type, &img.Prompt, &img.Analysis, &img.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.Image{}, false, nil
	}
	if err != nil {
		return entity.Image{}, false, fmt.Errorf("postgres media image get: %w", err)
	}
	return img, true, nil
}

func (r *MediaRepository) DeleteImage(ctx context.Context, userID uuid.UUID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM images WHERE id = $1 AND user_id = $2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres media image delete: %w", err)
	}
	return nil
}

func (r *MediaRepository) InsertImage(ctx context.Context, userID uuid.UUID, img entity.ImageCreate) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO images (user_id, url, name, mime, size, source, type)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userID, img.URL, img.Name, img.MIME, img.Size, img.Source, img.Type,
	)
	if err != nil {
		return fmt.Errorf("postgres media image insert: %w", err)
	}
	return nil
}

func (r *MediaRepository) InsertImageForUserID(ctx context.Context, userID string, img entity.ImageCreate) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO images (user_id, url, name, mime, size, source, type)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userID, img.URL, img.Name, img.MIME, img.Size, img.Source, img.Type,
	)
	if err != nil {
		return fmt.Errorf("postgres media image insert (internal): %w", err)
	}
	return nil
}

// ── Audios ────────────────────────────────────────────────────────

func (r *MediaRepository) ListAudios(ctx context.Context, userID uuid.UUID, limit, offset int) ([]entity.Audio, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, url, name, mime, size, duration, source, type,
		        COALESCE(transcript,''), created_at
		 FROM audios WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres media audios list: %w", err)
	}
	defer rows.Close()
	var out []entity.Audio
	for rows.Next() {
		var a entity.Audio
		if err := rows.Scan(&a.ID, &a.URL, &a.Name, &a.MIME, &a.Size,
			&a.Duration, &a.Source, &a.Type, &a.Transcript, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("postgres media audios scan: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *MediaRepository) CountAudios(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM audios WHERE user_id = $1`, userID,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("postgres media audios count: %w", err)
	}
	return n, nil
}

func (r *MediaRepository) GetAudio(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, bool, error) {
	var a entity.Audio
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, url, name, mime, size, duration, source, type,
		        COALESCE(transcript,''), created_at
		 FROM audios WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&a.ID, &a.URL, &a.Name, &a.MIME, &a.Size,
		&a.Duration, &a.Source, &a.Type, &a.Transcript, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.Audio{}, false, nil
	}
	if err != nil {
		return entity.Audio{}, false, fmt.Errorf("postgres media audio get: %w", err)
	}
	return a, true, nil
}

func (r *MediaRepository) GetAudioTranscript(ctx context.Context, userID uuid.UUID, id string) (entity.Audio, bool, error) {
	var a entity.Audio
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, COALESCE(transcript,'') FROM audios WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&a.ID, &a.Transcript)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.Audio{}, false, nil
	}
	if err != nil {
		return entity.Audio{}, false, fmt.Errorf("postgres media audio transcript: %w", err)
	}
	return a, true, nil
}

func (r *MediaRepository) DeleteAudio(ctx context.Context, userID uuid.UUID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM audios WHERE id = $1 AND user_id = $2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres media audio delete: %w", err)
	}
	return nil
}

func (r *MediaRepository) InsertAudio(ctx context.Context, userID uuid.UUID, a entity.AudioCreate) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO audios (user_id, url, name, mime, size, duration, source, type)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		userID, a.URL, a.Name, a.MIME, a.Size, a.Duration, a.Source, a.Type,
	)
	if err != nil {
		return fmt.Errorf("postgres media audio insert: %w", err)
	}
	return nil
}

// ── Lookups ──────────────────────────────────────────────────────

func (r *MediaRepository) GetProviderPlainKey(ctx context.Context, userID uuid.UUID, provider string) (string, error) {
	var enc string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT api_key FROM providers WHERE user_id = $1 AND provider = $2 LIMIT 1`,
		userID, provider,
	).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("postgres media provider key: %w", err)
	}
	plain, _ := crypto.Decrypt(enc, r.encryptionKey)
	return plain, nil
}

func (r *MediaRepository) UserIDByConversation(ctx context.Context, conversationID string) (string, error) {
	var userID string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT user_id FROM conversations WHERE id = $1 LIMIT 1`,
		conversationID,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("postgres media user by conv: %w", err)
	}
	return userID, nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.MediaRepository = (*MediaRepository)(nil)
