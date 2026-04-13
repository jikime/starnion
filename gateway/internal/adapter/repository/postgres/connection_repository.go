// Package postgres — connection_repository.go persists the Connect
// aggregate. Nullable columns are scanned into pgtype wrappers and
// converted to entity pointers so the usecase + handler layers can
// marshal `null` directly to JSON without null-string sentinels.
//
// JSONB columns (`social_profiles`, `business_card`) round-trip through
// []byte to decouple the domain shapes from any pgx codec gymnastics.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type ConnectionRepository struct {
	db *database.DB
}

func NewConnectionRepository(db *database.DB) *ConnectionRepository {
	return &ConnectionRepository{db: db}
}

// allowedSortSQL maps whitelisted sort tokens to the exact ORDER BY
// clause used by the list query. The usecase layer validates the token
// before this map is consulted; an unknown key falls through to the
// default (score_desc).
var allowedSortSQL = map[string]string{
	"score_desc":        `connection_score DESC, name ASC`,
	"name_asc":          `name ASC`,
	"last_contact_desc": `last_contact_at DESC NULLS LAST, name ASC`,
	"last_contact_asc":  `last_contact_at ASC NULLS LAST, name ASC`,
	"created_desc":      `created_at DESC`,
}

const connectionSelectCols = `
    id, user_id, name, role, company, category, email, phone, birthday,
    meeting_location, group_key, tags, context_notes, last_contact_at,
    contact_frequency_target, connection_score, business_card,
    social_profiles, created_at, updated_at`

// Create inserts a new connection row.
func (r *ConnectionRepository) Create(ctx context.Context, c *entity.Connection) error {
	spJSON, err := marshalSocialProfiles(c.SocialProfiles)
	if err != nil {
		return err
	}
	bcJSON, err := marshalBusinessCard(c.BusinessCard)
	if err != nil {
		return err
	}
	tags := c.Tags
	if tags == nil {
		tags = []string{}
	}

	_, err = r.db.Pool().Exec(ctx, `
        INSERT INTO connections (
            id, user_id, name, role, company, category, email, phone,
            birthday, meeting_location, group_key, tags, context_notes,
            last_contact_at, contact_frequency_target, connection_score,
            business_card, social_profiles
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16,
            $17, $18
        )`,
		c.ID, c.UserID, c.Name,
		textPtrToPgtype(c.Role), textPtrToPgtype(c.Company),
		string(c.Category),
		textPtrToPgtype(c.Email), textPtrToPgtype(c.Phone),
		datePtrToPgtype(c.Birthday),
		textPtrToPgtype(c.MeetingLocation), textPtrToPgtype(c.GroupKey),
		tags, c.ContextNotes,
		timePtrToPgtype(c.LastContactAt),
		c.ContactFrequencyTarget, c.ConnectionScore,
		bcJSON, spJSON,
	)
	if err != nil {
		return fmt.Errorf("postgres connection create: %w", err)
	}
	return nil
}

// GetByID returns a single connection, scoped to the caller.
func (r *ConnectionRepository) GetByID(ctx context.Context, userID, id uuid.UUID) (entity.Connection, error) {
	row := r.db.Pool().QueryRow(ctx,
		`SELECT `+connectionSelectCols+` FROM connections WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	c, err := scanConnection(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.Connection{}, domain.ErrNotFound
	}
	if err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection get: %w", err)
	}
	return c, nil
}

// List returns the filtered page + total count.
func (r *ConnectionRepository) List(ctx context.Context, userID uuid.UUID, filter entity.ConnectionListFilter) (entity.ConnectionListResult, error) {
	args := []any{userID}
	where := []string{`user_id = $1`}

	if len(filter.Categories) > 0 {
		cats := make([]string, 0, len(filter.Categories))
		for _, cat := range filter.Categories {
			cats = append(cats, string(cat))
		}
		args = append(args, cats)
		where = append(where, fmt.Sprintf(`category = ANY($%d)`, len(args)))
	}
	if q := strings.TrimSpace(filter.Query); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf(`name ILIKE $%d`, len(args)))
	}

	whereSQL := strings.Join(where, " AND ")

	// Total count for the paginator. Single query against the same
	// WHERE clause so the envelope's `total` reflects the filter.
	var total int
	if err := r.db.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM connections WHERE `+whereSQL, args...,
	).Scan(&total); err != nil {
		return entity.ConnectionListResult{}, fmt.Errorf("postgres connection list count: %w", err)
	}

	orderBy, ok := allowedSortSQL[filter.Sort]
	if !ok {
		orderBy = allowedSortSQL["score_desc"]
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	args = append(args, limit, offset)
	limitIdx := len(args) - 1
	offsetIdx := len(args)

	rows, err := r.db.Pool().Query(ctx,
		`SELECT `+connectionSelectCols+` FROM connections WHERE `+whereSQL+
			` ORDER BY `+orderBy+
			fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitIdx, offsetIdx),
		args...,
	)
	if err != nil {
		return entity.ConnectionListResult{}, fmt.Errorf("postgres connection list: %w", err)
	}
	defer rows.Close()

	items := make([]entity.Connection, 0, limit)
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			return entity.ConnectionListResult{}, fmt.Errorf("postgres connection list scan: %w", err)
		}
		items = append(items, c)
	}
	if err := rows.Err(); err != nil {
		return entity.ConnectionListResult{}, fmt.Errorf("postgres connection list rows: %w", err)
	}

	return entity.ConnectionListResult{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

// Update rewrites every mutable column on the row.
func (r *ConnectionRepository) Update(ctx context.Context, c *entity.Connection) error {
	spJSON, err := marshalSocialProfiles(c.SocialProfiles)
	if err != nil {
		return err
	}
	bcJSON, err := marshalBusinessCard(c.BusinessCard)
	if err != nil {
		return err
	}
	tags := c.Tags
	if tags == nil {
		tags = []string{}
	}

	tag, err := r.db.Pool().Exec(ctx, `
        UPDATE connections SET
            name = $3,
            role = $4,
            company = $5,
            category = $6,
            email = $7,
            phone = $8,
            birthday = $9,
            meeting_location = $10,
            group_key = $11,
            tags = $12,
            context_notes = $13,
            last_contact_at = $14,
            contact_frequency_target = $15,
            connection_score = $16,
            business_card = $17,
            social_profiles = $18
        WHERE id = $1 AND user_id = $2`,
		c.ID, c.UserID, c.Name,
		textPtrToPgtype(c.Role), textPtrToPgtype(c.Company),
		string(c.Category),
		textPtrToPgtype(c.Email), textPtrToPgtype(c.Phone),
		datePtrToPgtype(c.Birthday),
		textPtrToPgtype(c.MeetingLocation), textPtrToPgtype(c.GroupKey),
		tags, c.ContextNotes,
		timePtrToPgtype(c.LastContactAt),
		c.ContactFrequencyTarget, c.ConnectionScore,
		bcJSON, spJSON,
	)
	if err != nil {
		return fmt.Errorf("postgres connection update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Delete removes the connection row; FK cascades activities.
func (r *ConnectionRepository) Delete(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := r.db.Pool().Exec(ctx,
		`DELETE FROM connections WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres connection delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Touch inserts a manual activity row and monotonically advances
// last_contact_at. Both operations run in one transaction.
func (r *ConnectionRepository) Touch(ctx context.Context, userID, id uuid.UUID, occurredAt time.Time, note string, durationMin int) (entity.Connection, error) {
	tx, err := r.db.Pool().Begin(ctx)
	if err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection touch begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Monotonic advance: GREATEST(COALESCE(last_contact_at,'-infinity'),$1).
	// The UPDATE is gated by user_id so cross-tenant access is impossible
	// regardless of the supplied id.
	tag, err := tx.Exec(ctx, `
        UPDATE connections
           SET last_contact_at = GREATEST(COALESCE(last_contact_at, '-infinity'::timestamptz), $1)
         WHERE id = $2 AND user_id = $3`,
		occurredAt, id, userID,
	)
	if err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection touch update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return entity.Connection{}, domain.ErrNotFound
	}

	var notePg pgtype.Text
	if note != "" {
		notePg = pgtype.Text{String: note, Valid: true}
	}
	if _, err := tx.Exec(ctx, `
        INSERT INTO connection_activities
            (user_id, connection_id, kind, occurred_at, duration_min, weight, note)
        VALUES ($1, $2, 'manual', $3, $4, 1, $5)`,
		userID, id, occurredAt, durationMin, notePg,
	); err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection touch insert: %w", err)
	}

	row := tx.QueryRow(ctx,
		`SELECT `+connectionSelectCols+` FROM connections WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	c, err := scanConnection(row)
	if err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection touch reload: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return entity.Connection{}, fmt.Errorf("postgres connection touch commit: %w", err)
	}
	return c, nil
}

// ── helpers ───────────────────────────────────────────────────────

// scannable abstracts over pgx.Row and pgx.Rows so scanConnection can
// be reused for both single-row and multi-row queries.
type scannable interface {
	Scan(dest ...any) error
}

func scanConnection(row scannable) (entity.Connection, error) {
	var (
		c        entity.Connection
		role     pgtype.Text
		company  pgtype.Text
		category string
		email    pgtype.Text
		phone    pgtype.Text
		birthday pgtype.Date
		meetLoc  pgtype.Text
		groupKey pgtype.Text
		lastAt   pgtype.Timestamptz
		bcJSON   []byte
		spJSON   []byte
	)
	err := row.Scan(
		&c.ID, &c.UserID, &c.Name,
		&role, &company, &category,
		&email, &phone, &birthday,
		&meetLoc, &groupKey,
		&c.Tags, &c.ContextNotes,
		&lastAt,
		&c.ContactFrequencyTarget, &c.ConnectionScore,
		&bcJSON, &spJSON,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return entity.Connection{}, err
	}
	c.Role = pgtypeToStringPtr(role)
	c.Company = pgtypeToStringPtr(company)
	c.Category = entity.ConnectionCategory(category)
	c.Email = pgtypeToStringPtr(email)
	c.Phone = pgtypeToStringPtr(phone)
	if birthday.Valid {
		t := birthday.Time
		c.Birthday = &t
	}
	c.MeetingLocation = pgtypeToStringPtr(meetLoc)
	c.GroupKey = pgtypeToStringPtr(groupKey)
	if lastAt.Valid {
		t := lastAt.Time
		c.LastContactAt = &t
	}
	if c.Tags == nil {
		c.Tags = []string{}
	}
	c.SocialProfiles = entity.SocialProfiles{}
	if len(spJSON) > 0 {
		if err := json.Unmarshal(spJSON, &c.SocialProfiles); err != nil {
			return entity.Connection{}, fmt.Errorf("postgres connection social unmarshal: %w", err)
		}
		if c.SocialProfiles == nil {
			c.SocialProfiles = entity.SocialProfiles{}
		}
	}
	if len(bcJSON) > 0 && string(bcJSON) != "null" {
		var bc entity.BusinessCard
		if err := json.Unmarshal(bcJSON, &bc); err != nil {
			return entity.Connection{}, fmt.Errorf("postgres connection business_card unmarshal: %w", err)
		}
		c.BusinessCard = &bc
	}
	return c, nil
}

func marshalSocialProfiles(sp entity.SocialProfiles) ([]byte, error) {
	if sp == nil {
		return []byte(`{}`), nil
	}
	b, err := json.Marshal(sp)
	if err != nil {
		return nil, fmt.Errorf("postgres connection social marshal: %w", err)
	}
	return b, nil
}

func marshalBusinessCard(bc *entity.BusinessCard) ([]byte, error) {
	if bc == nil {
		return nil, nil
	}
	b, err := json.Marshal(bc)
	if err != nil {
		return nil, fmt.Errorf("postgres connection business_card marshal: %w", err)
	}
	return b, nil
}

func textPtrToPgtype(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func pgtypeToStringPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}

func datePtrToPgtype(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}

func timePtrToPgtype(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.ConnectionRepository = (*ConnectionRepository)(nil)
