package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/newstarnion/gateway/config"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"go.uber.org/zap"
)

// newWSUpgrader returns a WebSocket upgrader that validates the request origin
// against the configured allowed origins list.
// If allowedOrigins is empty, all origins are accepted (dev mode only).
func newWSUpgrader(allowedOrigins []string) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			if len(allowedOrigins) == 0 {
				return true
			}
			origin := r.Header.Get("Origin")
			if origin == "" {
				return false
			}
			for _, allowed := range allowedOrigins {
				if allowed == "*" || allowed == origin {
					return true
				}
			}
			return false
		},
	}
}

// ── Message types ─────────────────────────────────────────────────────────────

type wsAttachment struct {
	URL  string `json:"url"`
	Mime string `json:"mime"`
	Name string `json:"name"`
}

type wsIncoming struct {
	Type        string         `json:"type"`               // "chat.send" | "chat.history" | "chat.abort" | "ping"
	ID          string         `json:"id,omitempty"`        // client request id (echoed back)
	Message     string         `json:"message,omitempty"`
	ThreadID    string         `json:"thread_id,omitempty"`
	Model       string         `json:"model,omitempty"`     // optional model override (web-only)
	RunID       string         `json:"run_id,omitempty"`    // for chat.abort
	Limit       int            `json:"limit,omitempty"`
	Attachments []wsAttachment `json:"attachments,omitempty"`
}

type wsOutgoing struct {
	Type    string `json:"type"`
	ID      string `json:"id,omitempty"`
	RunID   string `json:"run_id,omitempty"`
	Text    string `json:"text,omitempty"`
	Tool    string `json:"tool,omitempty"`
	Input   string `json:"input,omitempty"`   // tool_use: input_json
	Result  string `json:"result,omitempty"`  // tool_result: result
	IsError bool   `json:"is_error,omitempty"` // tool_result: error flag
	Message string `json:"message,omitempty"`
	// final metadata
	BotName       string `json:"bot_name,omitempty"`
	ModelUsed     string `json:"model_used,omitempty"`
	InputTokens   int    `json:"input_tokens,omitempty"`
	OutputTokens  int    `json:"output_tokens,omitempty"`
	ContextTokens int    `json:"context_tokens,omitempty"`
	ContextWindow int    `json:"context_window,omitempty"`
	// thread tracking — conv_id is included in the "final" event so the client
	// can update its URL when the gateway auto-creates a new conversation.
	ConvID string `json:"conv_id,omitempty"`
	// history response
	Messages any `json:"messages,omitempty"`
}

// maxUserConcurrentRuns is the maximum number of simultaneous chat.send
// requests allowed per user. Requests beyond this limit are rejected with an
// error so a single user cannot monopolise the gRPC stream pool.
const maxUserConcurrentRuns = 5

// maxGlobalConcurrentRuns caps the total concurrent chat.send streams across
// ALL users to prevent gRPC pool exhaustion under high traffic.
const maxGlobalConcurrentRuns = 100

// WSHandler handles /ws
type WSHandler struct {
	db          *database.DB
	config      *config.Config
	agentClient *agentgrpc.AgentClient
	logger      *zap.Logger
	upgrader    websocket.Upgrader
	// activeRuns maps runID → context.CancelFunc for in-flight chat.send requests.
	// Used by chat.abort to cancel the associated gRPC stream.
	activeRuns sync.Map
	// userRunCounts maps userID → *int32 tracking concurrent stream count per user.
	userRunCounts sync.Map
	// globalRunCount tracks total concurrent chat.send streams server-wide.
	globalRunCount int32
}

func NewWSHandler(db *database.DB, cfg *config.Config, agentClient *agentgrpc.AgentClient, logger *zap.Logger) *WSHandler {
	return &WSHandler{
		db:          db,
		config:      cfg,
		agentClient: agentClient,
		logger:      logger,
		upgrader:    newWSUpgrader(cfg.AllowedOrigins),
	}
}

// GET /ws?token=<jwt>
func (h *WSHandler) Handle(c echo.Context) error {
	// ── Auth: JWT from query param (browsers can't set WS headers) ────────────
	tokenStr := c.QueryParam("token")
	if tokenStr == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}
	userID, err := h.validateToken(tokenStr)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
	}

	// ── Upgrade to WebSocket ──────────────────────────────────────────────────
	ws, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()
	// Cap raw frame size before the 32 KB JSON-level check; prevents OOM from
	// a single oversized frame being fully buffered in memory.
	ws.SetReadLimit(65536)

	// connCtx is cancelled when this handler returns (i.e. the WS connection
	// closes). Passing it to handleChatSend ensures that any in-flight gRPC
	// stream is cancelled immediately when the client disconnects, rather than
	// running for the full 5-minute timeout.
	connCtx, connCancel := context.WithCancel(context.Background())
	defer connCancel()

	var mu sync.Mutex

	// ── WebSocket keepalive (ping/pong) ───────────────────────────────────────
	// Detect TCP half-open (NAT timeout, mobile network switch) by sending a
	// WebSocket ping every 30 s. The pong handler extends the read deadline;
	// if no pong arrives within the next 60 s the ReadMessage below returns an
	// error and the connection is cleanly closed.
	const wsPingInterval = 30 * time.Second
	const wsReadTimeout = 60 * time.Second
	ws.SetReadDeadline(time.Now().Add(wsReadTimeout))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(wsReadTimeout))
		return nil
	})
	go func() {
		ticker := time.NewTicker(wsPingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				mu.Lock()
				pingErr := ws.WriteControl(
					websocket.PingMessage, nil,
					time.Now().Add(5*time.Second),
				)
				mu.Unlock()
				if pingErr != nil {
					return // connection closed
				}
			case <-connCtx.Done():
				return
			}
		}
	}()

	send := func(msg wsOutgoing) {
		b, _ := json.Marshal(msg)
		mu.Lock()
		if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
			h.logger.Warn("ws write error", zap.Error(err))
		}
		mu.Unlock()
	}

	// ── Message loop ──────────────────────────────────────────────────────────
	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			break // client disconnected
		}

		var msg wsIncoming
		if err := json.Unmarshal(raw, &msg); err != nil {
			send(wsOutgoing{Type: "error", Message: "invalid json"})
			continue
		}

		switch msg.Type {
		case "ping":
			send(wsOutgoing{Type: "pong"})

		case "chat.send":
			runID := uuid.New().String()
			go h.handleChatSend(userID, msg, runID, send, connCtx)

		case "chat.history":
			go h.handleChatHistory(userID, msg, send)

		case "chat.abort":
			if v, ok := h.activeRuns.Load(msg.RunID); ok {
				v.(context.CancelFunc)()
				h.logger.Info("chat.abort: cancelled run", zap.String("run_id", msg.RunID))
			}
			send(wsOutgoing{Type: "aborted", ID: msg.ID, RunID: msg.RunID})
		}
	}
	return nil
}

// handleChatSend streams a chat response back via WebSocket.
// runID is pre-generated by the caller so the client can reference it for abort.
// connCtx is derived from the WebSocket connection lifetime; cancelling it
// (e.g. on disconnect) propagates cancellation to the gRPC stream.
func (h *WSHandler) handleChatSend(userID uuid.UUID, msg wsIncoming, runID string, send func(wsOutgoing), connCtx context.Context) {
	ctx, cancel := context.WithTimeout(connCtx, 5*time.Minute)
	// Wrap cancel in sync.Once so it is safe to call from both abort and defer.
	var once sync.Once
	cancelOnce := func() { once.Do(cancel) }
	h.activeRuns.Store(runID, context.CancelFunc(cancelOnce))
	defer func() {
		h.activeRuns.Delete(runID)
		cancelOnce()
	}()

	if msg.Message == "" && len(msg.Attachments) == 0 {
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "message is required"})
		return
	}
	if len(msg.Message) > 32000 {
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "message too long (max 32000 characters)"})
		return
	}
	if len(msg.Model) > 200 {
		msg.Model = msg.Model[:200]
	}
	for i := range msg.Attachments {
		if len(msg.Attachments[i].URL) > 2000 {
			msg.Attachments[i].URL = msg.Attachments[i].URL[:2000]
		}
		if len(msg.Attachments[i].Name) > 255 {
			msg.Attachments[i].Name = msg.Attachments[i].Name[:255]
		}
		if len(msg.Attachments[i].Mime) > 100 {
			msg.Attachments[i].Mime = msg.Attachments[i].Mime[:100]
		}
	}

	// Enforce per-user concurrent stream limit.
	counter, _ := h.userRunCounts.LoadOrStore(userID, new(int32))
	ptr := counter.(*int32)
	if atomic.AddInt32(ptr, 1) > maxUserConcurrentRuns {
		atomic.AddInt32(ptr, -1)
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "too many concurrent requests, please wait"})
		return
	}
	defer func() {
		if atomic.AddInt32(ptr, -1) == 0 {
			// Best-effort cleanup: remove the zero-count entry so inactive users
			// don't accumulate in the map indefinitely.
			h.userRunCounts.Delete(userID)
		}
	}()

	// Enforce global concurrent stream limit across all users.
	if atomic.AddInt32(&h.globalRunCount, 1) > maxGlobalConcurrentRuns {
		atomic.AddInt32(&h.globalRunCount, -1)
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "server is busy, please try again shortly"})
		return
	}
	defer atomic.AddInt32(&h.globalRunCount, -1)

	// Resolve / create conversation (use first attachment name as title when message is empty).
	convTitle := msg.Message
	if convTitle == "" && len(msg.Attachments) > 0 {
		convTitle = msg.Attachments[0].Name
	}
	convID, err := h.resolveConversation(ctx, userID, msg.ThreadID, convTitle)
	if err != nil {
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "failed to resolve conversation"})
		return
	}

	// Persist user message (with optional attachments).
	var attachmentsJSON []byte
	if len(msg.Attachments) > 0 {
		attachmentsJSON, _ = json.Marshal(msg.Attachments)
	}
	if _, err := h.db.ExecContext(ctx,
		`INSERT INTO messages (id, conversation_id, role, content, attachments) VALUES ($1, $2, 'user', $3, $4)`,
		uuid.New(), convID, msg.Message, attachmentsJSON,
	); err != nil {
		h.logger.Warn("failed to persist user message", zap.Error(err))
	}

	// Lookup persona: prefer conversation's assigned persona, fall back to user default.
	pInfo := resolvePersona(ctx, h.db, convID, userID, h.config.EncryptionKey)
	provider, model, systemPrompt, apiKey := pInfo.provider, pInfo.model, pInfo.systemPrompt, pInfo.apiKey
	botName := pInfo.botName

	// Apply web-side model override if provided (user selected a different model in chat UI).
	if msg.Model != "" {
		model = msg.Model
	}
	// Fall back to agent default so model_used is never empty.
	if model == "" {
		model = "claude-sonnet-4-5"
	}

	if h.agentClient == nil {
		send(wsOutgoing{Type: "final", ID: msg.ID, Text: "에이전트 서비스가 아직 준비 중입니다."})
		return
	}

	// Build the effective message: append attachment URLs so the agent can reference them.
	// Images: collected separately as imageURLs for vision processing by the agent.
	// Audio/video: appended as [audio:name:URL] so the audio skill can use --file-url.
	// Other files: appended as [file:name:URL].
	agentMessage := msg.Message
	var imageURLs []agentgrpc.ImageURL
	if len(msg.Attachments) > 0 {
		var sb strings.Builder
		sb.WriteString(msg.Message)
		for _, a := range msg.Attachments {
			switch {
			case strings.HasPrefix(a.Mime, "image/"):
				// Collect image URLs for vision processing; also append as text hint.
				imageURLs = append(imageURLs, agentgrpc.ImageURL{
					URL:      a.URL,
					MimeType: a.Mime,
				})
				sb.WriteString("\n[image:")
				sb.WriteString(a.URL)
				sb.WriteByte(']')
			case strings.HasPrefix(a.Mime, "audio/") || strings.HasPrefix(a.Mime, "video/"):
				sb.WriteString("\n[audio:")
				sb.WriteString(a.Name)
				sb.WriteByte(':')
				sb.WriteString(a.URL)
				sb.WriteByte(']')
			default:
				sb.WriteString("\n[file:")
				sb.WriteString(a.Name)
				sb.WriteByte(':')
				sb.WriteString(a.URL)
				sb.WriteByte(']')
			}
		}
		agentMessage = sb.String()
	}

	wsTimezone, _ := cachedUserPrefs(ctx, h.db, userID)

	// Fetch the user's configured API providers for per-user skill filtering.
	var wsConfiguredProviders []string
	if rows, qErr := h.db.QueryContext(ctx,
		`SELECT provider FROM integration_keys WHERE user_id = $1`,
		userID,
	); qErr == nil {
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil {
				wsConfiguredProviders = append(wsConfiguredProviders, p)
			}
		}
		_ = rows.Err()
		rows.Close()
	}

	wsSecondaryModel := resolveAssignedModel(ctx, h.db, userID, "secondary")
	wsFallbackChain := resolveFallbackChain(ctx, h.db, userID, h.config.EncryptionKey, provider)
	wsSkillEnvJSON := resolveSkillEnvJSON(ctx, h.db, userID, h.config.EncryptionKey)
	wsDisabledSkillsJSON := resolveDisabledSkillsJSON(ctx, h.db, userID)

	events, err := h.agentClient.StreamChat(ctx, userID.String(), convID.String(), agentMessage, model, provider, apiKey, systemPrompt, wsTimezone, wsSecondaryModel, nil, nil, imageURLs, wsConfiguredProviders, "web", wsFallbackChain, wsSkillEnvJSON, wsDisabledSkillsJSON)
	if err != nil {
		h.logger.Error("StreamChat error", zap.Error(err))
		send(wsOutgoing{Type: "error", ID: msg.ID, Message: "agent stream unavailable, please try again"})
		return
	}

	var fullText string
	var inputTokens, outputTokens, contextTokens, contextWindow, cacheReadTokens int
	var agentCostUSD float64

	// Accumulate tool events so they can be persisted with the assistant message.
	type toolEventRecord struct {
		Tool    string `json:"tool"`
		Input   string `json:"input,omitempty"`
		Result  string `json:"result,omitempty"`
		IsError bool   `json:"is_error,omitempty"`
		Status  string `json:"status"` // "done" | "error"
	}
	var toolEvents []toolEventRecord
	// Track pending tool_use inputs by tool name (most tools are sequential).
	pendingInputs := map[string]string{}

	for ev := range events {
		switch ev.Type {
		case "text":
			fullText += ev.Text
			send(wsOutgoing{Type: "delta", ID: msg.ID, RunID: runID, Text: ev.Text})

		case "tool_use":
			pendingInputs[ev.ToolName] = ev.InputJSON
			send(wsOutgoing{Type: "tool_use", ID: msg.ID, RunID: runID, Tool: ev.ToolName, Input: ev.InputJSON})

		case "tool_result":
			input := pendingInputs[ev.ToolName]
			delete(pendingInputs, ev.ToolName)
			status := "done"
			if ev.IsError {
				status = "error"
			}
			toolEvents = append(toolEvents, toolEventRecord{
				Tool:    ev.ToolName,
				Input:   input,
				Result:  ev.Result,
				IsError: ev.IsError,
				Status:  status,
			})
			send(wsOutgoing{Type: "tool_result", ID: msg.ID, RunID: runID, Tool: ev.ToolName, Result: ev.Result, IsError: ev.IsError})

		case "done":
			inputTokens = ev.InputTokens
			outputTokens = ev.OutputTokens
			cacheReadTokens = ev.CacheReadTokens
			contextTokens = ev.ContextTokens
			contextWindow = ev.ContextWindow
			agentCostUSD = ev.TotalCostUSD
			send(wsOutgoing{Type: "final", ID: msg.ID, RunID: runID, Text: fullText,
				BotName: botName, ModelUsed: model,
				InputTokens: inputTokens, OutputTokens: outputTokens,
				ContextTokens: contextTokens, ContextWindow: contextWindow,
				ConvID: convID.String()})

		case "error":
			outMsg := ev.ErrorMsg
			if cat := classifyAgentError(ev.ErrorMsg); cat != errCatUnknown {
				_, lang := cachedUserPrefs(ctx, h.db, userID)
				if friendly := friendlyErrorMessage(cat, lang); friendly != "" {
					outMsg = friendly
				}
			}
			send(wsOutgoing{Type: "error", ID: msg.ID, RunID: runID, Message: outMsg})
		}
	}

	// Persist assistant message with tool events.
	if fullText != "" {
		var toolEventsJSON []byte
		if len(toolEvents) > 0 {
			toolEventsJSON, _ = json.Marshal(toolEvents)
		}
		if _, err := h.db.ExecContext(ctx,
			`INSERT INTO messages (id, conversation_id, role, content, bot_name, model_used, input_tokens, output_tokens, context_tokens, context_window, tool_events)
			 VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9, $10)`,
			uuid.New(), convID, fullText, botName, model, inputTokens, outputTokens, contextTokens, contextWindow, toolEventsJSON,
		); err != nil {
			h.logger.Warn("failed to persist assistant message", zap.Error(err))
		}
		insertUsageLog(ctx, h.db, userID, model, provider, inputTokens, cacheReadTokens, outputTokens, "chat", agentCostUSD)
	}
	if _, err := h.db.ExecContext(ctx, `UPDATE conversations SET updated_at = $1 WHERE id = $2`, time.Now(), convID); err != nil {
		h.logger.Warn("failed to update conversation timestamp", zap.Error(err))
	}
}

// handleChatHistory returns conversation messages.
func (h *WSHandler) handleChatHistory(userID uuid.UUID, msg wsIncoming, send func(wsOutgoing)) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	limit := msg.Limit
	if limit < 1 || limit > 100 {
		limit = 30
	}

	if msg.ThreadID == "" {
		send(wsOutgoing{Type: "history", ID: msg.ID, Messages: []any{}})
		return
	}

	rows, err := h.db.QueryContext(ctx,
		`SELECT m.id, m.role, m.content, m.created_at, m.attachments
		 FROM messages m
		 JOIN conversations c ON c.id = m.conversation_id
		 WHERE c.user_id = $1 AND c.id = $2::uuid
		 ORDER BY m.created_at ASC LIMIT $3`,
		userID, msg.ThreadID, limit,
	)
	if err != nil {
		send(wsOutgoing{Type: "history", ID: msg.ID, Messages: []any{}})
		return
	}
	defer rows.Close()

	type histMsg struct {
		ID          string          `json:"id"`
		Role        string          `json:"role"`
		Content     string          `json:"content"`
		CreatedAt   time.Time       `json:"created_at"`
		Attachments json.RawMessage `json:"attachments,omitempty"`
	}
	var messages []histMsg
	for rows.Next() {
		var m histMsg
		var rawAttach []byte
		if rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt, &rawAttach) == nil {
			if len(rawAttach) > 0 && string(rawAttach) != "null" {
				m.Attachments = json.RawMessage(rawAttach)
			}
			messages = append(messages, m)
		}
	}
	if err := rows.Err(); err != nil {
		h.logger.Warn("loadHistory: rows iteration error", zap.Error(err))
	}
	if messages == nil {
		messages = []histMsg{}
	}
	send(wsOutgoing{Type: "history", ID: msg.ID, Messages: messages})
}

// resolveConversation finds or creates a conversation.
func (h *WSHandler) resolveConversation(ctx context.Context, userID uuid.UUID, threadID, firstMsg string) (uuid.UUID, error) {
	if threadID != "" {
		var id uuid.UUID
		err := h.db.QueryRowContext(ctx,
			`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
			threadID, userID,
		).Scan(&id)
		if err == nil {
			return id, nil
		}
		// Not found — create with supplied ID.
		if parsed, pe := uuid.Parse(threadID); pe == nil {
			h.db.ExecContext(ctx,
				`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
				parsed, userID, truncateTitle(firstMsg, 80),
			)
			return parsed, nil
		}
	}
	newID := uuid.New()
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)`,
		newID, userID, truncateTitle(firstMsg, 80),
	)
	return newID, err
}

// validateToken verifies a JWT and returns the user ID.
func (h *WSHandler) validateToken(tokenStr string) (uuid.UUID, error) {
	if isTokenBlacklisted(tokenStr) {
		return uuid.Nil, fmt.Errorf("token revoked")
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.config.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return uuid.Nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, jwt.ErrTokenInvalidClaims
	}
	idStr, _ := claims["user_id"].(string)
	return uuid.Parse(idStr)
}
