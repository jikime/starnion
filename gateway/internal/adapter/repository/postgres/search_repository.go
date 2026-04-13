package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type SearchRepository struct {
	db *database.DB
}

func NewSearchRepository(db *database.DB) *SearchRepository {
	return &SearchRepository{db: db}
}

// ── Saved searches ─────────────────────────────────────────────────────

func (r *SearchRepository) ListSaved(ctx context.Context, userID uuid.UUID, query string, limit, offset int) ([]entity.SavedSearch, int, error) {
	var rows pgx.Rows
	var err error
	if query != "" {
		rows, err = r.db.Pool().Query(ctx,
			`SELECT id, query, result, created_at FROM searches
			 WHERE user_id = $1 AND (query ILIKE $2 OR result ILIKE $2)
			 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
			userID, "%"+query+"%", limit, offset,
		)
	} else {
		rows, err = r.db.Pool().Query(ctx,
			`SELECT id, query, result, created_at FROM searches
			 WHERE user_id = $1
			 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			userID, limit, offset,
		)
	}
	if err != nil {
		return nil, 0, fmt.Errorf("postgres search list: %w", err)
	}
	defer rows.Close()

	var out []entity.SavedSearch
	for rows.Next() {
		var s entity.SavedSearch
		if err := rows.Scan(&s.ID, &s.Query, &s.Result, &s.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("postgres search list scan: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM searches WHERE user_id = $1`, userID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("postgres search count: %w", err)
	}
	return out, total, nil
}

func (r *SearchRepository) GetSaved(ctx context.Context, userID uuid.UUID, id string) (entity.SavedSearch, error) {
	var s entity.SavedSearch
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, query, result, created_at FROM searches WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&s.ID, &s.Query, &s.Result, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.SavedSearch{}, domain.ErrNotFound
	}
	if err != nil {
		return entity.SavedSearch{}, fmt.Errorf("postgres search get: %w", err)
	}
	return s, nil
}

func (r *SearchRepository) CreateSaved(ctx context.Context, userID uuid.UUID, query, result string) (int64, error) {
	var id int64
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO searches (user_id, query, result) VALUES ($1, $2, $3) RETURNING id`,
		userID, query, result,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres search insert: %w", err)
	}
	return id, nil
}

func (r *SearchRepository) DeleteSaved(ctx context.Context, userID uuid.UUID, id string) error {
	_, err := r.db.Pool().Exec(ctx,
		`DELETE FROM searches WHERE id = $1 AND user_id = $2`, id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres search delete: %w", err)
	}
	return nil
}

// ── Hybrid search reads ────────────────────────────────────────────────

func (r *SearchRepository) SearchDiaryText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id::text, 'diary' AS type, one_liner AS title,
		        COALESCE(full_note, '') AS content, entry_date::text AS date
		 FROM planner_diary
		 WHERE user_id = $1
		   AND (one_liner ILIKE $2 OR full_note ILIKE $2)
		 ORDER BY entry_date DESC
		 LIMIT $3`,
		userID, "%"+query+"%", limit,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres search diary text: %w", err)
	}
	defer rows.Close()
	var out []entity.SearchHit
	for rows.Next() {
		var hit entity.SearchHit
		var content string
		if err := rows.Scan(&hit.ID, &hit.Type, &hit.Title, &content, &hit.Date); err != nil {
			return nil, fmt.Errorf("postgres search diary text scan: %w", err)
		}
		hit.Text = content
		hit.Score = 0.5 // FTS hits get a constant baseline score.
		out = append(out, hit)
	}
	return out, rows.Err()
}

func (r *SearchRepository) SearchKnowledgeText(ctx context.Context, userID uuid.UUID, query string, limit int) ([]entity.SearchHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id::text, 'knowledge' AS type, key, value, created_at::text AS date,
		        ts_rank(content_tsv, plainto_tsquery('simple', $2)) AS rank
		 FROM knowledge_base
		 WHERE user_id = $1
		   AND (content_tsv @@ plainto_tsquery('simple', $2) OR key ILIKE $3 OR value ILIKE $3)
		 ORDER BY rank DESC
		 LIMIT $4`,
		userID, query, "%"+query+"%", limit,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres search knowledge text: %w", err)
	}
	defer rows.Close()
	var out []entity.SearchHit
	for rows.Next() {
		var hit entity.SearchHit
		var value string
		if err := rows.Scan(&hit.ID, &hit.Type, &hit.Title, &value, &hit.Date, &hit.Score); err != nil {
			return nil, fmt.Errorf("postgres search knowledge text scan: %w", err)
		}
		hit.Text = value
		out = append(out, hit)
	}
	return out, rows.Err()
}

func (r *SearchRepository) SearchDiaryVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id::text, 'diary' AS type, one_liner AS title,
		        COALESCE(full_note, '') AS content, entry_date::text AS date,
		        1 - (embedding <=> $2::vector) AS score
		 FROM planner_diary
		 WHERE user_id = $1 AND embedding IS NOT NULL
		 ORDER BY embedding <=> $2::vector
		 LIMIT $3`,
		userID, vectorLit, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres search diary vector: %w", err)
	}
	defer rows.Close()
	var out []entity.SearchHit
	for rows.Next() {
		var hit entity.SearchHit
		var content string
		if err := rows.Scan(&hit.ID, &hit.Type, &hit.Title, &content, &hit.Date, &hit.Score); err != nil {
			return nil, fmt.Errorf("postgres search diary vector scan: %w", err)
		}
		hit.Text = content
		out = append(out, hit)
	}
	return out, rows.Err()
}

func (r *SearchRepository) SearchKnowledgeVector(ctx context.Context, userID uuid.UUID, vectorLit string, limit int) ([]entity.SearchHit, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id::text, 'knowledge' AS type, key, value, created_at::text AS date,
		        1 - (embedding <=> $2::vector) AS score
		 FROM knowledge_base
		 WHERE user_id = $1 AND embedding IS NOT NULL
		 ORDER BY embedding <=> $2::vector
		 LIMIT $3`,
		userID, vectorLit, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres search knowledge vector: %w", err)
	}
	defer rows.Close()
	var out []entity.SearchHit
	for rows.Next() {
		var hit entity.SearchHit
		var value string
		if err := rows.Scan(&hit.ID, &hit.Type, &hit.Title, &value, &hit.Date, &hit.Score); err != nil {
			return nil, fmt.Errorf("postgres search knowledge vector scan: %w", err)
		}
		hit.Text = value
		out = append(out, hit)
	}
	return out, rows.Err()
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.SearchRepository = (*SearchRepository)(nil)
