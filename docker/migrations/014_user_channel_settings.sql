-- Migration 014: user_channel_settings
-- Per-user channel configuration (bot token, enabled flag, DM/Group policies).
-- Each user can register their own Telegram bot and configure its behaviour independently.

CREATE TABLE IF NOT EXISTS user_channel_settings (
    user_id    TEXT        NOT NULL,               -- references users.id (NextAuth)
    channel    TEXT        NOT NULL,               -- 'telegram'
    bot_token  TEXT        NOT NULL DEFAULT '',    -- encrypted bot token
    enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy  TEXT        NOT NULL DEFAULT 'allow',   -- allow | pairing | deny
    group_policy TEXT      NOT NULL DEFAULT 'allow',   -- allow | mention | deny
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_user_channel_settings_channel
    ON user_channel_settings (channel);
