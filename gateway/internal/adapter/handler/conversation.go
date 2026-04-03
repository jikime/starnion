package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

type ConversationHandler struct {
	db     *database.DB
	config *config.Config
	logger *zap.Logger
}

func NewConversationHandler(db *database.DB, cfg *config.Config, logger *zap.Logger) *ConversationHandler {
	return &ConversationHandler{db: db, config: cfg, logger: logger}
}

// GET /api/v1/conversations?before=<cursor>&limit=50
// Returns {conversations: [...], has_more: bool, next_cursor: string}
// Cursor is the updated_at (RFC3339Nano) of the oldest item on the current page.
func (h *ConversationHandler) List(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	const pageSize = 50

	before := c.QueryParam("before")
	var sqlQuery string
	var args []any
	if before != "" {
		beforeTime, parseErr := time.Parse(time.RFC3339Nano, before)
		if parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid cursor"})
		}
		sqlQuery = `SELECT c.id, c.title, c.platform, c.thread_id,
		             COALESCE(c.persona_id::text, '') AS persona_id,
		             COALESCE(p.name, '') AS persona_name,
		             c.created_at, c.updated_at
		        FROM conversations c
		        LEFT JOIN personas p ON p.id = c.persona_id
		       WHERE c.user_id = $1 AND c.updated_at < $2
		       ORDER BY c.updated_at DESC LIMIT $3`
		args = []any{userID, beforeTime, pageSize + 1}
	} else {
		sqlQuery = `SELECT c.id, c.title, c.platform, c.thread_id,
		             COALESCE(c.persona_id::text, '') AS persona_id,
		             COALESCE(p.name, '') AS persona_name,
		             c.created_at, c.updated_at
		        FROM conversations c
		        LEFT JOIN personas p ON p.id = c.persona_id
		       WHERE c.user_id = $1
		       ORDER BY c.updated_at DESC LIMIT $2`
		args = []any{userID, pageSize + 1}
	}

	rows, err := h.db.QueryContext(c.Request().Context(), sqlQuery, args...)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch conversations"})
	}
	defer rows.Close()

	var convs []map[string]any
	for rows.Next() {
		var id, title, platform, threadID string
		var personaID, personaName string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &title, &platform, &threadID, &personaID, &personaName, &createdAt, &updatedAt); err != nil {
			continue
		}
		convs = append(convs, map[string]any{
			"id":           id,
			"title":        title,
			"platform":     platform,
			"thread_id":    threadID,
			"persona_id":   personaID,
			"persona_name": personaName,
			"created_at":   createdAt,
			"updated_at":   updatedAt,
		})
	}
	if err := rows.Err(); err != nil {
		h.logger.Warn("rows iteration error in List conversations", zap.Error(err))
	}

	// Trim the extra sentinel row and determine whether more pages exist.
	hasMore := len(convs) > pageSize
	if hasMore {
		convs = convs[:pageSize]
	}

	nextCursor := ""
	if hasMore && len(convs) > 0 {
		lastUpdated := convs[len(convs)-1]["updated_at"].(time.Time)
		nextCursor = lastUpdated.UTC().Format(time.RFC3339Nano)
	}

	if convs == nil {
		convs = []map[string]any{}
	}
	return c.JSON(http.StatusOK, map[string]any{
		"conversations": convs,
		"has_more":      hasMore,
		"next_cursor":   nextCursor,
	})
}

// POST /api/v1/conversations
func (h *ConversationHandler) Create(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req struct {
		Title     string `json:"title"`
		PersonaID string `json:"persona_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Title == "" {
		req.Title = "새 대화"
	}
	if len(req.Title) > 200 {
		req.Title = req.Title[:200]
	}

	// Validate persona_id belongs to the current user.
	if req.PersonaID != "" {
		if _, parseErr := uuid.Parse(req.PersonaID); parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid persona_id"})
		}
		var exists bool
		if err := h.db.QueryRowContext(c.Request().Context(),
			`SELECT EXISTS(SELECT 1 FROM personas WHERE id = $1 AND user_id = $2)`,
			req.PersonaID, userID,
		).Scan(&exists); err != nil || !exists {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "persona not found"})
		}
	}

	id := uuid.New()
	if req.PersonaID != "" {
		_, err = h.db.ExecContext(c.Request().Context(),
			`INSERT INTO conversations (id, user_id, title, persona_id) VALUES ($1, $2, $3, $4)`,
			id, userID, req.Title, req.PersonaID,
		)
	} else {
		_, err = h.db.ExecContext(c.Request().Context(),
			`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)`,
			id, userID, req.Title,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create conversation"})
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":         id.String(),
		"title":      req.Title,
		"persona_id": req.PersonaID,
	})
}

// PATCH /api/v1/conversations/:id
func (h *ConversationHandler) Patch(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	convID := c.Param("id")
	if _, err := uuid.Parse(convID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	var req struct {
		Title     *string `json:"title"`
		PersonaID *string `json:"persona_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	ctx := c.Request().Context()

	if req.Title != nil && len(*req.Title) > 200 {
		trimmed := (*req.Title)[:200]
		req.Title = &trimmed
	}

	if req.Title != nil && req.PersonaID != nil {
		var personaIDVal any
		if *req.PersonaID == "" {
			personaIDVal = nil
		} else {
			personaIDVal = *req.PersonaID
		}
		_, err = h.db.ExecContext(ctx,
			`UPDATE conversations SET title = $1, persona_id = $2, updated_at = NOW()
			 WHERE id = $3 AND user_id = $4`,
			*req.Title, personaIDVal, convID, userID,
		)
	} else if req.Title != nil {
		_, err = h.db.ExecContext(ctx,
			`UPDATE conversations SET title = $1, updated_at = NOW()
			 WHERE id = $2 AND user_id = $3`,
			*req.Title, convID, userID,
		)
	} else if req.PersonaID != nil {
		var personaIDVal any
		if *req.PersonaID == "" {
			personaIDVal = nil
		} else {
			personaIDVal = *req.PersonaID
		}
		_, err = h.db.ExecContext(ctx,
			`UPDATE conversations SET persona_id = $1, updated_at = NOW()
			 WHERE id = $2 AND user_id = $3`,
			personaIDVal, convID, userID,
		)
	} else {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "nothing to update"})
	}

	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update conversation"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

// GET /api/v1/conversations/:id
func (h *ConversationHandler) Get(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	convID := c.Param("id")
	if _, err := uuid.Parse(convID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	var id, title, platform string
	var createdAt, updatedAt time.Time
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT id, title, platform, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	).Scan(&id, &title, &platform, &createdAt, &updatedAt)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "conversation not found"})
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":         id,
		"title":      title,
		"platform":   platform,
		"created_at": createdAt,
		"updated_at": updatedAt,
	})
}

// DELETE /api/v1/conversations/:id
func (h *ConversationHandler) Delete(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	convID := c.Param("id")
	if _, err := uuid.Parse(convID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	_, err = h.db.ExecContext(c.Request().Context(),
		`DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete conversation"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /api/v1/conversations/:id/messages?limit=30&before=<cursor>
func (h *ConversationHandler) ListMessages(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	convID := c.Param("id")
	if _, err := uuid.Parse(convID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}

	// Verify ownership.
	var ownerCheck int
	err = h.db.QueryRowContext(c.Request().Context(),
		`SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2`,
		convID, userID,
	).Scan(&ownerCheck)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "conversation not found"})
	}

	limit := 30
	if lstr := c.QueryParam("limit"); lstr != "" {
		if l, e := strconv.Atoi(lstr); e == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	before := c.QueryParam("before") // message UUID cursor (older messages)
	if before != "" {
		if _, parseErr := uuid.Parse(before); parseErr != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid cursor"})
		}
	}
	since := c.QueryParam("since") // ISO timestamp — return messages newer than this

	const selectCols = `SELECT id, role, content, attachments, created_at,
		        COALESCE(bot_name, ''),   COALESCE(model_used, ''),
		        COALESCE(input_tokens, 0), COALESCE(output_tokens, 0),
		        COALESCE(context_tokens, 0), COALESCE(context_window, 0),
		        tool_events
		 FROM messages`

	var rows interface{ Close() error }
	if since != "" {
		// Polling mode — return messages newer than the given timestamp.
		rows, err = h.db.QueryContext(c.Request().Context(),
			selectCols+`
			 WHERE conversation_id = $1 AND created_at > $2
			 ORDER BY created_at ASC
			 LIMIT $3`,
			convID, since, limit,
		)
	} else if before != "" {
		// Cursor-based pagination — return messages older than the cursor.
		rows, err = h.db.QueryContext(c.Request().Context(),
			selectCols+`
			 WHERE conversation_id = $1
			   AND created_at < (SELECT created_at FROM messages WHERE id = $2 LIMIT 1)
			 ORDER BY created_at DESC
			 LIMIT $3`,
			convID, before, limit,
		)
	} else {
		rows, err = h.db.QueryContext(c.Request().Context(),
			selectCols+`
			 WHERE conversation_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2`,
			convID, limit,
		)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch messages"})
	}
	defer rows.Close()

	type msgRow interface {
		Next() bool
		Scan(dest ...any) error
	}
	dbRows := rows.(msgRow)

	var msgs []map[string]any
	for dbRows.Next() {
		var id, role, content, botName, modelUsed string
		var attachmentsRaw, toolEventsRaw []byte
		var createdAt time.Time
		var inputTokens, outputTokens, contextTokens, contextWindow int
		if err := dbRows.Scan(&id, &role, &content, &attachmentsRaw, &createdAt, &botName, &modelUsed, &inputTokens, &outputTokens, &contextTokens, &contextWindow, &toolEventsRaw); err != nil {
			continue
		}
		m := map[string]any{
			"id":         id,
			"role":       role,
			"content":    content,
			"created_at": createdAt,
		}
		if len(attachmentsRaw) > 0 {
			m["attachments"] = json.RawMessage(attachmentsRaw)
		}
		// Only include metadata on assistant messages.
		if role == "assistant" {
			if botName != "" {
				m["bot_name"] = botName
			}
			if modelUsed != "" {
				m["model_used"] = modelUsed
			}
			m["input_tokens"] = inputTokens
			m["output_tokens"] = outputTokens
			if contextTokens > 0 {
				m["context_tokens"] = contextTokens
			}
			if contextWindow > 0 {
				m["context_window"] = contextWindow
			}
			if len(toolEventsRaw) > 0 {
				m["tool_events"] = string(toolEventsRaw)
			}
		}
		msgs = append(msgs, m)
	}
	if msgs == nil {
		msgs = []map[string]any{}
	}

	// Reverse so messages are chronological (we queried DESC).
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	// Check if there are more messages.
	hasMore := false
	nextCursor := ""
	if len(msgs) == limit {
		oldest := msgs[0]["id"].(string)
		var moreCount int
		h.db.QueryRowContext(c.Request().Context(),
			`SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND created_at < (SELECT created_at FROM messages WHERE id = $2 LIMIT 1)`,
			convID, oldest,
		).Scan(&moreCount)
		if moreCount > 0 {
			hasMore = true
			nextCursor = oldest
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"messages":    msgs,
		"has_more":    hasMore,
		"next_cursor": nextCursor,
	})
}

// DELETE /api/v1/conversations/:id/messages/:msgId
func (h *ConversationHandler) DeleteMessage(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	convID := c.Param("id")
	msgID := c.Param("msgId")

	if _, err := uuid.Parse(msgID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid message id"})
	}

	ctx := c.Request().Context()
	result, err := h.db.ExecContext(ctx,
		`DELETE FROM messages
		  WHERE id = $1
		    AND conversation_id = $2
		    AND conversation_id IN (
		          SELECT id FROM conversations WHERE user_id = $3
		        )`,
		msgID, convID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "message not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
