package wschat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	starnionv1 "github.com/jikime/starnion/gateway/gen/starnion/v1"
	"github.com/jikime/starnion/gateway/internal/storage"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 50 * time.Second
	maxMessageSize = 64 * 1024 // 64 KB
	sendBufSize    = 64
)

// Hub manages all active WebSocket client connections.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // userID → client

	grpcClient starnionv1.AgentServiceClient
	db         *sql.DB
	store      *storage.MinIO // nil = file upload disabled
}

// NewHub creates a Hub backed by the gRPC agent service.
func NewHub(grpcClient starnionv1.AgentServiceClient, db *sql.DB, store *storage.MinIO) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		grpcClient: grpcClient,
		db:         db,
		store:      store,
	}
}

// saveMessage persists a chat message (with optional file attachments) to the messages table.
func (h *Hub) saveMessage(conversationID, role, content string, attachments []storage.FileAttachment) {
	if h.db == nil || conversationID == "" {
		return
	}
	var attJSON []byte
	if len(attachments) > 0 {
		var err error
		attJSON, err = json.Marshal(attachments)
		if err != nil {
			log.Warn().Err(err).Msg("ws: marshal attachments failed")
		}
	}
	_, err := h.db.ExecContext(context.Background(), `
		INSERT INTO messages (conversation_id, role, content, attachments)
		VALUES ($1::uuid, $2, $3, $4)
	`, conversationID, role, content, attJSON)
	if err != nil {
		log.Warn().Err(err).Str("conversation_id", conversationID).Msg("ws: saveMessage failed")
	}
}

// IsConnected reports whether a user currently has a live WebSocket connection.
func (h *Hub) IsConnected(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
}

// Push sends an event frame to the user if connected. Returns false when not connected.
func (h *Hub) Push(userID, event string, payload any) bool {
	h.mu.RLock()
	c, ok := h.clients[userID]
	h.mu.RUnlock()
	if !ok {
		return false
	}
	frame := OutFrame{Type: FrameEvent, Event: event, Payload: payload}
	select {
	case c.send <- frame:
		return true
	default:
		return false
	}
}

// register adds a client to the hub.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Close any existing connection for this user.
	if old, ok := h.clients[c.userID]; ok {
		close(old.send)
	}
	h.clients[c.userID] = c
}

// unregister removes a client from the hub.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[c.userID] == c {
		delete(h.clients, c.userID)
	}
}

// Client represents a single browser connection.
type Client struct {
	hub    *Hub
	userID string
	conn   *websocket.Conn
	send   chan OutFrame
}

// NewClient creates and registers a client, then starts its pump goroutines.
func NewClient(hub *Hub, userID string, conn *websocket.Conn) *Client {
	c := &Client{
		hub:    hub,
		userID: userID,
		conn:   conn,
		send:   make(chan OutFrame, sendBufSize),
	}
	hub.register(c)
	go c.writePump()
	go c.readPump()
	return c
}

// readPump reads frames from the browser and dispatches them.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Warn().Err(err).Str("user_id", c.userID).Msg("ws: unexpected close")
			}
			break
		}

		var frame InFrame
		if err := json.Unmarshal(data, &frame); err != nil {
			c.sendError(frame.ID, "invalid frame format")
			continue
		}

		switch frame.Method {
		case "chat":
			go c.handleChatMessage(frame)
		default:
			c.sendError(frame.ID, fmt.Sprintf("unknown method: %s", frame.Method))
		}
	}
}

// writePump delivers outbound frames and sends WebSocket pings.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case frame, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteJSON(frame); err != nil {
				log.Warn().Err(err).Str("user_id", c.userID).Msg("ws: write error")
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// verifyConversationOwner checks that convID belongs to userID.
// Returns true when the DB is unavailable (to avoid blocking dev mode).
func (h *Hub) verifyConversationOwner(convID, userID string) bool {
	if h.db == nil {
		return true
	}
	var ownerID string
	err := h.db.QueryRowContext(context.Background(),
		`SELECT user_id FROM conversations WHERE id = $1::uuid`, convID,
	).Scan(&ownerID)
	return err == nil && ownerID == userID
}

// handleChatMessage opens a gRPC ChatStream and relays events to the browser.
func (c *Client) handleChatMessage(frame InFrame) {
	message, _ := frame.Params["message"].(string)
	if message == "" {
		c.sendError(frame.ID, "message is required")
		return
	}

	model, _ := frame.Params["model"].(string)
	threadID, _ := frame.Params["thread_id"].(string)

	// Verify the conversation belongs to this user (prevents cross-user writes via WebSocket).
	if threadID != "" && !c.hub.verifyConversationOwner(threadID, c.userID) {
		c.sendError(frame.ID, "conversation not found")
		log.Warn().Str("user_id", c.userID).Str("thread_id", threadID).Msg("ws: unauthorized conversation access attempt")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Save user message immediately.
	c.hub.saveMessage(threadID, "user", message, nil)

	stream, err := c.hub.grpcClient.ChatStream(ctx, &starnionv1.ChatRequest{
		UserId:   c.userID,
		Message:  message,
		Model:    model,
		ThreadId: threadID,
	})
	if err != nil {
		c.sendError(frame.ID, "agent service unavailable")
		log.Error().Err(err).Str("user_id", c.userID).Msg("ws: ChatStream open failed")
		return
	}

	var assistantBuf strings.Builder
	var attachments []storage.FileAttachment

	for {
		resp, err := stream.Recv()
		if err != nil {
			// gRPC stream ended unexpectedly — send "done" event.
			c.send <- OutFrame{Type: FrameEvent, ID: frame.ID, Event: EventDone}
			break
		}

		switch resp.Type {
		case starnionv1.ResponseType_TEXT:
			assistantBuf.WriteString(resp.Content)
			c.send <- OutFrame{
				Type:    FrameEvent,
				ID:      frame.ID,
				Event:   EventText,
				Payload: map[string]any{"text": resp.Content},
			}

		case starnionv1.ResponseType_TOOL_CALL:
			c.send <- OutFrame{
				Type:  FrameEvent,
				ID:    frame.ID,
				Event: EventToolCall,
				Payload: map[string]any{
					"tool": resp.ToolName,
					"text": resp.Content,
				},
			}

		case starnionv1.ResponseType_TOOL_RESULT:
			c.send <- OutFrame{
				Type:  FrameEvent,
				ID:    frame.ID,
				Event: EventToolResult,
				Payload: map[string]any{
					"tool":   resp.ToolName,
					"result": resp.ToolResult,
				},
			}

		case starnionv1.ResponseType_FILE:
			att, uploadErr := c.hub.uploadFile(ctx, resp.FileName, resp.FileMime, resp.FileData)
			if uploadErr != nil {
				log.Warn().Err(uploadErr).Str("file", resp.FileName).Msg("ws: file upload failed")
				continue
			}
			attachments = append(attachments, att)
			// Record image/audio to gallery tables.
			if strings.HasPrefix(att.Mime, "image/") {
				recordImage(c.hub.db, c.userID, att.URL, att.Name, att.Mime, att.Size, "webchat", wsImageType(resp.FileName), message)
			} else if strings.HasPrefix(att.Mime, "audio/") {
				recordAudio(c.hub.db, c.userID, att.URL, att.Name, att.Mime, att.Size, 0, "webchat", "generated", "", message)
			}
			c.send <- OutFrame{
				Type:  FrameEvent,
				ID:    frame.ID,
				Event: EventFile,
				Payload: map[string]any{
					"name": att.Name,
					"mime": att.Mime,
					"url":  att.URL,
					"size": att.Size,
				},
			}

		case starnionv1.ResponseType_ERROR:
			c.send <- OutFrame{
				Type:    FrameEvent,
				ID:      frame.ID,
				Event:   EventError,
				Payload: map[string]any{"message": resp.Content},
			}

		case starnionv1.ResponseType_STREAM_END:
			// Save completed assistant message with any file attachments.
			if assistantBuf.Len() > 0 || len(attachments) > 0 {
				c.hub.saveMessage(threadID, "assistant", assistantBuf.String(), attachments)
			}
			c.send <- OutFrame{Type: FrameEvent, ID: frame.ID, Event: EventDone}
			return
		}
	}
}

// uploadFile uploads file bytes to MinIO and returns the attachment metadata.
// Falls back gracefully when MinIO is not configured.
func (h *Hub) uploadFile(ctx context.Context, name, mime string, data []byte) (storage.FileAttachment, error) {
	if h.store == nil {
		return storage.FileAttachment{}, fmt.Errorf("storage not configured")
	}
	return h.store.Upload(ctx, name, mime, data)
}

// recordImage inserts an image row into images (fire-and-forget).
func recordImage(db *sql.DB, userID, url, name, mime string, size int64, source, imgType, prompt string) {
	if db == nil || !strings.HasPrefix(mime, "image/") {
		return
	}
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO images (user_id, url, name, mime, size, source, type, prompt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, userID, url, name, mime, size, source, imgType, prompt)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("ws: record image failed")
	}
}

// wsImageType infers 'generated' or 'edited' from agent file name.
func wsImageType(name string) string {
	if strings.HasPrefix(name, "edited") {
		return "edited"
	}
	return "generated"
}

// recordAudio inserts an audio row into audios (fire-and-forget).
func recordAudio(db *sql.DB, userID, url, name, mime string, size int64, duration int, source, audioType, transcript, prompt string) {
	if db == nil || !strings.HasPrefix(mime, "audio/") {
		return
	}
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO audios (user_id, url, name, mime, size, duration, source, type, transcript, prompt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, userID, url, name, mime, size, duration, source, audioType, transcript, prompt)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("ws: record audio failed")
	}
}

// sendError delivers an error response frame to the browser.
func (c *Client) sendError(requestID, message string) {
	c.send <- OutFrame{
		Type:    FrameResponse,
		ID:      requestID,
		OK:      false,
		Payload: map[string]any{"message": message},
	}
}
