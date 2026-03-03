package wschat

// FrameType identifies the kind of WebSocket message.
type FrameType string

const (
	// Client → Server
	FrameRequest FrameType = "req" // chat request

	// Server → Client
	FrameResponse FrameType = "res"   // final response (non-streaming)
	FrameEvent    FrameType = "event" // streaming event

	// Event names (used in OutFrame.Event)
	EventText       = "text"        // incremental text chunk
	EventToolCall   = "tool_call"   // tool invocation started
	EventToolResult = "tool_result" // tool result received
	EventFile       = "file"        // file attachment from agent
	EventError      = "error"       // error during stream
	EventDone       = "done"        // stream finished
)

// InFrame is a message sent from the browser to the server.
type InFrame struct {
	Type   FrameType      `json:"type"`   // always "req"
	ID     string         `json:"id"`     // client-generated request ID
	Method string         `json:"method"` // e.g. "chat"
	Params map[string]any `json:"params"` // method-specific payload
}

// OutFrame is a message sent from the server to the browser.
type OutFrame struct {
	Type    FrameType `json:"type"`
	ID      string    `json:"id,omitempty"` // echoes InFrame.ID for "res" frames
	OK      bool      `json:"ok,omitempty"` // true on success for "res" frames
	Payload any       `json:"payload,omitempty"`
	Event   string    `json:"event,omitempty"` // event name for "event" frames
}
