package scheduler

import (
	"sync"
	"time"

	"github.com/jikime/starnion/gateway/internal/activity"
	"github.com/rs/zerolog/log"
)

const (
	maxDailyNotifications = 3
	quietHourStart        = 22 // 22:00 KST
	quietHourEnd          = 8  // 08:00 KST
	conversationCooldown  = 1 * time.Hour
)

// notifState tracks per-user daily notification count.
type notifState struct {
	count     int
	resetDate string // "2006-01-02" format, reset counter when date changes
}

// fatigueManager manages notification fatigue rules.
type fatigueManager struct {
	mu      sync.RWMutex
	states  map[string]*notifState
	tracker *activity.Tracker
	loc     *time.Location
}

// newFatigueManager creates a new fatigue manager.
func newFatigueManager(tracker *activity.Tracker, loc *time.Location) *fatigueManager {
	return &fatigueManager{
		states:  make(map[string]*notifState),
		tracker: tracker,
		loc:     loc,
	}
}

// canNotify checks all fatigue conditions for a user.
// Returns true if the notification should be sent.
func (fm *fatigueManager) canNotify(userID string, preferences map[string]any) bool {
	// 1. Check if notifications are enabled (opt-out model, default true).
	if !notificationsEnabled(preferences) {
		log.Debug().Str("user_id", userID).Msg("notifications disabled by user preference")
		return false
	}

	// 2. Check quiet hours (22:00-08:00 KST).
	if fm.isQuietHours() {
		log.Debug().Str("user_id", userID).Msg("notification blocked: quiet hours")
		return false
	}

	// 3. Check if user is in active conversation (message within last hour).
	if fm.isRecentConversation(userID) {
		log.Debug().Str("user_id", userID).Msg("notification deferred: active conversation")
		return false
	}

	// 4. Check daily notification limit.
	if fm.dailyCount(userID) >= maxDailyNotifications {
		log.Debug().Str("user_id", userID).Int("count", maxDailyNotifications).Msg("notification blocked: daily limit reached")
		return false
	}

	return true
}

// recordNotification increments the daily counter for a user.
func (fm *fatigueManager) recordNotification(userID string) {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	today := time.Now().In(fm.loc).Format("2006-01-02")
	state, ok := fm.states[userID]
	if !ok || state.resetDate != today {
		fm.states[userID] = &notifState{count: 1, resetDate: today}
		return
	}
	state.count++
}

// isQuietHours checks if current KST time is between 22:00 and 08:00.
func (fm *fatigueManager) isQuietHours() bool {
	hour := time.Now().In(fm.loc).Hour()
	return hour >= quietHourStart || hour < quietHourEnd
}

// isRecentConversation checks if user sent a message within the cooldown period.
func (fm *fatigueManager) isRecentConversation(userID string) bool {
	if fm.tracker == nil {
		return false
	}
	lastMsg, ok := fm.tracker.LastMessageTime(userID)
	if !ok {
		return false
	}
	return time.Since(lastMsg) < conversationCooldown
}

// dailyCount returns the current notification count for a user today.
func (fm *fatigueManager) dailyCount(userID string) int {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	today := time.Now().In(fm.loc).Format("2006-01-02")
	state, ok := fm.states[userID]
	if !ok || state.resetDate != today {
		return 0
	}
	return state.count
}

// notificationsEnabled checks users.preferences for notification opt-out.
// Default is true (opt-out model). User sets {"notifications": {"enabled": false}} to disable.
func notificationsEnabled(preferences map[string]any) bool {
	if preferences == nil {
		return true
	}

	notifRaw, ok := preferences["notifications"]
	if !ok {
		return true
	}

	notifMap, ok := notifRaw.(map[string]any)
	if !ok {
		return true
	}

	enabled, ok := notifMap["enabled"]
	if !ok {
		return true
	}

	b, ok := enabled.(bool)
	if !ok {
		return true
	}
	return b
}
