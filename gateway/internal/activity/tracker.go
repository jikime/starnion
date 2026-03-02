package activity

import (
	"sync"
	"time"
)

// Tracker records the last message timestamp per Telegram user.
// Bot writes via RecordMessage; Scheduler reads via LastMessageTime.
// Safe for concurrent access.
type Tracker struct {
	mu          sync.RWMutex
	lastMessage map[string]time.Time
}

// NewTracker creates a new activity tracker.
func NewTracker() *Tracker {
	return &Tracker{
		lastMessage: make(map[string]time.Time),
	}
}

// RecordMessage updates the last message time for a user.
func (t *Tracker) RecordMessage(telegramID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lastMessage[telegramID] = time.Now()
}

// LastMessageTime returns the last message time for a user.
// Returns zero time and false if no message recorded.
func (t *Tracker) LastMessageTime(telegramID string) (time.Time, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	ts, ok := t.lastMessage[telegramID]
	return ts, ok
}
