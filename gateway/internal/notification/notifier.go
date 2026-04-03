// Package notification provides a platform-agnostic notification dispatch system.
//
// Adding a new platform (e.g. Discord, Slack) requires only:
//  1. Implementing the Notifier interface in a new file.
//  2. Registering it via NewDispatcher in server.go.
//
// No changes to scheduler, server wiring, or existing notifiers are needed.
package notification

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/newstarnion/gateway/internal/infrastructure/database"
	"go.uber.org/zap"
)

// Notifier delivers a notification to a user on a specific platform.
type Notifier interface {
	// Platform returns the platform identifier (e.g. "telegram", "discord", "slack").
	Platform() string

	// Send delivers the message. Returns nil if the user has not linked this
	// platform (silent skip) or on success. Non-nil errors are logged by Dispatcher.
	Send(ctx context.Context, userID, notifType, message string) error
}

// Dispatcher fans out a notification to all Notifiers whose platform appears
// in the user's preferences.notifications.channels list.
//
// Default channel when the user has no preference: ["telegram"].
type Dispatcher struct {
	db       *database.DB
	notifiers map[string]Notifier
	logger   *zap.Logger
}

// NewDispatcher creates a Dispatcher with the supplied Notifier implementations.
func NewDispatcher(db *database.DB, logger *zap.Logger, notifiers ...Notifier) *Dispatcher {
	m := make(map[string]Notifier, len(notifiers))
	for _, n := range notifiers {
		m[n.Platform()] = n
	}
	return &Dispatcher{db: db, notifiers: m, logger: logger}
}

// Dispatch sends the notification to every enabled channel for the user.
// Failures on individual channels are logged but do not stop other channels.
func (d *Dispatcher) Dispatch(ctx context.Context, userID, notifType, message string) error {
	channels := d.enabledChannels(ctx, userID)

	for _, ch := range channels {
		n, ok := d.notifiers[ch]
		if !ok {
			continue
		}
		if err := n.Send(ctx, userID, notifType, message); err != nil {
			d.logger.Warn("notification: send failed",
				zap.String("platform", ch),
				zap.String("user_id", userID),
				zap.String("type", notifType),
				zap.Error(err))
		}
	}
	return nil
}

// enabledChannels reads preferences -> notifications -> channels from the user row.
// Falls back to defaultChannels when the preference is absent or malformed.
func (d *Dispatcher) enabledChannels(ctx context.Context, userID string) []string {
	var prefsJSON sql.NullString
	d.db.QueryRowContext(ctx,
		`SELECT preferences FROM users WHERE id = $1::uuid`, userID,
	).Scan(&prefsJSON)

	if !prefsJSON.Valid || prefsJSON.String == "" {
		return defaultChannels
	}

	var prefs map[string]any
	if json.Unmarshal([]byte(prefsJSON.String), &prefs) != nil {
		return defaultChannels
	}

	notifRaw, _ := prefs["notifications"]
	notif, ok := notifRaw.(map[string]any)
	if !ok {
		return defaultChannels
	}

	chRaw, _ := notif["channels"]
	chArr, ok := chRaw.([]any)
	if !ok {
		return defaultChannels
	}

	result := make([]string, 0, len(chArr))
	for _, c := range chArr {
		if s, ok := c.(string); ok && s != "" {
			result = append(result, s)
		}
	}
	if len(result) == 0 {
		return defaultChannels
	}
	return result
}

// defaultChannels is used when a user has no notification channel preference.
var defaultChannels = []string{"telegram"}
