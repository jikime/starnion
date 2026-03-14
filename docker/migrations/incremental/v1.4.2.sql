-- =============================================================
-- v1.4.2 — Add channel_settings, telegram_approved_contacts, telegram_pairing_requests
--
-- Changes:
--   1. channel_settings 테이블 신규 생성
--   2. telegram_approved_contacts 테이블 신규 생성
--   3. telegram_pairing_requests 테이블 신규 생성
--
-- Date: 2026-03-14
-- Idempotent: safe to run multiple times (IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).
-- =============================================================

-- ─── 1. channel_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_settings (
    user_id      TEXT        NOT NULL,
    channel      TEXT        NOT NULL,
    bot_token    TEXT        NOT NULL DEFAULT '',
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy    TEXT        NOT NULL DEFAULT 'allow',   -- allow | pairing | deny
    group_policy TEXT        NOT NULL DEFAULT 'allow',   -- allow | mention | deny
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_channel_settings_channel
    ON channel_settings (channel);

-- ─── 2. telegram_approved_contacts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_approved_contacts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id TEXT        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_approved_contacts_owner
    ON telegram_approved_contacts (owner_user_id);

-- ─── 3. telegram_pairing_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id TEXT        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    message_text  TEXT        NOT NULL DEFAULT '',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | denied
    resolved_at   TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_owner_status
    ON telegram_pairing_requests (owner_user_id, status);

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.4.2') ON CONFLICT DO NOTHING;
