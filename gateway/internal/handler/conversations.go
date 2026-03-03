package handler

import (
	"database/sql"
	"net/http"

	jikiv1 "github.com/jikime/jiki/gateway/gen/jiki/v1"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ConversationHandler provides REST endpoints for conversation management.
type ConversationHandler struct {
	db         *sql.DB
	grpcClient jikiv1.AgentServiceClient
}

// NewConversationHandler creates a ConversationHandler backed by db and grpcConn.
func NewConversationHandler(db *sql.DB, grpcConn *grpc.ClientConn) *ConversationHandler {
	return &ConversationHandler{
		db:         db,
		grpcClient: jikiv1.NewAgentServiceClient(grpcConn),
	}
}

type conversationRow struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Platform  string `json:"platform"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// List returns all conversations for a user, newest first.
// GET /api/v1/conversations?user_id=<uuid>
func (h *ConversationHandler) List(c echo.Context) error {
	userID := c.QueryParam("user_id")
	if userID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	rows, err := h.db.QueryContext(c.Request().Context(), `
		SELECT id, title, platform, created_at, updated_at
		FROM conversations
		WHERE user_id = $1
		ORDER BY updated_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("conversations: list query failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	conversations := make([]conversationRow, 0)
	for rows.Next() {
		var row conversationRow
		if err := rows.Scan(&row.ID, &row.Title, &row.Platform, &row.CreatedAt, &row.UpdatedAt); err != nil {
			continue
		}
		conversations = append(conversations, row)
	}

	return c.JSON(http.StatusOK, conversations)
}

// Create creates a new conversation for a user.
// POST /api/v1/conversations  Body: { "user_id": "...", "title": "..." }
func (h *ConversationHandler) Create(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		Title  string `json:"title"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.UserID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}
	if req.Title == "" {
		req.Title = "새 대화"
	}

	var row conversationRow
	err := h.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO conversations (user_id, title)
		VALUES ($1, $2)
		RETURNING id, title, platform, created_at, updated_at
	`, req.UserID, req.Title).Scan(&row.ID, &row.Title, &row.Platform, &row.CreatedAt, &row.UpdatedAt)
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("conversations: create failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "create failed"})
	}

	return c.JSON(http.StatusCreated, row)
}

// UpdateTitle updates the title of a conversation (auto-titled from first message).
// PATCH /api/v1/conversations/:id  Body: { "user_id": "...", "title": "..." }
func (h *ConversationHandler) UpdateTitle(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		UserID string `json:"user_id"`
		Title  string `json:"title"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
	}
	if req.UserID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "user_id is required"})
	}

	res, err := h.db.ExecContext(c.Request().Context(), `
		UPDATE conversations SET title = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
	`, req.Title, id, req.UserID)
	if err != nil {
		log.Error().Err(err).Str("id", id).Msg("conversations: update title failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}

	return c.JSON(http.StatusOK, map[string]string{"id": id, "title": req.Title})
}

// Messages fetches the conversation history from the agent via gRPC GetHistory.
// GET /api/v1/conversations/:id/messages
func (h *ConversationHandler) Messages(c echo.Context) error {
	convID := c.Param("id")
	if convID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "id is required"})
	}

	// Look up the actual LangGraph thread_id (may differ from conversation UUID for platform conversations).
	var threadID string
	err := h.db.QueryRowContext(c.Request().Context(),
		`SELECT thread_id FROM conversations WHERE id = $1`, convID,
	).Scan(&threadID)
	if err != nil {
		// Fallback: use the conversation ID directly.
		threadID = convID
	}

	resp, err := h.grpcClient.GetHistory(c.Request().Context(), &jikiv1.HistoryRequest{
		ThreadId: threadID,
	})
	if err != nil {
		log.Error().Err(err).Str("thread_id", threadID).Msg("conversations: GetHistory failed")
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "history unavailable"})
	}

	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	out := make([]msg, 0, len(resp.Messages))
	for _, m := range resp.Messages {
		out = append(out, msg{Role: m.Role, Content: m.Content})
	}
	return c.JSON(http.StatusOK, out)
}

// TouchUpdatedAt bumps updated_at so the conversation sorts to the top.
// Called internally after each message.
func TouchConversation(db *sql.DB, threadID string) {
	if db == nil {
		return
	}
	_, err := db.Exec(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, threadID)
	if err != nil {
		log.Warn().Err(err).Str("thread_id", threadID).Msg("conversations: touch failed")
	}
}
