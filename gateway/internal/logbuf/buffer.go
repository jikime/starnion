// Package logbuf provides an in-memory ring buffer for log entries with SSE fan-out.
package logbuf

import (
	"encoding/json"
	"strings"
	"sync"
	"time"
)

const maxEntries = 2000

// Entry represents a single parsed log entry.
type Entry struct {
	Time    time.Time `json:"time"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
	Source  string    `json:"source,omitempty"`
	Error   string    `json:"error,omitempty"`
	Raw     string    `json:"raw"`
}

// Buffer is a thread-safe ring buffer with SSE subscriber fan-out.
type Buffer struct {
	mu      sync.RWMutex
	entries []Entry

	subsMu sync.RWMutex
	subs   map[chan Entry]struct{}
}

// New creates a new Buffer.
func New() *Buffer {
	return &Buffer{
		entries: make([]Entry, 0, maxEntries),
		subs:    make(map[chan Entry]struct{}),
	}
}

// Write implements io.Writer so it can be used as a zerolog writer.
func (b *Buffer) Write(p []byte) (int, error) {
	entry := b.parse(p)

	b.mu.Lock()
	if len(b.entries) >= maxEntries {
		b.entries = b.entries[1:]
	}
	b.entries = append(b.entries, entry)
	b.mu.Unlock()

	// Fan-out to SSE subscribers (non-blocking).
	b.subsMu.RLock()
	for ch := range b.subs {
		select {
		case ch <- entry:
		default: // drop if subscriber is slow
		}
	}
	b.subsMu.RUnlock()

	return len(p), nil
}

// parse turns a zerolog JSON line into an Entry.
func (b *Buffer) parse(p []byte) Entry {
	entry := Entry{
		Time: time.Now(),
		Raw:  strings.TrimRight(string(p), "\n"),
	}

	var m map[string]any
	if err := json.Unmarshal(p, &m); err != nil {
		entry.Level = "info"
		entry.Message = entry.Raw
		return entry
	}

	if t, ok := m["time"].(string); ok {
		if pt, err := time.Parse(time.RFC3339, t); err == nil {
			entry.Time = pt
		}
	}
	if v, ok := m["level"].(string); ok {
		entry.Level = v
	} else {
		entry.Level = "info"
	}
	if v, ok := m["message"].(string); ok {
		entry.Message = v
	}
	if v, ok := m["error"].(string); ok {
		entry.Error = v
	}
	// Infer source from common zerolog fields.
	for _, key := range []string{"component", "module", "caller", "service"} {
		if v, ok := m[key].(string); ok && v != "" {
			// Trim path prefix for caller (e.g. "handler/chat.go:42" → "handler")
			if key == "caller" {
				if idx := strings.Index(v, "/"); idx >= 0 {
					v = v[:idx]
				} else if idx := strings.Index(v, ".go"); idx >= 0 {
					v = v[:idx]
				}
			}
			entry.Source = v
			break
		}
	}

	return entry
}

// Recent returns the last n entries (oldest first).
func (b *Buffer) Recent(n int) []Entry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	total := len(b.entries)
	if n <= 0 || n > total {
		n = total
	}
	result := make([]Entry, n)
	copy(result, b.entries[total-n:])
	return result
}

// Subscribe returns a channel that receives new log entries in real time.
func (b *Buffer) Subscribe() chan Entry {
	ch := make(chan Entry, 256)
	b.subsMu.Lock()
	b.subs[ch] = struct{}{}
	b.subsMu.Unlock()
	return ch
}

// Unsubscribe removes and closes a subscriber channel.
func (b *Buffer) Unsubscribe(ch chan Entry) {
	b.subsMu.Lock()
	delete(b.subs, ch)
	b.subsMu.Unlock()
	close(ch)
}
