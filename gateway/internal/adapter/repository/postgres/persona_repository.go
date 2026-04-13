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

type PersonaRepository struct {
	db *database.DB
}

func NewPersonaRepository(db *database.DB) *PersonaRepository {
	return &PersonaRepository{db: db}
}

func (r *PersonaRepository) List(ctx context.Context, userID uuid.UUID) ([]entity.Persona, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, user_id, name, description, provider, model, system_prompt,
		        bot_name, user_name, is_default, COALESCE(system_key, ''),
		        created_at, updated_at
		 FROM personas WHERE user_id = $1
		 ORDER BY is_default DESC, created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres persona list: %w", err)
	}
	defer rows.Close()
	var out []entity.Persona
	for rows.Next() {
		var p entity.Persona
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Provider, &p.Model,
			&p.SystemPrompt, &p.BotName, &p.UserName, &p.IsDefault, &p.SystemKey,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres persona scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PersonaRepository) Create(ctx context.Context, userID uuid.UUID, cmd repository.PersonaCreate) (uuid.UUID, error) {
	id := uuid.New()
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO personas (id, user_id, name, description, provider, model,
		                       system_prompt, bot_name, user_name, is_default)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		id, userID, cmd.Name, cmd.Description, cmd.Provider, cmd.Model,
		cmd.SystemPrompt, cmd.BotName, cmd.UserName, cmd.IsDefault,
	)
	if err != nil {
		return uuid.Nil, fmt.Errorf("postgres persona create: %w", err)
	}
	return id, nil
}

func (r *PersonaRepository) Update(ctx context.Context, userID, personaID uuid.UUID, patch repository.PersonaUpdate) error {
	const updateSQL = `UPDATE personas SET
		 name          = COALESCE(NULLIF($1, ''), name),
		 description   = COALESCE(NULLIF($2, ''), description),
		 provider      = $3,
		 model         = $4,
		 system_prompt = $5,
		 bot_name      = $6,
		 user_name     = $7,
		 updated_at    = NOW()
	  WHERE id = $8 AND user_id = $9`

	// Non-default fast path: one UPDATE, no transaction.
	if patch.IsDefault == nil || !*patch.IsDefault {
		_, err := r.db.Pool().Exec(ctx, updateSQL,
			patch.Name, patch.Description, patch.Provider, patch.Model,
			patch.SystemPrompt, patch.BotName, patch.UserName, personaID, userID,
		)
		if err != nil {
			return fmt.Errorf("postgres persona update: %w", err)
		}
		return nil
	}

	// Default swap path: atomically clear every other default then set
	// this one as the new default. Must run in a single TX so there is
	// never a moment where the user has zero OR two default personas.
	tx, err := r.db.Pool().BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("postgres persona tx begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx,
		`UPDATE personas SET is_default = FALSE WHERE user_id = $1`, userID,
	); err != nil {
		return fmt.Errorf("postgres persona clear default: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE personas SET
		   name          = COALESCE(NULLIF($1, ''), name),
		   description   = COALESCE(NULLIF($2, ''), description),
		   provider      = $3,
		   model         = $4,
		   system_prompt = $5,
		   bot_name      = $6,
		   user_name     = $7,
		   is_default    = TRUE,
		   updated_at    = NOW()
		 WHERE id = $8 AND user_id = $9`,
		patch.Name, patch.Description, patch.Provider, patch.Model,
		patch.SystemPrompt, patch.BotName, patch.UserName, personaID, userID,
	); err != nil {
		return fmt.Errorf("postgres persona set default: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres persona tx commit: %w", err)
	}
	return nil
}

func (r *PersonaRepository) Delete(ctx context.Context, userID, personaID uuid.UUID) error {
	res, err := r.db.Pool().Exec(ctx,
		`DELETE FROM personas WHERE id = $1 AND user_id = $2 AND is_default = FALSE`,
		personaID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres persona delete: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("%w: cannot delete default persona or persona not found", domain.ErrInvalidArgument)
	}
	return nil
}

func (r *PersonaRepository) Default(ctx context.Context, userID uuid.UUID) (entity.ActivePersona, error) {
	var a entity.ActivePersona
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, name FROM personas WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
		userID,
	).Scan(&a.ID, &a.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ActivePersona{}, nil
	}
	if err != nil {
		return entity.ActivePersona{}, fmt.Errorf("postgres persona default: %w", err)
	}
	return a, nil
}

func (r *PersonaRepository) SetActivePersonaID(ctx context.Context, userID uuid.UUID, personaID string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE users
		 SET preferences = jsonb_set(COALESCE(preferences,'{}'), '{active_persona_id}', to_jsonb($1::text)),
		     updated_at  = NOW()
		 WHERE id = $2`,
		personaID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres persona set active: %w", err)
	}
	return nil
}

func (r *PersonaRepository) ExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error) {
	var exists bool
	err := r.db.Pool().QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM personas WHERE id = $1 AND user_id = $2)`,
		personaID, userID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("postgres persona exists: %w", err)
	}
	return exists, nil
}

var _ repository.PersonaRepository = (*PersonaRepository)(nil)
