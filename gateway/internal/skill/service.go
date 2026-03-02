package skill

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// SkillView represents a skill with its user-specific enabled state.
type SkillView struct {
	ID          string
	Name        string
	Description string
	Category    string
	Emoji       string
	Enabled     bool
	Permission  int // 0=system, 1=default, 2=opt-in, 3=admin
	SortOrder   int
}

type cacheEntry struct {
	skills    map[string]bool // skillID -> enabled
	expiresAt time.Time
}

// Service provides skill management with in-memory caching.
type Service struct {
	db    *sql.DB
	cache map[string]*cacheEntry // userID -> cache
	mu    sync.RWMutex
	ttl   time.Duration
}

// New creates a new skill service.
func New(db *sql.DB) *Service {
	return &Service{
		db:    db,
		cache: make(map[string]*cacheEntry),
		ttl:   5 * time.Minute,
	}
}

// IsEnabled checks if a skill is enabled for a user.
func (s *Service) IsEnabled(userID, skillID string) bool {
	// Check cache first.
	s.mu.RLock()
	entry, ok := s.cache[userID]
	s.mu.RUnlock()

	if ok && time.Now().Before(entry.expiresAt) {
		enabled, exists := entry.skills[skillID]
		if exists {
			return enabled
		}
	}

	// Cache miss: query DB.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var enabled bool
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(us.enabled, sk.enabled_by_default)
		FROM skills sk
		LEFT JOIN user_skills us ON us.skill_id = sk.id AND us.user_id = $1
		WHERE sk.id = $2
	`, userID, skillID).Scan(&enabled)

	if err != nil {
		if err == sql.ErrNoRows {
			return true // Unknown skill defaults to enabled.
		}
		log.Warn().Err(err).Str("user_id", userID).Str("skill_id", skillID).Msg("skill check failed")
		return true // Fail open.
	}

	// Update cache.
	s.mu.Lock()
	if s.cache[userID] == nil || time.Now().After(s.cache[userID].expiresAt) {
		s.cache[userID] = &cacheEntry{
			skills:    make(map[string]bool),
			expiresAt: time.Now().Add(s.ttl),
		}
	}
	s.cache[userID].skills[skillID] = enabled
	s.mu.Unlock()

	return enabled
}

// Toggle flips a skill's enabled state for a user. Returns the new state.
func (s *Service) Toggle(userID, skillID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check permission level (system skills cannot be toggled).
	var permLevel int
	err := s.db.QueryRowContext(ctx, `SELECT permission_level FROM skills WHERE id = $1`, skillID).Scan(&permLevel)
	if err != nil {
		return false, fmt.Errorf("skill not found: %s", skillID)
	}
	if permLevel == 0 {
		return false, fmt.Errorf("system skill cannot be toggled")
	}

	// Get current effective state.
	var currentEnabled bool
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(us.enabled, sk.enabled_by_default)
		FROM skills sk
		LEFT JOIN user_skills us ON us.skill_id = sk.id AND us.user_id = $1
		WHERE sk.id = $2
	`, userID, skillID).Scan(&currentEnabled)
	if err != nil {
		return false, fmt.Errorf("check current state: %w", err)
	}

	newEnabled := !currentEnabled

	// UPSERT user_skills.
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO user_skills (user_id, skill_id, enabled, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id, skill_id)
		DO UPDATE SET enabled = $3, updated_at = NOW()
	`, userID, skillID, newEnabled)
	if err != nil {
		return false, fmt.Errorf("toggle skill: %w", err)
	}

	// Invalidate cache for this user.
	s.InvalidateCache(userID)

	return newEnabled, nil
}

// GetUserSkills returns all skills with user-specific enabled state.
func (s *Service) GetUserSkills(userID string) ([]SkillView, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, `
		SELECT sk.id, sk.name, sk.description, sk.category, sk.emoji,
		       COALESCE(us.enabled, sk.enabled_by_default) AS enabled,
		       sk.permission_level, sk.sort_order
		FROM skills sk
		LEFT JOIN user_skills us ON us.skill_id = sk.id AND us.user_id = $1
		WHERE sk.permission_level > 0
		ORDER BY sk.sort_order, sk.id
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query skills: %w", err)
	}
	defer rows.Close()

	var skills []SkillView
	for rows.Next() {
		var sv SkillView
		if err := rows.Scan(&sv.ID, &sv.Name, &sv.Description, &sv.Category,
			&sv.Emoji, &sv.Enabled, &sv.Permission, &sv.SortOrder); err != nil {
			return nil, fmt.Errorf("scan skill: %w", err)
		}
		skills = append(skills, sv)
	}
	return skills, rows.Err()
}

// InvalidateCache removes cached skill data for a user.
func (s *Service) InvalidateCache(userID string) {
	s.mu.Lock()
	delete(s.cache, userID)
	s.mu.Unlock()
}
