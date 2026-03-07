-- Migration 013: channel_settings
-- Stores global bot-level channel configuration (DM/Group policies, etc.)
-- These are bot-wide settings, not per-user.

CREATE TABLE IF NOT EXISTS channel_settings (
    channel    TEXT        NOT NULL,               -- 'telegram', etc.
    key        TEXT        NOT NULL,               -- 'dm_policy', 'group_policy'
    value      TEXT        NOT NULL DEFAULT '',    -- policy value
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel, key)
);

-- Default Telegram settings
INSERT INTO channel_settings (channel, key, value)
VALUES
    ('telegram', 'dm_policy',    'allow'),
    ('telegram', 'group_policy', 'allow')
ON CONFLICT DO NOTHING;
