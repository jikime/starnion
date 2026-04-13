package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/newstarnion/gateway/internal/crypto"
	"github.com/newstarnion/gateway/internal/domain/entity"
	"github.com/newstarnion/gateway/internal/domain/repository"
	"github.com/newstarnion/gateway/internal/infrastructure/database"
)

// ChannelsRepository owns SQL and crypto for the telegram channel /
// pairing workflow. Plaintext bot tokens never leave this file.
type ChannelsRepository struct {
	db            *database.DB
	encryptionKey string
}

func NewChannelsRepository(db *database.DB, encryptionKey string) *ChannelsRepository {
	return &ChannelsRepository{db: db, encryptionKey: encryptionKey}
}

func (r *ChannelsRepository) GetTelegramSettings(ctx context.Context, userID uuid.UUID) (entity.TelegramChannelSettings, bool, error) {
	var encToken, dmPolicy, groupPolicy string
	var botUsername pgtype.Text
	var enabled bool
	err := r.db.Pool().QueryRow(ctx,
		`SELECT bot_token, COALESCE(bot_username, ''), enabled, dm_policy, group_policy
		 FROM channel_settings WHERE user_id = $1 AND channel = 'telegram'`,
		userID,
	).Scan(&encToken, &botUsername, &enabled, &dmPolicy, &groupPolicy)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.TelegramChannelSettings{}, false, nil
	}
	if err != nil {
		return entity.TelegramChannelSettings{}, false, fmt.Errorf("postgres channels get: %w", err)
	}
	plain, _ := crypto.Decrypt(encToken, r.encryptionKey)
	return entity.TelegramChannelSettings{
		Enabled:     enabled,
		BotToken:    plain,
		BotUsername: botUsername.String,
		DMPolicy:    dmPolicy,
		GroupPolicy: groupPolicy,
	}, true, nil
}

func (r *ChannelsRepository) UpsertTelegramSettings(ctx context.Context, userID uuid.UUID, upd repository.ChannelUpdate) error {
	if upd.BotToken != "" {
		enc, err := crypto.Encrypt(upd.BotToken, r.encryptionKey)
		if err != nil {
			return fmt.Errorf("postgres channels encrypt: %w", err)
		}
		_, err = r.db.Pool().Exec(ctx,
			`INSERT INTO channel_settings (user_id, channel, bot_token, enabled, dm_policy, group_policy)
			 VALUES ($1, 'telegram', $2, $3, $4, $5)
			 ON CONFLICT (user_id, channel) DO UPDATE
			   SET bot_token = EXCLUDED.bot_token, enabled = EXCLUDED.enabled,
			       dm_policy = EXCLUDED.dm_policy, group_policy = EXCLUDED.group_policy,
			       updated_at = NOW()`,
			userID, enc, upd.Enabled, upd.DMPolicy, upd.GroupPolicy,
		)
		if err != nil {
			return fmt.Errorf("postgres channels upsert (with token): %w", err)
		}
		return nil
	}
	_, err := r.db.Pool().Exec(ctx,
		`INSERT INTO channel_settings (user_id, channel, enabled, dm_policy, group_policy)
		 VALUES ($1, 'telegram', $2, $3, $4)
		 ON CONFLICT (user_id, channel) DO UPDATE
		   SET enabled = EXCLUDED.enabled,
		       dm_policy = EXCLUDED.dm_policy, group_policy = EXCLUDED.group_policy,
		       updated_at = NOW()`,
		userID, upd.Enabled, upd.DMPolicy, upd.GroupPolicy,
	)
	if err != nil {
		return fmt.Errorf("postgres channels upsert: %w", err)
	}
	return nil
}

func (r *ChannelsRepository) UpdateBotUsername(ctx context.Context, userID uuid.UUID, username string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE channel_settings SET bot_username = $1 WHERE user_id = $2 AND channel = 'telegram'`,
		username, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres channels set username: %w", err)
	}
	return nil
}

func (r *ChannelsRepository) ListPairingRequests(ctx context.Context, userID uuid.UUID) ([]entity.PairingRequest, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, telegram_id, display_name, status, requested_at
		 FROM telegram_pairing_requests
		 WHERE owner_user_id = $1 ORDER BY requested_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres pairings list: %w", err)
	}
	defer rows.Close()
	var out []entity.PairingRequest
	for rows.Next() {
		var p entity.PairingRequest
		if err := rows.Scan(&p.ID, &p.TelegramID, &p.DisplayName, &p.Status, &p.RequestedAt); err != nil {
			return nil, fmt.Errorf("postgres pairings scan: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *ChannelsRepository) ListApprovedContacts(ctx context.Context, userID uuid.UUID) ([]entity.ApprovedContact, error) {
	rows, err := r.db.Pool().Query(ctx,
		`SELECT id, telegram_id, display_name, approved_at
		 FROM telegram_approved_contacts
		 WHERE owner_user_id = $1 ORDER BY approved_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres approved list: %w", err)
	}
	defer rows.Close()
	var out []entity.ApprovedContact
	for rows.Next() {
		var a entity.ApprovedContact
		if err := rows.Scan(&a.ID, &a.TelegramID, &a.DisplayName, &a.ApprovedAt); err != nil {
			return nil, fmt.Errorf("postgres approved scan: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *ChannelsRepository) UpsertPairingRequest(ctx context.Context, userID uuid.UUID, telegramID, displayName, messageText string) (string, error) {
	var id string
	err := r.db.Pool().QueryRow(ctx,
		`INSERT INTO telegram_pairing_requests (owner_user_id, telegram_id, display_name, message_text)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (owner_user_id, telegram_id) DO UPDATE
		   SET display_name = EXCLUDED.display_name, status = 'pending'
		 RETURNING id`,
		userID, telegramID, displayName, messageText,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("postgres pairings upsert: %w", err)
	}
	return id, nil
}

func (r *ChannelsRepository) ApprovePairingTx(ctx context.Context, userID uuid.UUID, pairingID string) (string, string, bool, error) {
	var telegramID, displayName string
	err := r.db.Pool().QueryRow(ctx,
		`UPDATE telegram_pairing_requests
		 SET status = 'approved', resolved_at = NOW()
		 WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'
		 RETURNING telegram_id, display_name`,
		pairingID, userID,
	).Scan(&telegramID, &displayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("postgres pairings approve: %w", err)
	}

	if _, err := r.db.Pool().Exec(ctx,
		`INSERT INTO telegram_approved_contacts (owner_user_id, telegram_id, display_name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (owner_user_id, telegram_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
		userID, telegramID, displayName,
	); err != nil {
		return "", "", false, fmt.Errorf("postgres approved insert: %w", err)
	}

	if _, err := r.db.Pool().Exec(ctx,
		`INSERT INTO platform_identities (user_id, platform, platform_id, display_name)
		 VALUES ($1, 'telegram', $2, $3)
		 ON CONFLICT (platform, platform_id) DO UPDATE
		   SET display_name = EXCLUDED.display_name, last_active_at = NOW()`,
		userID, telegramID, displayName,
	); err != nil {
		return "", "", false, fmt.Errorf("postgres platform identities insert: %w", err)
	}

	return telegramID, displayName, true, nil
}

func (r *ChannelsRepository) DenyPairing(ctx context.Context, userID uuid.UUID, pairingID string) error {
	_, err := r.db.Pool().Exec(ctx,
		`UPDATE telegram_pairing_requests
		 SET status = 'denied', resolved_at = NOW()
		 WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'`,
		pairingID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres pairings deny: %w", err)
	}
	return nil
}

// Compile-time guarantee the Postgres impl satisfies the port.
var _ repository.ChannelsRepository = (*ChannelsRepository)(nil)
