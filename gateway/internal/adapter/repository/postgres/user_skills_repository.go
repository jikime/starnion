package postgres

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type UserSkillsRepository struct {
	db *database.DB
}

func NewUserSkillsRepository(db *database.DB) *UserSkillsRepository {
	return &UserSkillsRepository{db: db}
}

func (r *UserSkillsRepository) ListEnabled(ctx context.Context, userID uuid.UUID) (map[string]bool, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT skill_id, enabled FROM user_skills WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres user_skills list: %w", err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		var enabled bool
		if err := rows.Scan(&id, &enabled); err != nil {
			return nil, fmt.Errorf("postgres user_skills scan: %w", err)
		}
		out[id] = enabled
	}
	return out, rows.Err()
}

func (r *UserSkillsRepository) Toggle(ctx context.Context, userID uuid.UUID, skillID string, enabled bool) error {
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO user_skills (user_id, skill_id, enabled)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, skill_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
		userID, skillID, enabled,
	)
	if err != nil {
		return fmt.Errorf("postgres user_skills toggle: %w", err)
	}
	return nil
}

func (r *UserSkillsRepository) GetUserLanguage(ctx context.Context, userID uuid.UUID) string {
	var lang string
	err := r.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences->>'language', 'ko') FROM users WHERE id = $1`, userID,
	).Scan(&lang)
	if err != nil || lang == "" {
		return "ko"
	}
	return lang
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.UserSkillsRepository = (*UserSkillsRepository)(nil)
