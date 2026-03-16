package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
)

// ChatStreamHandler serves the Vercel AI SDK v6-compatible SSE streaming endpoint.
// Stream protocol: SSE where each event carries a UIMessageChunk JSON payload.
// Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol (v6 format)
type ChatStreamHandler struct {
	grpcClient starnionv1.AgentServiceClient
	db         *sql.DB        // may be nil
	minio      *storage.MinIO // may be nil
}

// NewChatStreamHandler creates a new ChatStreamHandler.
func NewChatStreamHandler(conn *grpc.ClientConn, db *sql.DB, minio *storage.MinIO) *ChatStreamHandler {
	return &ChatStreamHandler{
		grpcClient: starnionv1.NewAgentServiceClient(conn),
		db:         db,
		minio:      minio,
	}
}

// fileInfo represents a user-attached file (already uploaded to MinIO).
type fileInfo struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Mime string `json:"mime"`
}

type streamRequest struct {
	UserID   string     `json:"user_id"`
	Message  string     `json:"message"`
	ThreadID string     `json:"thread_id,omitempty"`
	Model    string     `json:"model,omitempty"`
	Files    []fileInfo `json:"files,omitempty"`
}

// Stream handles POST /api/v1/chat/stream.
// Translates gRPC ChatStream events into AI SDK v6 UIMessageChunk SSE events.
//
// SSE format each event:
//
//	data: {"type":"text-start","id":"..."}
//	data: {"type":"text-delta","id":"...","delta":"chunk"}
//	data: {"type":"text-end","id":"..."}
//	data: {"type":"file","url":"...","mediaType":"..."}
//	data: {"type":"finish-step"}
//	data: [DONE]
func (h *ChatStreamHandler) Stream(c echo.Context) error {
	userID, ok := c.Get("userID").(string)
	if !ok || userID == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var req streamRequest
	if err := c.Bind(&req); err != nil || (req.Message == "" && len(req.Files) == 0) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "message (or files) are required"})
	}
	// Always use the authenticated identity — ignore any user_id in the body.
	req.UserID = userID

	// Set SSE headers expected by AI SDK DefaultChatTransport.
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	w := c.Response().Writer
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming not supported by ResponseWriter")
	}

	// sseEvent writes a single SSE data event and flushes.
	sseEvent := func(payload any) {
		b, _ := json.Marshal(payload)
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	// Persist user message before calling the agent.
	if req.ThreadID != "" {
		h.saveMessage(c.Request().Context(), req.ThreadID, "user", req.Message)
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 3*time.Minute)
	defer cancel()

	// Unique ID for the text part (required by text-start/text-delta/text-end).
	const textPartID = "txt"

	// Map attached files to gRPC FileInput.
	// The first file is sent as FileInput; additional files are appended as text annotations.
	// Also record user-uploaded images to the gallery immediately.
	var fileInput *starnionv1.FileInput
	var msgBuf strings.Builder
	msgBuf.WriteString(req.Message)
	for i, f := range req.Files {
		fileType := "document"
		if strings.HasPrefix(f.Mime, "image/") {
			fileType = "image"
			// Record user-uploaded image to gallery as "uploaded" type.
			RecordImage(h.db, req.UserID, f.URL, f.Name, f.Mime, 0, "web", "uploaded", req.Message)
		} else if strings.HasPrefix(f.Mime, "audio/") {
			fileType = "audio"
		}
		if i == 0 {
			fileInput = &starnionv1.FileInput{
				FileType: fileType,
				FileUrl:  f.URL,
				FileName: f.Name,
			}
		} else {
			fmt.Fprintf(&msgBuf, "\n[파일 첨부: type=%s, name=%s, url=%s]", fileType, f.Name, f.URL)
		}
	}
	message := msgBuf.String()

	stream, err := h.grpcClient.ChatStream(ctx, &starnionv1.ChatRequest{
		UserId:   req.UserID,
		Message:  message,
		ThreadId: req.ThreadID,
		Model:    req.Model,
		File:     fileInput,
	})
	if err != nil {
		log.Error().Err(err).Str("user_id", req.UserID).Msg("chat_stream: ChatStream open failed")
		sseEvent(map[string]string{"type": "error", "errorText": "agent service unavailable"})
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
		return nil
	}

	// Signal the start of a new assistant message (AI SDK v6 lifecycle).
	sseEvent(map[string]string{"type": "start"})
	sseEvent(map[string]string{"type": "start-step"})

	var assistantBuf strings.Builder
	var attachments []storage.FileAttachment
	textStarted := false

	// finish emits the closing events and optionally persists the assistant message.
	finish := func(reason string) {
		if textStarted {
			sseEvent(map[string]string{"type": "text-end", "id": textPartID})
		}
		sseEvent(map[string]string{"type": "finish-step"})
		sseEvent(map[string]any{"type": "finish", "finishReason": reason})
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
		// Use a fresh context: the request context is already canceled by the time
		// the HTTP response has been fully written.
		bg := context.Background()
		h.persistAssistant(bg, req.ThreadID, assistantBuf.String(), attachments)
		// Backfill analysis column for any image files uploaded in this request.
		// The LLM analyzed them via multimodal vision — the response IS the analysis.
		if assistantBuf.Len() > 0 {
			for _, f := range req.Files {
				if strings.HasPrefix(f.Mime, "image/") {
					h.updateImageAnalysis(bg, req.UserID, f.URL, assistantBuf.String())
				}
			}
		}
	}

	for {
		resp, err := stream.Recv()
		if err != nil {
			finish("stop")
			return nil
		}

		switch resp.Type {
		case starnionv1.ResponseType_TEXT:
			if !textStarted {
				sseEvent(map[string]string{"type": "text-start", "id": textPartID})
				textStarted = true
			}
			assistantBuf.WriteString(resp.Content)
			sseEvent(map[string]any{"type": "text-delta", "id": textPartID, "delta": resp.Content})

		case starnionv1.ResponseType_TOOL_CALL:
			log.Info().Str("tool", resp.ToolName).Str("user_id", req.UserID).Msg("chat_stream: tool call")

		case starnionv1.ResponseType_TOOL_RESULT:
			log.Info().Str("tool", resp.ToolName).Str("user_id", req.UserID).Msg("chat_stream: tool result")
			// Tool result is processed; the model's text response follows.

		case starnionv1.ResponseType_FILE:
			if h.minio != nil && len(resp.FileData) > 0 {
				att, uploadErr := h.minio.Upload(ctx, resp.FileName, resp.FileMime, resp.FileData)
				if uploadErr != nil {
					log.Warn().Err(uploadErr).Str("file", resp.FileName).Msg("chat_stream: MinIO upload failed")
					// Fallback: embed as text reference.
					if !textStarted {
						sseEvent(map[string]string{"type": "text-start", "id": textPartID})
						textStarted = true
					}
					note := fmt.Sprintf("\n[📎 %s]\n", resp.FileName)
					assistantBuf.WriteString(note)
					sseEvent(map[string]any{"type": "text-delta", "id": textPartID, "delta": note})
				} else {
					attachments = append(attachments, att)
					// Record image/audio/document to gallery tables.
					if strings.HasPrefix(att.Mime, "image/") {
						RecordImage(h.db, req.UserID, att.URL, att.Name, att.Mime, att.Size, "web", imageTypeFromFileName(resp.FileName), req.Message)
					} else if strings.HasPrefix(att.Mime, "audio/") {
						RecordAudio(h.db, req.UserID, att.URL, att.Name, att.Mime, att.Size, 0, "web", "generated", "", req.Message)
					} else if isDocumentMime(att.Mime) {
						RecordDocument(h.db, req.UserID, att.URL, att.Name, att.Mime, att.Size)
					}
					// Emit AI SDK v6 file chunk — creates a FileUIPart in the UIMessage.
					// name and size are non-standard extras; the frontend intercepts them
					// via a custom fetch middleware before the AI SDK strips them.
					sseEvent(map[string]any{
						"type":      "file",
						"url":       att.URL,
						"mediaType": att.Mime,
						"name":      att.Name,
						"size":      att.Size,
					})
				}
			} else {
				// MinIO not configured or no data — emit as text fallback.
				if !textStarted {
					sseEvent(map[string]string{"type": "text-start", "id": textPartID})
					textStarted = true
				}
				note := fmt.Sprintf("\n[📎 %s]\n", resp.FileName)
				assistantBuf.WriteString(note)
				sseEvent(map[string]any{"type": "text-delta", "id": textPartID, "delta": note})
			}

		case starnionv1.ResponseType_ERROR:
			sseEvent(map[string]string{"type": "error", "errorText": resp.Content})
			fmt.Fprintf(w, "data: [DONE]\n\n")
			flusher.Flush()
			return nil

		case starnionv1.ResponseType_STREAM_END:
			finish("stop")
			return nil
		}
	}
}

// persistAssistant saves the completed assistant message to the messages table.
func (h *ChatStreamHandler) persistAssistant(ctx context.Context, conversationID, content string, attachments []storage.FileAttachment) {
	if (content == "" && len(attachments) == 0) || conversationID == "" || h.db == nil {
		return
	}

	var attJSON []byte
	if len(attachments) > 0 {
		attJSON, _ = json.Marshal(attachments)
	}

	_, err := h.db.ExecContext(ctx, `
		INSERT INTO messages (conversation_id, role, content, attachments)
		VALUES ($1::uuid, $2, $3, $4)
	`, conversationID, "assistant", content, attJSON)
	if err != nil {
		log.Warn().Err(err).Str("conversation_id", conversationID).Msg("chat_stream: persist assistant failed")
	}
}

// updateImageAnalysis backfills the analysis column on a images row identified
// by (user_id, url). Called after streaming when the LLM response is the analysis text.
func (h *ChatStreamHandler) updateImageAnalysis(ctx context.Context, userID, url, analysis string) {
	if h.db == nil || userID == "" || url == "" || analysis == "" {
		return
	}
	_, err := h.db.ExecContext(ctx, `
		UPDATE images SET analysis = $1, type = 'analyzed'
		WHERE user_id = $2 AND url = $3
	`, analysis, userID, url)
	if err != nil {
		log.Warn().Err(err).Str("url", url).Msg("chat_stream: update image analysis failed")
	}
}

// saveMessage persists a chat message to the messages table.
func (h *ChatStreamHandler) saveMessage(ctx context.Context, conversationID, role, content string) {
	if conversationID == "" || h.db == nil {
		return
	}
	_, err := h.db.ExecContext(ctx, `
		INSERT INTO messages (conversation_id, role, content)
		VALUES ($1::uuid, $2, $3)
	`, conversationID, role, content)
	if err != nil {
		log.Warn().Err(err).Str("conversation_id", conversationID).Msg("chat_stream: saveMessage failed")
	}
}
