package chatctx

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// configCache is a generic per-user TTL cache for chat hot-path
// lookups that change rarely but are queried on every single message
// (ResolveAssignedModel, ResolveSkillEnv, ResolveFallbackChain,
// ResolveDisabledSkillsJSON). Without caching, each chat message
// issues 4 separate DB queries for these values — consuming 4 pool
// connections per message and adding ~15-30ms of overhead.
//
// The cache key is userID; the value is an opaque any. Each function
// stores its own type and type-asserts on read.
//
// TTL is 5 minutes, matching userPrefsCache. The janitor goroutine
// evicts stale entries on a 10-minute tick.
type configCacheEntry struct {
	value     any
	fetchedAt time.Time
}

var (
	configCacheMu  sync.Map // uuid.UUID → configCacheEntry
	configCacheTTL = 5 * time.Minute
)

func init() {
	go func() {
		t := time.NewTicker(2 * configCacheTTL)
		defer t.Stop()
		for now := range t.C {
			configCacheMu.Range(func(k, v any) bool {
				e, ok := v.(configCacheEntry)
				if !ok || now.Sub(e.fetchedAt) > configCacheTTL {
					configCacheMu.Delete(k)
				}
				return true
			})
		}
	}()
}

// configCacheKey combines a user ID with a function discriminator so
// different cached values for the same user don't collide.
type configCacheKey struct {
	userID uuid.UUID
	fn     string
}

func loadCached(userID uuid.UUID, fn string) (any, bool) {
	v, ok := configCacheMu.Load(configCacheKey{userID, fn})
	if !ok {
		return nil, false
	}
	e := v.(configCacheEntry)
	if time.Since(e.fetchedAt) > configCacheTTL {
		return nil, false
	}
	return e.value, true
}

func storeCached(userID uuid.UUID, fn string, value any) {
	configCacheMu.Store(configCacheKey{userID, fn}, configCacheEntry{
		value:     value,
		fetchedAt: time.Now(),
	})
}
