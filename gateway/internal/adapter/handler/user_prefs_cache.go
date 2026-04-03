package handler

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
	userPrefsCache sync.Map        // uuid.UUID → userPrefsEntry
	userPrefsTTL   = 5 * time.Minute
)

// cachedUserPrefs returns the user's timezone and language from a 5-minute
// in-process cache. Falls back to ("UTC", "") on DB error.
// Call site can ignore either return value when only one field is needed.
func cachedUserPrefs(ctx context.Context, db *database.DB, userID uuid.UUID) (timezone, language string) {
	if v, ok := userPrefsCache.Load(userID); ok {
		e := v.(userPrefsEntry)
		if time.Since(e.fetchedAt) < userPrefsTTL {
			return e.timezone, e.language
		}
	}
	// Cache miss or stale — fetch from DB.
	timezone = "Asia/Seoul"
	_ = db.QueryRowContext(ctx,
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
