package logbuffer

import (
	"sync"
	"time"
)

const ringSize = 1000

// Entry is a single log line stored in the ring buffer.
type Entry struct {
	Time    time.Time `json:"time"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
	Source  string    `json:"source"` // "gateway" | "agent"
}

// Hub stores recent log entries in a ring buffer and broadcasts new entries
// to registered SSE subscribers. It is safe for concurrent use.
type Hub struct {
	mu          sync.Mutex
	ring        [ringSize]Entry
	head        int // next write position (absolute, wraps via % ringSize)
	count       int // number of valid entries in the ring (capped at ringSize)
	subscribers map[chan Entry]struct{}
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{
		subscribers: make(map[chan Entry]struct{}),
	}
}

// Write appends an entry to the ring buffer and broadcasts it to subscribers.
func (h *Hub) Write(e Entry) {
	h.mu.Lock()
	h.ring[h.head%ringSize] = e
	h.head++
	if h.count < ringSize {
		h.count++
	}
	subs := make([]chan Entry, 0, len(h.subscribers))
	for ch := range h.subscribers {
		subs = append(subs, ch)
	}
	h.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- e:
		default: // slow subscriber; skip rather than block
		}
	}
}

// Snapshot returns up to n most-recent entries, oldest first.
func (h *Hub) Snapshot(n int) []Entry {
	h.mu.Lock()
	defer h.mu.Unlock()

	if n > h.count {
		n = h.count
	}
	if n == 0 {
		return nil
	}
	out := make([]Entry, n)
	start := h.head - n // always >= 0 since n <= count <= head
	for i := 0; i < n; i++ {
		out[i] = h.ring[(start+i)%ringSize]
	}
	return out
}

// Subscribe returns a buffered channel that receives new entries going forward.
func (h *Hub) Subscribe() chan Entry {
	ch := make(chan Entry, 64)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes the channel from the hub.
func (h *Hub) Unsubscribe(ch chan Entry) {
	h.mu.Lock()
	delete(h.subscribers, ch)
	h.mu.Unlock()
}
