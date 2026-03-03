package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// MessageHandler provides paginated REST endpoints for conversation messages.
type MessageHandler struct {
	db         *sql.DB
	grpcClient jikiv1.AgentServiceClient
}

// NewMessageHandler creates a MessageHandler backed by db and grpcConn.
func NewMessageHandler(db *sql.DB, grpcConn *grpc.ClientConn) *MessageHandler {
	return &MessageHandler{
		db:         db,
		grpcClient: jikiv1.NewAgentServiceClient(grpcConn),
	}
}

type messageRow struct {
	ID          string          `json:"id"`
	Role        string          `json:"role"`
	Content     string          `json:"content"`
	CreatedAt   string          `json:"created_at"`
	Attachments json.RawMessage `json:"attachments,omitempty"`
}

// List returns paginated messages for a conversation (cursor-based, newest-first pages).
// GET /api/v1/conversations/:id/messages?user_id=<uuid>&before=<uuid>&limit=30
//
// Response: { "messages": [...], "has_more": bool, "next_cursor": "<uuid>"|null }
// Messages are returned in chronological order (oldest first within the page).
func (h *MessageHandler) List(c echo.Context) error {
	convID := c.Param("id")
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	before := c.QueryParam("before") // empty = latest page

	limit := 30
	if l := c.QueryParam("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	ctx := c.Request().Context()

	// Verify the conversation belongs to the requesting user.
	var ownerID string
	err := h.db.QueryRowContext(ctx,
		`SELECT user_id FROM conversations WHERE id = $1::uuid`, convID,
	).Scan(&ownerID)
	if err != nil || ownerID != userID {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "conversation not found"})
	}

	// Lazy seed: if the messages table has no rows for this conversation,
	// populate it from LangGraph history once.
	if before == "" {
		var count int
		_ = h.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM messages WHERE conversation_id = $1::uuid`, convID,
		).Scan(&count)
		if count == 0 {
			h.seedFromHistory(ctx, convID)
		}
	}

	// Fetch limit+1 rows to determine has_more.
	var rows *sql.Rows

	if before == "" {
		// Latest page: most recent `limit+1` messages.
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, role, content, created_at, attachments
			FROM messages
			WHERE conversation_id = $1::uuid
			ORDER BY created_at DESC
			LIMIT $2
		`, convID, limit+1)
	} else {
		// Older page: messages older than the cursor message's created_at.
		rows, err = h.db.QueryContext(ctx, `
			SELECT id, role, content, created_at, attachments
			FROM messages
			WHERE conversation_id = $1::uuid
			  AND created_at < (
			      SELECT created_at FROM messages WHERE id = $2::uuid
			  )
			ORDER BY created_at DESC
			LIMIT $3
		`, convID, before, limit+1)
	}
	if err != nil {
		log.Error().Err(err).Str("conversation_id", convID).Msg("messages: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	msgs := make([]messageRow, 0, limit)
	for rows.Next() {
		var m messageRow
		var att []byte
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt, &att); err != nil {
			continue
		}
		if len(att) > 0 {
			m.Attachments = json.RawMessage(att)
		}
		msgs = append(msgs, m)
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}

	// Reverse to chronological order (oldest first) for display.
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	var nextCursor *string
	if hasMore && len(msgs) > 0 {
		id := msgs[0].ID
		nextCursor = &id
	}

	return c.JSON(http.StatusOK, map[string]any{
		"messages":    msgs,
		"has_more":    hasMore,
		"next_cursor": nextCursor,
	})
}

// seedFromHistory fetches messages from LangGraph and inserts them into the messages table.
func (h *MessageHandler) seedFromHistory(ctx context.Context, convID string) {
	var threadID string
	err := h.db.QueryRowContext(ctx,
		`SELECT thread_id FROM conversations WHERE id = $1::uuid`, convID,
	).Scan(&threadID)
	if err != nil {
		// Fallback: use convID as thread_id.
		threadID = convID
	}

	resp, err := h.grpcClient.GetHistory(ctx, &jikiv1.HistoryRequest{ThreadId: threadID})
	if err != nil || len(resp.Messages) == 0 {
		return
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		log.Warn().Err(err).Str("conversation_id", convID).Msg("messages: seed tx begin failed")
		return
	}

	// Use sequential 1ms offsets so ORDER BY created_at preserves LangGraph order.
	for i, msg := range resp.Messages {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO messages (conversation_id, role, content, created_at)
			VALUES ($1::uuid, $2, $3, NOW() + ($4 * interval '1 millisecond'))
		`, convID, msg.Role, msg.Content, i)
		if err != nil {
			_ = tx.Rollback()
			log.Warn().Err(err).Str("conversation_id", convID).Msg("messages: seed insert failed")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Warn().Err(err).Str("conversation_id", convID).Msg("messages: seed commit failed")
	}
}
