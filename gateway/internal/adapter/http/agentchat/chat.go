package agentchat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/adapter/http/httpauth"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/domain"
	"github.com/newstarnion/gateway/internal/infrastructure/chatctx"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	conversationusecase "github.com/newstarnion/gateway/internal/usecase/conversation"
	"go.uber.org/zap"
)

// maxSSEUserConcurrentRuns mirrors the WebSocket per-user limit: a single user
// cannot open more than 5 concurrent SSE streams.
const maxSSEUserConcurrentRuns = 5

// maxSSEGlobalConcurrentRuns caps total concurrent SSE streams across all users.
const maxSSEGlobalConcurrentRuns = 100

type ChatHandler struct {
	db          *database.DB
	config      *config.Config
	agentClient *agentgrpc.AgentClient
	logger      *zap.Logger
	// convUC is the shared conversation usecase. It owns schema
	// knowledge for the conversations + messages tables so this
	// handler no longer has to embed raw SQL for the webhook + SSE
	// pipelines.
	convUC *conversationusecase.UseCase
	// userRunCounts maps userID → *int32 tracking concurrent SSE stream count per user.
	userRunCounts sync.Map
	// globalRunCount tracks total concurrent SSE streams server-wide.
	globalRunCount int32
}

func NewChatHandler(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, convUC *conversationusecase.UseCase, logger *zap.Logger) *ChatHandler {
	return &ChatHandler{
		db:          db,
		config:      cfg,
		agentClient: agentClient,
		convUC:      convUC,
		logger:      logger,
	}
}

func (h *ChatHandler) ListSessions(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	rows, err := h.db.Pool().Query(c.Request().Context(),
		`SELECT id, title, model, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
		userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch sessions"})
	}
	defer rows.Close()

	var sessions []map[string]any
	for rows.Next() {
		var id, model string
		var title *string
		var createdAt, updatedAt string

		if err := rows.Scan(&id, &title, &model, &createdAt, &updatedAt); err != nil {
			h.logger.Warn("failed to scan session row", zap.Error(err))
			continue
		}
		sessions = append(sessions, map[string]any{
			"id":         id,
			"title":      title,
			"model":      model,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}
	if err := rows.Err(); err != nil {
		h.logger.Error("rows iteration error in ListSessions", zap.Error(err))
	}

	if sessions == nil {
		sessions = []map[string]any{}
	}

	return c.JSON(http.StatusOK, map[string]any{"sessions": sessions})
}

type CreateSessionRequest struct {
	Title *string `json:"title"`
	Model string  `json:"model"`
}

func (h *ChatHandler) CreateSession(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	var req CreateSessionRequest
	if err := c.Bind(&req); err != nil {
		req = CreateSessionRequest{Model: h.config.ModelDefaults.Chat}
	}
	if req.Title != nil && len(*req.Title) > 200 {
		trimmed := (*req.Title)[:200]
		req.Title = &trimmed
	}
	if len(req.Model) > 200 {
		req.Model = req.Model[:200]
	}
	if req.Model == "" {
		// Check model_assignments['chat'] before falling back to configured default.
		if assigned := chatctx.ResolveAssignedModel(c.Request().Context(), h.db, userID, "chat"); assigned != "" {
			req.Model = assigned
		} else {
			req.Model = h.config.ModelDefaults.Chat
		}
	}

	sessionID := uuid.New()
	_, err = h.db.Pool().Exec(c.Request().Context(),
		`INSERT INTO chat_sessions (id, user_id, title, model) VALUES ($1, $2, $3, $4)`,
		sessionID, userID, req.Title, req.Model,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":    sessionID.String(),
		"model": req.Model,
		"title": req.Title,
	})
}

func (h *ChatHandler) GetSession(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	sessionID := c.Param("id")
	if _, err := uuid.Parse(sessionID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid session id"})
	}

	var result struct {
		ID    string  `json:"id"`
		Title *string `json:"title"`
		Model string  `json:"model"`
	}

	err = h.db.Pool().QueryRow(c.Request().Context(),
		`SELECT id, title, model FROM chat_sessions WHERE id = $1 AND user_id = $2`,
		sessionID, userID,
	).Scan(&result.ID, &result.Title, &result.Model)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}

	return c.JSON(http.StatusOK, result)
}

func (h *ChatHandler) DeleteSession(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	sessionID := c.Param("id")
	if _, err := uuid.Parse(sessionID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid session id"})
	}
	_, err = h.db.Pool().Exec(c.Request().Context(),
		`DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`,
		sessionID, userID,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete session"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *ChatHandler) ListMessages(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	sessionID := c.Param("id")
	if _, err := uuid.Parse(sessionID); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid session id"})
	}

	var exists bool
	err = h.db.Pool().QueryRow(c.Request().Context(),
		`SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE id = $1 AND user_id = $2)`,
		sessionID, userID,
	).Scan(&exists)
	if err != nil || !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}

	limit := 500
	if lStr := c.QueryParam("limit"); lStr != "" {
		if n, err2 := strconv.Atoi(lStr); err2 == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	rows, err := h.db.Pool().Query(c.Request().Context(),
		`SELECT id, role, content, tool_name, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2`,
		sessionID, limit,
	)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch messages"})
	}
	defer rows.Close()

	var messages []map[string]any
	for rows.Next() {
		var id, role, content, createdAt string
		var toolName *string

		if err := rows.Scan(&id, &role, &content, &toolName, &createdAt); err != nil {
			continue
		}
		messages = append(messages, map[string]any{
			"id":         id,
			"role":       role,
			"content":    content,
			"tool_name":  toolName,
			"created_at": createdAt,
		})
	}

	if messages == nil {
		messages = []map[string]any{}
	}

	return c.JSON(http.StatusOK, map[string]any{"messages": messages})
}

// DeleteMessage deletes a single message from a conversation owned by the user.
func (h *ChatHandler) DeleteMessage(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	convIDStr := c.Param("id")
	msgIDStr := c.Param("msgId")

	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid conversation id"})
	}
	msgID, err := uuid.Parse(msgIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid message id"})
	}

	if err := h.convUC.DeleteMessage(c.Request().Context(), userID, convID, msgID); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "message not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "delete failed"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

type ChatRequest struct {
	Message string `json:"message" validate:"required"`
	Model   string `json:"model"`
}

// writeSSE writes one SSE data line and flushes.
func writeSSE(w http.ResponseWriter, flusher http.Flusher, payload any) {
	b, _ := json.Marshal(payload)
	fmt.Fprintf(w, "data: %s\n\n", b)
	flusher.Flush()
}

func (h *ChatHandler) Chat(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	sessionID := c.Param("id")

	// Verify session ownership
	var model string
	err = h.db.Pool().QueryRow(c.Request().Context(),
		`SELECT model FROM chat_sessions WHERE id = $1 AND user_id = $2`,
		sessionID, userID,
	).Scan(&model)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}

	var req ChatRequest
	if err := c.Bind(&req); err != nil || req.Message == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "message is required"})
	}
	if len(req.Message) > 32000 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "message too long (max 32000 characters)"})
	}
	if len(req.Model) > 200 {
		req.Model = req.Model[:200]
	}
	if req.Model != "" {
		model = req.Model
	}

	// Set SSE headers
	c.Response().Header().Set(echo.HeaderContentType, "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	flusher, ok := c.Response().Writer.(http.Flusher)
	if !ok {
		return nil
	}

	// Persist user message
	msgID := uuid.New()
	if _, err := h.db.Pool().Exec(c.Request().Context(),
		`INSERT INTO chat_messages (id, session_id, user_id, role, content) VALUES ($1, $2, $3, 'user', $4)`,
		msgID, sessionID, userID, req.Message,
	); err != nil {
		h.logger.Warn("failed to persist user message", zap.Error(err))
	}

	// If agent is not connected, send a placeholder
	if h.agentClient == nil {
		writeSSE(c.Response().Writer, flusher, map[string]any{"type": "error", "text": "Agent service unavailable"})
		return nil
	}

	// Fan out the persona-independent lookups alongside the persona
	// query itself. Persona resolution blocks the provider API-key
	// lookup (which needs personaProvider) and the FallbackChain
	// (which needs it to skip the active provider), but fetching
	// recent messages and user prefs is independent and overlaps
	// the persona round-trip.
	var (
		personaName, personaProvider, personaModel, personaSystemPrompt string
		recentMsgs                                                      []agentgrpc.PreviousMessage
		userTimezone, userLanguage                                      string
	)
	var preWG sync.WaitGroup
	preWG.Add(3)
	go func() {
		defer preWG.Done()
		personaCtx, personaCancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
		defer personaCancel()
		h.db.Pool().QueryRow(personaCtx,
			`SELECT COALESCE(name,''), COALESCE(provider,''), COALESCE(model,''), COALESCE(system_prompt,'')
			 FROM personas WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
			userID,
		).Scan(&personaName, &personaProvider, &personaModel, &personaSystemPrompt)
	}()
	go func() {
		defer preWG.Done()
		recentCtx, recentCancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
		defer recentCancel()
		recentMsgs = fetchRecentMessages(recentCtx, h.db, sessionID, 20)
	}()
	go func() {
		defer preWG.Done()
		userTimezone, userLanguage = chatctx.CachedUserPrefs(c.Request().Context(), h.db, userID)
	}()
	preWG.Wait()

	if personaModel != "" {
		model = personaModel
	} else {
		// Persona has no model set — fall back to model_assignments['chat'].
		if assigned := chatctx.ResolveAssignedModel(c.Request().Context(), h.db, userID, "chat"); assigned != "" {
			model = assigned
		}
	}

	// Enforce system_prompt length cap to prevent oversized gRPC payloads.
	// Use rune-aware truncation so multi-byte characters (Korean, emoji) are
	// never split at a byte boundary, which would produce invalid UTF-8.
	const maxSystemPromptLen = 10_000
	if spRunes := []rune(personaSystemPrompt); len(spRunes) > maxSystemPromptLen {
		personaSystemPrompt = string(spRunes[:maxSystemPromptLen])
	}

	var personaAPIKey string
	if personaProvider != "" {
		provCtx, provCancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
		defer provCancel()
		var encryptedKey string
		h.db.Pool().QueryRow(provCtx,
			`SELECT COALESCE(api_key,'') FROM providers WHERE user_id = $1 AND provider = $2 LIMIT 1`,
			userID, personaProvider,
		).Scan(&encryptedKey)
		// API keys are stored encrypted; decrypt before passing to the agent.
		if encryptedKey != "" {
			if plain, err := crypto.Decrypt(encryptedKey, h.config.EncryptionKey); err == nil {
				personaAPIKey = plain
			}
		}
	}

	h.logger.Info("[Persona] web chat injection",
		zap.String("user_id", userID.String()),
		zap.String("persona_name", personaName),
		zap.String("persona_model", personaModel),
		zap.String("persona_provider", personaProvider),
		zap.Bool("system_prompt_set", personaSystemPrompt != ""),
		zap.Int("system_prompt_len", len([]rune(personaSystemPrompt))),
	)

	// Inject language instruction into the system prompt.
	personaSystemPrompt = chatctx.BuildSystemPrompt("", "", userLanguage, personaSystemPrompt)

	// Fan out per-user lookups in parallel. resolveSkillEnv returns both
	// the env JSON and the list of configured providers, eliminating the
	// separate integration_keys query that used to live here.
	chatCtx := c.Request().Context()
	var (
		chatSecondaryModel      string
		chatFallbackChain       string
		chatSkillEnvJSON        string
		chatConfiguredProviders []string
		chatDisabledSkillsJSON  string
	)
	var chatResolveWG sync.WaitGroup
	chatResolveWG.Add(4)
	go func() {
		defer chatResolveWG.Done()
		chatSecondaryModel = chatctx.ResolveAssignedModel(chatCtx, h.db, userID, "secondary")
	}()
	go func() {
		defer chatResolveWG.Done()
		chatFallbackChain = chatctx.ResolveFallbackChain(chatCtx, h.db, userID, h.config.EncryptionKey, personaProvider)
	}()
	go func() {
		defer chatResolveWG.Done()
		chatSkillEnvJSON, chatConfiguredProviders = chatctx.ResolveSkillEnv(chatCtx, h.db, userID, h.config.EncryptionKey)
	}()
	go func() {
		defer chatResolveWG.Done()
		chatDisabledSkillsJSON = chatctx.ResolveDisabledSkillsJSON(chatCtx, h.db, userID)
	}()
	chatResolveWG.Wait()

	// Stream from agent
	events, err := h.agentClient.StreamChat(c.Request().Context(), agentgrpc.ChatInput{
		UserID:              userID.String(),
		SessionID:           sessionID,
		Message:             req.Message,
		Model:               model,
		Provider:            personaProvider,
		APIKey:              personaAPIKey,
		SystemPrompt:        personaSystemPrompt,
		Timezone:            userTimezone,
		SecondaryModel:      chatSecondaryModel,
		PreviousMessages:    recentMsgs,
		ConfiguredProviders: chatConfiguredProviders,
		Platform:            "web",
		FallbackProviders:   chatFallbackChain,
		SkillEnvJSON:        chatSkillEnvJSON,
		DisabledSkillsJSON:  chatDisabledSkillsJSON,
	})
	if err != nil {
		h.logger.Error("StreamChat error", zap.Error(err))
		writeSSE(c.Response().Writer, flusher, map[string]any{"type": "error", "text": "Failed to contact agent"})
		return nil
	}

	var assistantContent string
	for ev := range events {
		switch ev.Type {
		case "text":
			assistantContent += ev.Text
			writeSSE(c.Response().Writer, flusher, map[string]any{"type": "text", "text": ev.Text})
		case "tool_use":
			writeSSE(c.Response().Writer, flusher, map[string]any{
				"type":       "tool_use",
				"tool_name":  ev.ToolName,
				"input_json": ev.InputJSON,
			})
		case "tool_result":
			writeSSE(c.Response().Writer, flusher, map[string]any{
				"type":      "tool_result",
				"tool_name": ev.ToolName,
				"result":    ev.Result,
				"is_error":  ev.IsError,
			})
		case "done":
			// Persist assistant message
			if assistantContent != "" {
				aID := uuid.New()
				if _, err := h.db.Pool().Exec(c.Request().Context(),
					`INSERT INTO chat_messages (id, session_id, user_id, role, content) VALUES ($1, $2, $3, 'assistant', $4)`,
					aID, sessionID, userID, assistantContent,
				); err != nil {
					h.logger.Warn("failed to persist assistant message", zap.Error(err))
				}
				// Update session timestamp
				if _, err := h.db.Pool().Exec(c.Request().Context(),
					`UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`,
					sessionID,
				); err != nil {
					h.logger.Warn("failed to update session timestamp", zap.Error(err))
				}
				// Save any image URLs found in the reply to the images table (max 10).
				const maxImagesPerResponse = 10
				for i, img := range extractImages(assistantContent) {
					if i >= maxImagesPerResponse {
						break
					}
					mimeType := "image/png"
					if strings.HasSuffix(img.path, ".jpg") || strings.HasSuffix(img.path, ".jpeg") {
						mimeType = "image/jpeg"
					}
					name := img.alt
					if name == "" {
						name = path.Base(img.path)
					}
					h.db.Pool().Exec(c.Request().Context(),
						`INSERT INTO images (user_id, url, name, mime, size, source, type)
						 VALUES ($1, $2, $3, $4, 0, 'browser', 'screenshot')`,
						userID, img.path, name, mimeType,
					)
				}
			}
			writeSSE(c.Response().Writer, flusher, map[string]any{"type": "done", "session_id": ev.SessionID})
		case "error":
			h.logger.Warn("Agent stream error", zap.String("msg", ev.ErrorMsg))
			writeSSE(c.Response().Writer, flusher, map[string]any{"type": "error", "text": ev.ErrorMsg})
		}
	}

	return nil
}

// fetchRecentMessages loads the last n messages for a legacy
// chat_sessions row (keyed on session_id). Returned oldest-first
// so the caller can feed them directly into the agent gRPC call
// as conversation context when the agent JSONL is missing.
func fetchRecentMessages(ctx context.Context, db *database.DB, sessionID string, n int) []agentgrpc.PreviousMessage {
	return fetchRecentFromTable(ctx, db,
		`SELECT role, content FROM chat_messages
		 WHERE session_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		sessionID, n)
}

// fetchRecentMessagesFromConv is the "new conversations schema"
// variant of fetchRecentMessages — reads from messages/conversation_id
// instead of chat_messages/session_id. Used by the Telegram webhook
// and the WebSocket handler.
func fetchRecentMessagesFromConv(ctx context.Context, db *database.DB, convID string, n int) []agentgrpc.PreviousMessage {
	return fetchRecentFromTable(ctx, db,
		`SELECT role, content FROM messages
		 WHERE conversation_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		convID, n)
}

// fetchRecentFromTable is the shared implementation for the two
// recent-messages helpers above. It is intentionally parametrised
// by full SQL text (not table name) so the two call sites cannot
// be trivially tricked into cross-table reads via path-traversal-
// style input — the queries are literal strings owned by this
// file and the only user input is the id and the limit.
func fetchRecentFromTable(ctx context.Context, db *database.DB, query, id string, n int) []agentgrpc.PreviousMessage {
	rows, err := db.Pool().Query(ctx, query, id, n)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var msgs []agentgrpc.PreviousMessage
	for rows.Next() {
		var role, content string
		if err := rows.Scan(&role, &content); err != nil {
			continue
		}
		// Skip tool/system messages — only user/assistant matter
		// for the agent's context window.
		if role == "user" || role == "assistant" {
			msgs = append(msgs, agentgrpc.PreviousMessage{Role: role, Content: content})
		}
	}
	if rows.Err() != nil {
		return nil // partial result on iteration error — safer to return nothing
	}
	// Reverse to oldest-first so the agent receives messages in
	// chronological order.
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs
}

// GET /api/v1/sessions/search?q=<query>&limit=<n>
// Full-text search across chat_messages (user + assistant roles).
// Requires the 013_chat_messages_fts migration to be applied.
func (h *ChatHandler) SearchSessions(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q parameter is required"})
	}
	if len(q) > 500 {
		q = q[:500]
	}

	limit := 20
	if lStr := c.QueryParam("limit"); lStr != "" {
		if n, parseErr := strconv.Atoi(lStr); parseErr == nil && n >= 1 && n <= 100 {
			limit = n
		}
	}

	// Build a tsquery: each space-separated word becomes a prefix search term joined with AND.
	// Strip non-alphanumeric characters (except hyphens) so user input cannot produce
	// malformed to_tsquery syntax (e.g. "it's" → unmatched quote, "(foo" → parse error).
	tsWordRe := regexp.MustCompile(`[^\p{L}\p{N}\-]+`)
	words := strings.Fields(q)
	var tsTerms []string
	for _, w := range words {
		clean := tsWordRe.ReplaceAllString(w, "")
		if clean != "" {
			tsTerms = append(tsTerms, clean+":*")
		}
	}
	if len(tsTerms) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q parameter contains no searchable terms"})
	}
	tsQuery := strings.Join(tsTerms, " & ")

	rows, err := h.db.Pool().Query(c.Request().Context(), `
		SELECT
		  m.session_id::text,
		  s.title,
		  m.role,
		  LEFT(m.content, 300) AS snippet,
		  m.created_at::text,
		  ts_rank(m.search_vector, to_tsquery('simple', $3)) AS rank
		FROM chat_messages m
		JOIN chat_sessions s ON s.id = m.session_id
		WHERE m.user_id = $1
		  AND m.search_vector @@ to_tsquery('simple', $3)
		ORDER BY rank DESC, m.created_at DESC
		LIMIT $2
	`, userID, limit, tsQuery)
	if err != nil {
		h.logger.Error("SearchSessions: query failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "search failed"})
	}
	defer rows.Close()

	type searchHit struct {
		SessionID string  `json:"session_id"`
		Title     *string `json:"title"`
		Role      string  `json:"role"`
		Snippet   string  `json:"snippet"`
		CreatedAt string  `json:"created_at"`
		Rank      float64 `json:"rank"`
	}

	hits := []searchHit{}
	for rows.Next() {
		var hit searchHit
		if err := rows.Scan(&hit.SessionID, &hit.Title, &hit.Role, &hit.Snippet, &hit.CreatedAt, &hit.Rank); err != nil {
			continue
		}
		hits = append(hits, hit)
	}

	return c.JSON(http.StatusOK, map[string]any{"hits": hits, "query": q})
}

// GET /api/v1/conversations/search?q=<query>[&limit=<n>]
// Full-text search across the messages table (conversations-based chat).
// Requires the phase5_messages_fts migration to be applied.
//
// Response:
//
//	{ "hits": [{ "conversation_id", "title", "role", "snippet", "created_at", "rank" }], "query": "<q>" }
func (h *ChatHandler) SearchConversations(c echo.Context) error {
	userID, err := httpauth.UserIDFromContext(c)
	if err != nil {
		return unauthorized(c)
	}

	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q parameter is required"})
	}
	if len(q) > 500 {
		q = q[:500]
	}

	limit := 20
	if lStr := c.QueryParam("limit"); lStr != "" {
		if n, parseErr := strconv.Atoi(lStr); parseErr == nil && n >= 1 && n <= 100 {
			limit = n
		}
	}

	// Build prefix-match tsquery: each word becomes word:* joined with AND.
	tsWordRe := regexp.MustCompile(`[^\p{L}\p{N}\-]+`)
	words := strings.Fields(q)
	var tsTerms []string
	for _, w := range words {
		clean := tsWordRe.ReplaceAllString(w, "")
		if clean != "" {
			tsTerms = append(tsTerms, clean+":*")
		}
	}
	if len(tsTerms) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "q parameter contains no searchable terms"})
	}
	tsQuery := strings.Join(tsTerms, " & ")

	rows, err := h.db.Pool().Query(c.Request().Context(), `
		SELECT
		  m.conversation_id::text,
		  c.title,
		  m.role,
		  LEFT(m.content, 300) AS snippet,
		  m.created_at::text,
		  ts_rank(m.search_vector, to_tsquery('simple', $3)) AS rank
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
		  AND m.search_vector @@ to_tsquery('simple', $3)
		ORDER BY rank DESC, m.created_at DESC
		LIMIT $2
	`, userID, limit, tsQuery)
	if err != nil {
		h.logger.Error("SearchConversations: query failed", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "search failed"})
	}
	defer rows.Close()

	type searchHit struct {
		ConversationID string  `json:"conversation_id"`
		Title          *string `json:"title"`
		Role           string  `json:"role"`
		Snippet        string  `json:"snippet"`
		CreatedAt      string  `json:"created_at"`
		Rank           float64 `json:"rank"`
	}

	hits := []searchHit{}
	for rows.Next() {
		var hit searchHit
		if err := rows.Scan(&hit.ConversationID, &hit.Title, &hit.Role, &hit.Snippet, &hit.CreatedAt, &hit.Rank); err != nil {
			continue
		}
		hits = append(hits, hit)
	}

	return c.JSON(http.StatusOK, map[string]any{"hits": hits, "query": q})
}
