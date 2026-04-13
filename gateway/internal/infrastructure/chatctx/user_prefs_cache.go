package chatctx

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// userPrefsEntry is a cached snapshot of a user's preference fields.
type userPrefsEntry struct {
	timezone  string
	language  string
	fetchedAt time.Time
}

var (
	userPrefsCache sync.Map // uuid.UUID → userPrefsEntry
	userPrefsTTL   = 5 * time.Minute
)

// init starts a janitor goroutine that periodically evicts stale entries
// from userPrefsCache. Without it the map grew unbounded: every user
// that logged in became a permanent cache resident. The janitor runs on
// a 10-minute tick (2× TTL) so entries only hang around for ~15 minutes
// after their owner goes idle.
func init() {
	go func() {
		t := time.NewTicker(2 * userPrefsTTL)
		defer t.Stop()
		for now := range t.C {
			userPrefsCache.Range(func(k, v any) bool {
				e, ok := v.(userPrefsEntry)
				if !ok || now.Sub(e.fetchedAt) > userPrefsTTL {
					userPrefsCache.Delete(k)
				}
				return true
			})
		}
	}()
}

// CachedUserPrefs returns the user's timezone and language from a 5-minute
// in-process cache. Falls back to ("UTC", "") on DB error.
// Call site can ignore either return value when only one field is needed.
func CachedUserPrefs(ctx context.Context, db *database.DB, userID uuid.UUID) (timezone, language string) {
	if v, ok := userPrefsCache.Load(userID); ok {
		e := v.(userPrefsEntry)
		if time.Since(e.fetchedAt) < userPrefsTTL {
			return e.timezone, e.language
		}
	}
	// Cache miss or stale — fetch from DB.
	timezone = "Asia/Seoul"
	_ = db.Pool().QueryRow(ctx,
		`SELECT COALESCE(preferences->>'timezone', 'Asia/Seoul'),
		        COALESCE(preferences->>'language', '')
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&timezone, &language)
	userPrefsCache.Store(userID, userPrefsEntry{
		timezone:  timezone,
		language:  language,
		fetchedAt: time.Now(),
	})
	return timezone, language
}
