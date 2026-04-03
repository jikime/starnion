package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	agentgrpc "github.com/newstarnion/gateway/internal/infrastructure/grpc"
	"go.uber.org/zap"
)

// writeAISDKLine writes one AI SDK v6 data-stream protocol line and flushes.
// format: `data: {code}:{json_value}\n\n`
func writeAISDKLine(w http.ResponseWriter, flusher http.Flusher, code string, value any) {
	b, _ := json.Marshal(value)
	fmt.Fprintf(w, "data: %s:%s\n\n", code, b)
	flusher.Flush()
}

// StreamChatRequest matches what /app/api/chat/route.ts POSTs here.
type StreamChatRequest struct {
	Message  string `json:"message"`
	ThreadID string `json:"thread_id"`
	Files    []struct {
		URL  string `json:"url"`
		Name string `json:"name"`
		Mime string `json:"mime"`
	} `json:"files"`
}

// ChatStream handles POST /api/v1/chat/stream.
// Emits AI SDK v6 data-stream wire format so the DefaultChatTransport can parse it.
func (h *ChatHandler) ChatStream(c echo.Context) error {
	userID, err := getUserIDFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req StreamChatRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Message == "" && len(req.Files) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "message is required"})
	}
	if len(req.Message) > 32000 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "message too long (max 32000 characters)"})
	}
	for i := range req.Files {
		if len(req.Files[i].URL) > 2000 {
			req.Files[i].URL = req.Files[i].URL[:2000]
		}
		if len(req.Files[i].Name) > 255 {
			req.Files[i].Name = req.Files[i].Name[:255]
		}
		if len(req.Files[i].Mime) > 100 {
			req.Files[i].Mime = req.Files[i].Mime[:100]
		}
	}

	ctx := c.Request().Context()

	// ── Concurrency limits ────────────────────────────────────────────────────
	// Checked before SSE headers are committed so we can still return HTTP 429.
	counter, _ := h.userRunCounts.LoadOrStore(userID, new(int32))
	ptr := counter.(*int32)
	if atomic.AddInt32(ptr, 1) > maxSSEUserConcurrentRuns {
		atomic.AddInt32(ptr, -1)
		return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "too many concurrent requests, please wait"})
	}
	defer func() {
		if atomic.AddInt32(ptr, -1) == 0 {
			h.userRunCounts.Delete(userID)
		}
	}()
	if atomic.AddInt32(&h.globalRunCount, 1) > maxSSEGlobalConcurrentRuns {
		atomic.AddInt32(&h.globalRunCount, -1)
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "server is busy, please try again later"})
	}
	defer atomic.AddInt32(&h.globalRunCount, -1)

	// Resolve or create the conversation (thread).
	var convID uuid.UUID
	if req.ThreadID != "" {
		err = h.db.QueryRowContext(ctx,
			`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
			req.ThreadID, userID,
		).Scan(&convID)
		if err != nil {
			// Thread not found — create a new one using the supplied ID.
			convID = uuid.New()
			if parsed, pe := uuid.Parse(req.ThreadID); pe == nil {
				convID = parsed
			}
			h.db.ExecContext(ctx,
				`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
				convID, userID, truncateTitle(req.Message, 80),
			)
		}
	} else {
		convID = uuid.New()
		h.db.ExecContext(ctx,
			`INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)`,
			convID, userID, truncateTitle(req.Message, 80),
		)
	}

	// Persist user message.
	userMsgID := uuid.New()
	var attachJSON []byte
	if len(req.Files) > 0 {
		attachJSON, _ = json.Marshal(req.Files)
	}
	if _, err := h.db.ExecContext(ctx,
		`INSERT INTO messages (id, conversation_id, role, content, attachments) VALUES ($1, $2, 'user', $3, $4)`,
		userMsgID, convID, req.Message, attachJSON,
	); err != nil {
		h.logger.Warn("failed to persist user message", zap.Error(err))
	}

	// Set SSE headers.
	c.Response().Header().Set(echo.HeaderContentType, "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	flusher, ok := c.Response().Writer.(http.Flusher)
	if !ok {
		return nil
	}

	// If agent is unavailable, send a static fallback response.
	if h.agentClient == nil {
		fallback := "에이전트 서비스가 아직 준비 중입니다. 잠시 후 다시 시도해 주세요."
		writeAISDKLine(c.Response().Writer, flusher, "0", fallback)
		writeAISDKLine(c.Response().Writer, flusher, "e", map[string]any{
			"finishReason": "stop",
			"usage":        map[string]any{"promptTokens": 0, "completionTokens": 0},
			"isContinued":  false,
		})
		writeAISDKLine(c.Response().Writer, flusher, "d", map[string]any{
			"finishReason": "stop",
			"usage":        map[string]any{"promptTokens": 0, "completionTokens": 0},
		})
		// Save fallback as assistant message.
		if _, err := h.db.ExecContext(ctx,
			`INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
			uuid.New(), convID, fallback,
		); err != nil {
			h.logger.Warn("failed to persist fallback assistant message", zap.Error(err))
		}
		if _, err := h.db.ExecContext(ctx, `UPDATE conversations SET updated_at = $1 WHERE id = $2`, time.Now(), convID); err != nil {
			h.logger.Warn("failed to update conversation timestamp", zap.Error(err))
		}
		return nil
	}

	// Look up persona: conversation-specific first, then user default.
	pInfo := resolvePersona(ctx, h.db, convID, userID, h.config.EncryptionKey)
	// If no persona specified a model, fall back to model_assignments['chat'].
	if pInfo.model == "" {
		pInfo.model = resolveAssignedModel(ctx, h.db, userID, "chat")
	}
	// Secondary model for utility tasks (title generation, insights, context compression).
	streamSecondaryModel := resolveAssignedModel(ctx, h.db, userID, "secondary")

	// Stream from agent gRPC, converting events to AI SDK v6 wire format.
	// Look up user's timezone from preferences (5-minute cache).
	streamTimezone, _ := cachedUserPrefs(ctx, h.db, userID)

	// Collect image URLs from attached files for vision processing.
	var streamImageURLs []agentgrpc.ImageURL
	for _, f := range req.Files {
		if strings.HasPrefix(f.Mime, "image/") {
			streamImageURLs = append(streamImageURLs, agentgrpc.ImageURL{
				URL:      f.URL,
				MimeType: f.Mime,
			})
		}
	}

	// Fetch the user's configured API providers for per-user skill filtering.
	var streamConfiguredProviders []string
	if rows, qErr := h.db.QueryContext(ctx,
		`SELECT provider FROM integration_keys WHERE user_id = $1`,
		userID,
	); qErr == nil {
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil {
				streamConfiguredProviders = append(streamConfiguredProviders, p)
			}
		}
		if rErr := rows.Err(); rErr != nil {
			h.logger.Warn("rows error in provider query", zap.Error(rErr))
		}
		rows.Close()
	}

	// Build LLM fallback chain (Groq → OpenRouter → OpenAI → Anthropic).
	streamFallbackChain := resolveFallbackChain(ctx, h.db, userID, h.config.EncryptionKey, pInfo.provider)
	streamSkillEnvJSON := resolveSkillEnvJSON(ctx, h.db, userID, h.config.EncryptionKey)
	streamDisabledSkillsJSON := resolveDisabledSkillsJSON(ctx, h.db, userID)

	events, err := h.agentClient.StreamChat(ctx, userID.String(), convID.String(), req.Message, pInfo.model, pInfo.provider, pInfo.apiKey, pInfo.systemPrompt, streamTimezone, streamSecondaryModel, nil, nil, streamImageURLs, streamConfiguredProviders, "web", streamFallbackChain, streamSkillEnvJSON, streamDisabledSkillsJSON)
	if err != nil {
		h.logger.Error("StreamChat error", zap.Error(err))
		writeAISDKLine(c.Response().Writer, flusher, "3", "Agent stream unavailable, please try again")
		return nil
	}

	var assistantContent string
	var promptTokens, completionTokens, contextTokens, contextWindow, cacheReadTokens int
	var agentCostUSD float64

	// pendingToolCallIDs maps toolName → FIFO queue of call IDs so that the
	// tool_result event (code "9") can echo the same toolCallId that was sent
	// in the corresponding tool_use event (code "b").  The AI SDK requires
	// both events to carry the same ID for client-side tracking.
	pendingToolCallIDs := map[string][]string{}

	for ev := range events {
		switch ev.Type {
		case "text":
			assistantContent += ev.Text
			writeAISDKLine(c.Response().Writer, flusher, "0", ev.Text)

		case "tool_use":
			toolCallID := uuid.New().String()
			pendingToolCallIDs[ev.ToolName] = append(pendingToolCallIDs[ev.ToolName], toolCallID)
			var args any
			if err2 := json.Unmarshal([]byte(ev.InputJSON), &args); err2 != nil {
				args = map[string]any{}
			}
			writeAISDKLine(c.Response().Writer, flusher, "b", map[string]any{
				"toolCallId": toolCallID,
				"toolName":   ev.ToolName,
				"args":       args,
			})

		case "tool_result":
			// Reuse the ID from the matching tool_use event (FIFO per tool name).
			toolCallID := ""
			if ids := pendingToolCallIDs[ev.ToolName]; len(ids) > 0 {
				toolCallID = ids[0]
				pendingToolCallIDs[ev.ToolName] = ids[1:]
			}
			if toolCallID == "" {
				toolCallID = uuid.New().String()
			}
			writeAISDKLine(c.Response().Writer, flusher, "9", map[string]any{
				"toolCallId": toolCallID,
				"result":     ev.Result,
			})

		case "done":
			promptTokens = ev.InputTokens
			completionTokens = ev.OutputTokens
			cacheReadTokens = ev.CacheReadTokens
			contextTokens = ev.ContextTokens
			contextWindow = ev.ContextWindow
			agentCostUSD = ev.TotalCostUSD
			writeAISDKLine(c.Response().Writer, flusher, "e", map[string]any{
				"finishReason": "stop",
				"usage": map[string]any{
					"promptTokens":     promptTokens,
					"completionTokens": completionTokens,
				},
				"isContinued": false,
			})
			writeAISDKLine(c.Response().Writer, flusher, "d", map[string]any{
				"finishReason": "stop",
				"usage": map[string]any{
					"promptTokens":     promptTokens,
					"completionTokens": completionTokens,
				},
			})

		case "error":
			h.logger.Warn("Agent stream error", zap.String("msg", ev.ErrorMsg))
			outMsg := ev.ErrorMsg
			if cat := classifyAgentError(ev.ErrorMsg); cat != errCatUnknown {
				_, lang := cachedUserPrefs(ctx, h.db, userID)
				if friendly := friendlyErrorMessage(cat, lang); friendly != "" {
					outMsg = friendly
				}
			}
			writeAISDKLine(c.Response().Writer, flusher, "3", outMsg)
		}
	}

	// Persist assistant message and bump conversation timestamp.
	if assistantContent != "" {
		if _, err := h.db.ExecContext(ctx,
			`INSERT INTO messages (id, conversation_id, role, content, bot_name, model_used, input_tokens, output_tokens, context_tokens, context_window)
			 VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9)`,
			uuid.New(), convID, assistantContent, pInfo.botName, pInfo.model, promptTokens, completionTokens, contextTokens, contextWindow,
		); err != nil {
			h.logger.Error("failed to persist assistant message", zap.Error(err))
		}
		insertUsageLog(ctx, h.db, userID, pInfo.model, pInfo.provider, promptTokens, cacheReadTokens, completionTokens, "chat", agentCostUSD)
	}
	if _, err := h.db.ExecContext(ctx, `UPDATE conversations SET updated_at = $1 WHERE id = $2`, time.Now(), convID); err != nil {
		h.logger.Warn("failed to update conversation timestamp", zap.Error(err))
	}

	return nil
}

// truncateTitle cuts s to maxLen runes, appending "…" if truncated.
func truncateTitle(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}
