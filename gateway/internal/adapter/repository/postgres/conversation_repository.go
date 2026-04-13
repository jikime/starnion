package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

type ConversationRepository struct {
	db *database.DB
}

func NewConversationRepository(db *database.DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func (r *ConversationRepository) List(ctx context.Context, userID uuid.UUID, before time.Time, limit int) ([]entity.Conversation, error) {
	var (
		rows pgx.Rows
		err  error
	)
	const cols = `SELECT c.id, c.user_id, c.title, c.platform, c.thread_id,
	                     COALESCE(c.persona_id::text, ''),
	                     COALESCE(p.name, ''),
	                     c.created_at, c.updated_at
	              FROM conversations c
	              LEFT JOIN personas p ON p.id = c.persona_id`
	if !before.IsZero() {
		rows, err = r.db.Pool().Query(ctx,
			cols+` WHERE c.user_id = $1 AND c.updated_at < $2
			        ORDER BY c.updated_at DESC LIMIT $3`,
			userID, before, limit+1,
		)
	} else {
		rows, err = r.db.Pool().Query(ctx,
			cols+` WHERE c.user_id = $1
			        ORDER BY c.updated_at DESC LIMIT $2`,
			userID, limit+1,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("postgres conv list: %w", err)
	}
	defer rows.Close()
	var out []entity.Conversation
	for rows.Next() {
		var c entity.Conversation
		if err := rows.Scan(&c.ID, &c.UserID, &c.Title, &c.Platform, &c.ThreadID,
			&c.PersonaID, &c.PersonaName, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("postgres conv list scan: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *ConversationRepository) Create(ctx context.Context, userID uuid.UUID, title, personaID string) (uuid.UUID, error) {
	id := uuid.New()
	var err error
	if personaID != "" {
		_, err = r.db.Pool().Exec(ctx,
			`INSERT INTO conversations (id, user_id, title, persona_id) VALUES ($1, $2, $3, $4)`,
			id, userID, title, personaID,
		)
	} else {
		_, err = r.db.Pool().Exec(ctx,
			`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)`,
			id, userID, title,
		)
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("postgres conv create: %w", err)
	}
	return id, nil
}

func (r *ConversationRepository) Patch(ctx context.Context, userID, convID uuid.UUID, patch repository.ConversationPatch) error {
	// Build the UPDATE dynamically. Title and PersonaID are independently
	// optional; both may be set in one request.
	var (
		setTitle, setPersona bool
		titleVal             string
		personaVal           any
	)
	if patch.Title != nil {
		setTitle = true
		titleVal = *patch.Title
	}
	if patch.PersonaID != nil {
		setPersona = true
		if *patch.PersonaID == "" {
			personaVal = nil
		} else {
			personaVal = *patch.PersonaID
		}
	}
	if !setTitle && !setPersona {
		return fmt.Errorf("%w: nothing to update", domain.ErrInvalidArgument)
	}

	var (
		res pgconn.CommandTag
		err error
	)
	switch {
	case setTitle && setPersona:
		res, err = r.db.Pool().Exec(ctx,
			`UPDATE conversations SET title = $1, persona_id = $2, updated_at = NOW()
			  WHERE id = $3 AND user_id = $4`,
			titleVal, personaVal, convID, userID)
	case setTitle:
		res, err = r.db.Pool().Exec(ctx,
			`UPDATE conversations SET title = $1, updated_at = NOW()
			  WHERE id = $2 AND user_id = $3`,
			titleVal, convID, userID)
	default: // only persona
		res, err = r.db.Pool().Exec(ctx,
			`UPDATE conversations SET persona_id = $1, updated_at = NOW()
			  WHERE id = $2 AND user_id = $3`,
			personaVal, convID, userID)
	}
	if err != nil {
		return fmt.Errorf("postgres conv patch: %w", err)
	}
	n := res.RowsAffected()
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *ConversationRepository) Get(ctx context.Context, userID, convID uuid.UUID) (*entity.Conversation, error) {
	var c entity.Conversation
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id, user_id, title, platform, thread_id, created_at, updated_at
		 FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	).Scan(&c.ID, &c.UserID, &c.Title, &c.Platform, &c.ThreadID, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("postgres conv get: %w", err)
	}
	return &c, nil
}

func (r *ConversationRepository) Delete(ctx context.Context, userID, convID uuid.UUID) error {
	res, err := r.db.Pool().Exec(ctx,
		`DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres conv delete: %w", err)
	}
	n := res.RowsAffected()
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *ConversationRepository) PersonaExistsForUser(ctx context.Context, userID uuid.UUID, personaID string) (bool, error) {
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

func (r *ConversationRepository) VerifyOwnership(ctx context.Context, userID, convID uuid.UUID) error {
	var ok int
	err := r.db.Pool().QueryRow(ctx,
		`SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres conv ownership: %w", err)
	}
	return nil
}

func (r *ConversationRepository) ListMessages(ctx context.Context, q repository.MessageQuery) ([]entity.Message, bool, string, error) {
	if err := r.VerifyOwnership(ctx, q.UserID, q.ConversationID); err != nil {
		return nil, false, "", err
	}
	const cols = `SELECT id, role, content, COALESCE(attachments, '[]'::jsonb), created_at,
	                     COALESCE(bot_name, ''), COALESCE(model_used, ''),
	                     COALESCE(input_tokens, 0), COALESCE(output_tokens, 0),
	                     COALESCE(context_tokens, 0), COALESCE(context_window, 0),
	                     COALESCE(tool_events, '[]'::jsonb)
	              FROM messages`

	var (
		rows pgx.Rows
		err  error
	)
	switch {
	case !q.Since.IsZero():
		rows, err = r.db.Pool().Query(ctx,
			cols+` WHERE conversation_id = $1 AND created_at > $2
			        ORDER BY created_at ASC LIMIT $3`,
			q.ConversationID, q.Since, q.Limit)
	case q.Before != uuid.Nil:
		rows, err = r.db.Pool().Query(ctx,
			cols+` WHERE conversation_id = $1
			          AND created_at < (SELECT created_at FROM messages WHERE id = $2 LIMIT 1)
			        ORDER BY created_at DESC LIMIT $3`,
			q.ConversationID, q.Before, q.Limit)
	default:
		rows, err = r.db.Pool().Query(ctx,
			cols+` WHERE conversation_id = $1
			        ORDER BY created_at DESC LIMIT $2`,
			q.ConversationID, q.Limit)
	}
	if err != nil {
		return nil, false, "", fmt.Errorf("postgres messages list: %w", err)
	}
	defer rows.Close()

	var out []entity.Message
	for rows.Next() {
		var m entity.Message
		var attachBytes, toolBytes []byte
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &attachBytes, &m.CreatedAt,
			&m.BotName, &m.ModelUsed, &m.InputTokens, &m.OutputTokens,
			&m.ContextTokens, &m.ContextWindow, &toolBytes); err != nil {
			return nil, false, "", fmt.Errorf("postgres messages scan: %w", err)
		}
		m.Attachments = json.RawMessage(attachBytes)
		m.ToolEvents = json.RawMessage(toolBytes)
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, false, "", err
	}

	// Pagination probe: if we hit the limit check whether older rows exist.
	hasMore := false
	nextCursor := ""
	if len(out) == q.Limit && q.Since.IsZero() {
		oldest := out[len(out)-1].ID // DESC order → last element is oldest
		if q.Before == uuid.Nil {
			// The descending scan makes out[0] newest and out[last] oldest.
		}
		var cnt int
		if err := r.db.Pool().QueryRow(ctx,
			`SELECT COUNT(*) FROM messages
			 WHERE conversation_id = $1
			   AND created_at < (SELECT created_at FROM messages WHERE id = $2 LIMIT 1)`,
			q.ConversationID, oldest,
		).Scan(&cnt); err == nil && cnt > 0 {
			hasMore = true
			nextCursor = oldest.String()
		}
	}
	return out, hasMore, nextCursor, nil
}

func (r *ConversationRepository) DeleteMessage(ctx context.Context, userID, convID, msgID uuid.UUID) error {
	res, err := r.db.Pool().Exec(ctx,
		`DELETE FROM messages
		  WHERE id = $1
		    AND conversation_id = $2
		    AND conversation_id IN (
		          SELECT id FROM conversations WHERE user_id = $3
		        )`,
		msgID, convID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres message delete: %w", err)
	}
	n := res.RowsAffected()
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ── agentchat pipeline support ────────────────────────────────────

func (r *ConversationRepository) Touch(ctx context.Context, convID uuid.UUID) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, convID,
	)
	if err != nil {
		return fmt.Errorf("postgres conv touch: %w", err)
	}
	return nil
}

func (r *ConversationRepository) AppendMessage(ctx context.Context, m repository.MessageInsert) (uuid.UUID, error) {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	// Two write shapes: with optional observability columns when the
	// caller supplies usage data (assistant messages from chat/
	// stream/ws/telegram), and the bare 5-column form when we just
	// need role+content+attachments (user messages, Telegram
	// inbound echoes).
	if m.BotName != "" || m.ModelUsed != "" || m.InputTokens > 0 || m.OutputTokens > 0 ||
		m.ContextTokens > 0 || m.ContextWindow > 0 || len(m.ToolEvents) > 0 {
		_, err := r.db.Pool().Exec(ctx,
			`INSERT INTO messages (id, conversation_id, role, content, attachments,
			                       bot_name, model_used,
			                       input_tokens, output_tokens, context_tokens, context_window,
			                       tool_events)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			m.ID, m.ConversationID, m.Role, m.Content, m.Attachments,
			nullIfEmpty(m.BotName), nullIfEmpty(m.ModelUsed),
			m.InputTokens, m.OutputTokens, m.ContextTokens, m.ContextWindow,
			m.ToolEvents,
		)
		if err != nil {
			return uuid.Nil, fmt.Errorf("postgres append message (observability): %w", err)
		}
		return m.ID, nil
	}
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO messages (id, conversation_id, role, content, attachments)
		 VALUES ($1, $2, $3, $4, $5)`,
		m.ID, m.ConversationID, m.Role, m.Content, m.Attachments,
	)
	if err != nil {
		return uuid.Nil, fmt.Errorf("postgres append message: %w", err)
	}
	return m.ID, nil
}

func (r *ConversationRepository) CreateWithThread(ctx context.Context, userID uuid.UUID, title, platform, threadID string) (uuid.UUID, error) {
	id := uuid.New()
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO conversations (id, user_id, title, platform, thread_id)
		 VALUES ($1, $2, $3, $4, $5)`,
		id, userID, title, platform, threadID,
	)
	if err != nil {
		return uuid.Nil, fmt.Errorf("postgres conv create with thread: %w", err)
	}
	return id, nil
}

func (r *ConversationRepository) FindLatestByThread(ctx context.Context, userID uuid.UUID, platform, threadID string) (uuid.UUID, bool, error) {
	var id uuid.UUID
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id FROM conversations
		 WHERE user_id = $1 AND platform = $2 AND thread_id = $3
		 ORDER BY created_at DESC LIMIT 1`,
		userID, platform, threadID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("postgres conv find by thread: %w", err)
	}
	return id, true, nil
}

func (r *ConversationRepository) UpdateTitle(ctx context.Context, convID uuid.UUID, title string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE conversations SET title = $1 WHERE id = $2`, title, convID,
	)
	if err != nil {
		return fmt.Errorf("postgres conv update title: %w", err)
	}
	return nil
}

func (r *ConversationRepository) ResolveOrCreate(ctx context.Context, userID uuid.UUID, threadID, title string) (uuid.UUID, error) {
	// Empty thread → fresh conversation.
	if threadID == "" {
		id := uuid.New()
		if _, err := r.db.Pool().Exec(ctx,
			`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)`,
			id, userID, title,
		); err != nil {
			return uuid.Nil, fmt.Errorf("postgres conv resolve-or-create (new): %w", err)
		}
		return id, nil
	}

	// Try to match an existing conversation owned by this user.
	var existing uuid.UUID
	err := r.db.Pool().QueryRow(ctx,
		`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
		threadID, userID,
	).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		// Invalid UUID cast, connection error, etc. — fall through
		// to the "create with supplied or fresh id" branch so the
		// caller still gets a usable conversation id.
	}

	// Not found — insert with the supplied UUID when it parses,
	// else a fresh one. ON CONFLICT DO NOTHING handles the race
	// where a concurrent request won the insert first.
	id := uuid.New()
	if parsed, pe := uuid.Parse(threadID); pe == nil {
		id = parsed
	}
	if _, err := r.db.Pool().Exec(ctx,
		`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
		id, userID, title,
	); err != nil {
		return uuid.Nil, fmt.Errorf("postgres conv resolve-or-create (insert): %w", err)
	}
	return id, nil
}

// nullIfEmpty returns a *string (nil when `s` is empty) so Postgres
// stores NULL in nullable text columns instead of the empty string.
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

var _ repository.ConversationRepository = (*ConversationRepository)(nil)
