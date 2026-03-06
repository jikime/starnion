-- =============================================================
-- JIKI Database Schema — Complete Fresh-Install Version
-- Incorporates all migrations (001-006)
-- PostgreSQL 16 + pgvector
-- =============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================
-- IDENTITY & AUTH
-- =============================================================

-- Central users table (UUID stored as TEXT)
CREATE TABLE IF NOT EXISTS users (
    id           TEXT        NOT NULL PRIMARY KEY,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform → user_id mapping (telegram / discord / web / credential / …)
CREATE TABLE IF NOT EXISTS platform_identities (
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform       TEXT        NOT NULL,  -- 'telegram'|'discord'|'slack'|'kakao'|'web'|'credential'
    platform_id    TEXT        NOT NULL,  -- platform-native ID (e.g. telegram chat_id, email)
    display_name   TEXT,
    metadata       JSONB                  NOT NULL DEFAULT '{}',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_identities_user_id
    ON platform_identities(user_id);

-- One-time account-linking codes (10-min TTL)
CREATE TABLE IF NOT EXISTS platform_link_codes (
    code       TEXT        NOT NULL PRIMARY KEY,  -- e.g. "JIKI-7A4B2F"
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_link_codes_user_id
    ON platform_link_codes(user_id);

-- Credential-based auth (email + bcrypt password hash)
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id       TEXT        NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credentials_email
    ON user_credentials(email);

-- =============================================================
-- USER PROFILE & PREFERENCES
-- =============================================================

-- User profile (persona, budget thresholds, notification settings …)
-- uuid_id  — the canonical user UUID (FK to users)
-- telegram_id — nullable; only set for Telegram-linked accounts
CREATE TABLE IF NOT EXISTS profiles (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    uuid_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_id TEXT        UNIQUE,           -- NULL for web-only users
    user_name   TEXT,
    goals       TEXT[]      NOT NULL DEFAULT '{}',
    preferences JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uuid_id
    ON profiles(uuid_id);

-- =============================================================
-- FINANCIAL RECORDS
-- =============================================================

CREATE TABLE IF NOT EXISTS finances (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER     NOT NULL,          -- KRW
    category    TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finances_user_id    ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_created_at ON finances(created_at);

-- =============================================================
-- DAILY LOGS  (vector + full-text hybrid RAG)
-- =============================================================

CREATE TABLE IF NOT EXISTS daily_logs (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    sentiment   TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id ON daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_embedding ON daily_logs
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_daily_logs_content_tsv
    ON daily_logs USING gin(content_tsv);

-- =============================================================
-- DOCUMENTS
-- =============================================================

CREATE TABLE IF NOT EXISTS user_documents (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    file_type   TEXT        NOT NULL,
    file_url    TEXT        NOT NULL,
    object_key  TEXT        NOT NULL DEFAULT '',
    size        BIGINT      NOT NULL DEFAULT 0,
    indexed     BOOLEAN     NOT NULL DEFAULT FALSE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id    ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_uploaded_at ON user_documents(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS document_sections (
    id          BIGSERIAL NOT NULL PRIMARY KEY,
    document_id BIGINT    NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
    content     TEXT      NOT NULL,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB     NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_document_sections_embedding ON document_sections
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_document_sections_content_tsv
    ON document_sections USING gin(content_tsv);

-- =============================================================
-- IMAGES
-- =============================================================

CREATE TABLE IF NOT EXISTS user_images (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    name       TEXT        NOT NULL DEFAULT 'image.png',
    mime       TEXT        NOT NULL DEFAULT 'image/png',
    size       BIGINT      NOT NULL DEFAULT 0,
    source     TEXT        NOT NULL DEFAULT 'web',   -- 'web', 'telegram', 'webchat'
    type       TEXT        NOT NULL DEFAULT 'generated',  -- 'generated', 'edited', 'analyzed'
    prompt     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_images_user_id ON user_images(user_id);
CREATE INDEX IF NOT EXISTS idx_user_images_created_at ON user_images(created_at DESC);

-- =============================================================
-- AUDIOS
-- =============================================================

CREATE TABLE IF NOT EXISTS user_audios (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    name       TEXT        NOT NULL DEFAULT 'audio.wav',
    mime       TEXT        NOT NULL DEFAULT 'audio/wav',
    size       BIGINT      NOT NULL DEFAULT 0,
    duration   INTEGER     NOT NULL DEFAULT 0,
    source     TEXT        NOT NULL DEFAULT 'web',
    type       TEXT        NOT NULL DEFAULT 'uploaded',
    transcript TEXT,
    prompt     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_audios_user_id    ON user_audios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audios_created_at ON user_audios(created_at DESC);

-- =============================================================
-- REPORTS
-- =============================================================

CREATE TABLE IF NOT EXISTS reports (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    report_type TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type       ON reports(report_type);

-- =============================================================
-- KNOWLEDGE BASE  (goals / schedules / reminders / dday / memo / RAG)
-- key prefix convention:
--   "goal:"     "schedule:"  "reminder:"  "dday:"  "memo:"
--   "kb:"       (free-form knowledge)
-- =============================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    source      TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_tsv
    ON knowledge_base USING gin(content_tsv);

-- =============================================================
-- SKILLS (catalog + per-user settings)
-- =============================================================

-- Skill catalog — upserted by the agent at startup
CREATE TABLE IF NOT EXISTS skills (
    id                 TEXT        NOT NULL PRIMARY KEY,
    name               TEXT        NOT NULL,
    description        TEXT        NOT NULL,
    category           TEXT        NOT NULL,
    emoji              TEXT                 DEFAULT '',
    tools              TEXT[]               DEFAULT '{}',
    reports            TEXT[]               DEFAULT '{}',
    cron_rules         TEXT[]               DEFAULT '{}',
    enabled_by_default BOOLEAN              DEFAULT TRUE,
    permission_level   INT                  DEFAULT 1,
    sort_order         INT                  DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user skill overrides (no row = use enabled_by_default)
CREATE TABLE IF NOT EXISTS user_skills (
    user_id    TEXT        NOT NULL,
    skill_id   TEXT        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    enabled    BOOLEAN     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

-- =============================================================
-- GOOGLE OAUTH2 TOKENS
-- =============================================================

CREATE TABLE IF NOT EXISTS google_tokens (
    user_id       TEXT        NOT NULL PRIMARY KEY,
    access_token  TEXT        NOT NULL,
    refresh_token TEXT        NOT NULL,
    token_uri     TEXT                 DEFAULT 'https://oauth2.googleapis.com/token',
    scopes        TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- FUNCTIONS
-- =============================================================

-- Vector similarity search over daily_logs
CREATE OR REPLACE FUNCTION match_logs(
    query_embedding vector(768),
    match_threshold float,
    match_count     int,
    p_user_id       text
)
RETURNS TABLE (id bigint, content text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dl.id,
        dl.content,
        1 - (dl.embedding <=> query_embedding) AS similarity
    FROM daily_logs dl
    WHERE dl.user_id = p_user_id
      AND dl.embedding IS NOT NULL
      AND 1 - (dl.embedding <=> query_embedding) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- =============================================================
-- TSVECTOR TRIGGERS  (auto-populate on INSERT/UPDATE)
-- =============================================================

CREATE OR REPLACE FUNCTION daily_logs_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION knowledge_base_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.key, '') || ' ' || COALESCE(NEW.value, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION document_sections_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_logs_tsv ON daily_logs;
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();

DROP TRIGGER IF EXISTS trg_knowledge_base_tsv ON knowledge_base;
CREATE TRIGGER trg_knowledge_base_tsv
    BEFORE INSERT OR UPDATE OF key, value ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION knowledge_base_tsv_trigger();

DROP TRIGGER IF EXISTS trg_document_sections_tsv ON document_sections;
CREATE TRIGGER trg_document_sections_tsv
    BEFORE INSERT OR UPDATE OF content ON document_sections
    FOR EACH ROW EXECUTE FUNCTION document_sections_tsv_trigger();

CREATE OR REPLACE FUNCTION diary_entries_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION memos_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_diary_entries_tsv ON diary_entries;
CREATE TRIGGER trg_diary_entries_tsv
    BEFORE INSERT OR UPDATE OF title, content ON diary_entries
    FOR EACH ROW EXECUTE FUNCTION diary_entries_tsv_trigger();

DROP TRIGGER IF EXISTS trg_memos_tsv ON memos;
CREATE TRIGGER trg_memos_tsv
    BEFORE INSERT OR UPDATE OF title, content ON memos
    FOR EACH ROW EXECUTE FUNCTION memos_tsv_trigger();

-- =============================================================
-- CHANNEL SETTINGS (migrations 013–015)
-- =============================================================

-- 013: Global bot-level channel settings (legacy fallback).
CREATE TABLE IF NOT EXISTS channel_settings (
    channel    TEXT        NOT NULL,
    key        TEXT        NOT NULL,
    value      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel, key)
);
INSERT INTO channel_settings (channel, key, value)
VALUES ('telegram', 'dm_policy', 'allow'), ('telegram', 'group_policy', 'allow')
ON CONFLICT DO NOTHING;

-- 014: Per-user channel configuration (bot token, enabled, DM/Group policies).
CREATE TABLE IF NOT EXISTS user_channel_settings (
    user_id      TEXT        NOT NULL,
    channel      TEXT        NOT NULL,
    bot_token    TEXT        NOT NULL DEFAULT '',
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy    TEXT        NOT NULL DEFAULT 'allow',
    group_policy TEXT        NOT NULL DEFAULT 'allow',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_user_channel_settings_channel
    ON user_channel_settings (channel);

-- 015: Telegram pairing tables.
CREATE TABLE IF NOT EXISTS telegram_approved_contacts (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,
    telegram_id    TEXT        NOT NULL,
    display_name   TEXT        NOT NULL DEFAULT '',
    approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_approved_contacts_owner
    ON telegram_approved_contacts (owner_user_id);

CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,
    telegram_id    TEXT        NOT NULL,
    display_name   TEXT        NOT NULL DEFAULT '',
    message_text   TEXT        NOT NULL DEFAULT '',
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status         TEXT        NOT NULL DEFAULT 'pending',
    resolved_at    TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_owner_status
    ON telegram_pairing_requests (owner_user_id, status);

-- =============================================================
-- USER PROVIDERS & PERSONAS (migration 016)
-- =============================================================

CREATE TABLE IF NOT EXISTS user_providers (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL,
    api_key        TEXT        NOT NULL DEFAULT '',
    base_url       TEXT        NOT NULL DEFAULT '',
    enabled_models TEXT[]      NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON user_providers(user_id);

CREATE TABLE IF NOT EXISTS user_personas (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    provider      TEXT        NOT NULL DEFAULT '',
    model         TEXT        NOT NULL DEFAULT '',
    system_prompt TEXT        NOT NULL DEFAULT '',
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_personas_user_id ON user_personas(user_id);

-- =============================================================
-- LIFE - DIARY
-- =============================================================

CREATE TABLE IF NOT EXISTS diary_entries (
    id          SERIAL      PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL,
    mood        TEXT        NOT NULL DEFAULT '보통',
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    entry_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_embedding ON diary_entries
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_diary_entries_content_tsv ON diary_entries USING gin(content_tsv);

-- =============================================================
-- LIFE - GOALS
-- =============================================================

CREATE TABLE IF NOT EXISTS goals (
    id             BIGSERIAL   PRIMARY KEY,
    user_id        TEXT        NOT NULL,
    title          TEXT        NOT NULL,
    icon           TEXT        NOT NULL DEFAULT '🎯',
    category       TEXT        NOT NULL DEFAULT 'general',
    target_value   NUMERIC     NOT NULL DEFAULT 0,
    current_value  NUMERIC     NOT NULL DEFAULT 0,
    unit           TEXT        NOT NULL DEFAULT '',
    start_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
    end_date       DATE,
    status         TEXT        NOT NULL DEFAULT 'in_progress'
                               CHECK (status IN ('in_progress','completed','abandoned')),
    description    TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    completed_date DATE,
    abandoned_date DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user_status  ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS goal_checkins (
    id         BIGSERIAL   PRIMARY KEY,
    goal_id    BIGINT      NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id    TEXT        NOT NULL,
    check_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(goal_id, check_date)
);
CREATE INDEX IF NOT EXISTS idx_goal_checkins_goal ON goal_checkins(goal_id);

-- =============================================================
-- LIFE - MEMOS
-- =============================================================

CREATE TABLE IF NOT EXISTS memos (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    tag         TEXT        NOT NULL DEFAULT '개인',
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memos_user_id ON memos(user_id);
CREATE INDEX IF NOT EXISTS idx_memos_embedding ON memos
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_memos_content_tsv ON memos USING gin(content_tsv);

-- =============================================================
-- LIFE - D-DAY
-- =============================================================

CREATE TABLE IF NOT EXISTS ddays (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    target_date DATE        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '📅',
    description TEXT        NOT NULL DEFAULT '',
    recurring   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ddays_user_id ON ddays(user_id);
