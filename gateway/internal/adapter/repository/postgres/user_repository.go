// Package postgres implements the domain repository ports against the
// gateway's PostgreSQL database. Each repository is a thin, stateless type
// that accepts a *database.DB and translates domain operations into SQL.
// Constraints:
//   - Functions in this package must not import handler or usecase packages.
//   - SQL errors are wrapped; sql.ErrNoRows becomes domain.ErrNotFound so
//     the usecase layer only has to inspect sentinels, never driver types.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// UserRepository is the Postgres-backed implementation of
// repository.UserRepository. Exposed as a struct (not an interface) so
// callers can verify satisfaction at compile time via the var _ assertion
// at the bottom of this file.
type UserRepository struct {
	db *database.DB
}

// NewUserRepository binds the given database handle to a UserRepository.
func NewUserRepository(db *database.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindByID loads one row by primary key and hydrates it into an entity.
func (r *UserRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	const q = `
		SELECT id, telegram_id, telegram_username, email, password_hash,
		       display_name, avatar_url, COALESCE(preferences, '{}'::jsonb),
		       is_active, created_at, updated_at
		  FROM users
		 WHERE id = $1`

	var (
		u        entity.User
		prefsRaw []byte
	)
	err := r.db.Pool().QueryRow(ctx, q, id).Scan(
		&u.ID,
		&u.TelegramID,
		&u.TelegramUsername,
		&u.Email,
		&u.PasswordHash,
		&u.DisplayName,
		&u.AvatarURL,
		&prefsRaw,
		&u.IsActive,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("postgres user find by id: %w", err)
	}
	if len(prefsRaw) > 0 {
		if err := json.Unmarshal(prefsRaw, &u.Preferences); err != nil {
			return nil, fmt.Errorf("postgres user preferences unmarshal: %w", err)
		}
	}
	return &u, nil
}

// UpdateProfile patches display_name, avatar_url and optionally merges a
// JSONB patch into preferences — all in a single UPDATE round-trip.
func (r *UserRepository) UpdateProfile(ctx context.Context, id uuid.UUID, patch repository.UserProfilePatch) error {
	// When a preferences patch is present, fold it into the SET clause with
	// `preferences || $3::jsonb`. Otherwise skip the jsonb merge entirely.
	var (
		res pgconn.CommandTag
		err error
	)
	if len(patch.Preferences) > 0 {
		prefsJSON, mErr := json.Marshal(patch.Preferences)
		if mErr != nil {
			return fmt.Errorf("postgres user preferences marshal: %w", mErr)
		}
		const q = `
			UPDATE users
			   SET display_name = COALESCE($1, display_name),
			       avatar_url   = COALESCE($2, avatar_url),
			       preferences  = COALESCE(preferences, '{}'::jsonb) || $3::jsonb,
			       updated_at   = NOW()
			 WHERE id = $4`
		res, err = r.db.Pool().Exec(ctx, q, patch.DisplayName, patch.AvatarURL, prefsJSON, id)
	} else {
		const q = `
			UPDATE users
			   SET display_name = COALESCE($1, display_name),
			       avatar_url   = COALESCE($2, avatar_url),
			       updated_at   = NOW()
			 WHERE id = $3`
		res, err = r.db.Pool().Exec(ctx, q, patch.DisplayName, patch.AvatarURL, id)
	}
	if err != nil {
		return fmt.Errorf("postgres user update profile: %w", err)
	}
	if res.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// GetPreferences returns the raw JSONB blob so callers can stream it
// directly to HTTP clients without unmarshal/remarshal overhead.
func (r *UserRepository) GetPreferences(ctx context.Context, id uuid.UUID) (json.RawMessage, error) {
	var raw []byte
	err := r.db.Pool().QueryRow(ctx, `SELECT COALESCE(preferences, '{}'::jsonb) FROM users WHERE id = $1`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("postgres user get preferences: %w", err)
	}
	return json.RawMessage(raw), nil
}

// ReplacePreferences overwrites the JSONB document verbatim.
func (r *UserRepository) ReplacePreferences(ctx context.Context, id uuid.UUID, prefs map[string]any) error {
	data, err := json.Marshal(prefs)
	if err != nil {
		return fmt.Errorf("postgres user replace preferences marshal: %w", err)
	}
	res, err := r.db.Pool().Exec(ctx,
		`UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2`,
		data, id,
	)
	if err != nil {
		return fmt.Errorf("postgres user replace preferences: %w", err)
	}
	if res.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Compile-time guarantee that UserRepository satisfies the port. If the
// interface gains a method, this line will fail to compile and tell the
// developer exactly which method is missing.
var _ repository.UserRepository = (*UserRepository)(nil)
