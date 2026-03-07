-- =============================================================
-- Full Identity Migration
-- Old schema: profiles.telegram_id as root identity
-- New schema: users.id (UUID TEXT) as root identity
--             platform_identities maps platforms → users.id
--             profiles.uuid_id FK to users.id
--             all data tables FK to users.id (not profiles.telegram_id)
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- STEP 1: Create new identity tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id           TEXT        NOT NULL PRIMARY KEY,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_identities (
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform       TEXT        NOT NULL,
    platform_id    TEXT        NOT NULL,
    display_name   TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_identities_user_id
    ON platform_identities(user_id);

CREATE TABLE IF NOT EXISTS platform_link_codes (
    code       TEXT        NOT NULL PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_link_codes_user_id
    ON platform_link_codes(user_id);

CREATE TABLE IF NOT EXISTS user_credentials (
    user_id       TEXT        NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credentials_email
    ON user_credentials(email);

-- ─────────────────────────────────────────────
-- STEP 2: Build telegram_id → UUID mapping
-- ─────────────────────────────────────────────

CREATE TEMP TABLE _user_migration (
    profile_id  BIGINT  NOT NULL,
    telegram_id TEXT    NOT NULL,
    user_uuid   TEXT    NOT NULL DEFAULT gen_random_uuid()::TEXT
);

INSERT INTO _user_migration (profile_id, telegram_id)
SELECT id, telegram_id FROM profiles;

-- ─────────────────────────────────────────────
-- STEP 3: Populate users from existing profiles
-- ─────────────────────────────────────────────

INSERT INTO users (id, display_name, created_at, updated_at)
SELECT m.user_uuid,
       p.user_name,
       p.created_at,
       p.updated_at
FROM _user_migration m
JOIN profiles p ON p.id = m.profile_id;

-- ─────────────────────────────────────────────
-- STEP 4: Add uuid_id column to profiles and populate
-- ─────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uuid_id TEXT;

UPDATE profiles p
SET    uuid_id = m.user_uuid
FROM   _user_migration m
WHERE  p.id = m.profile_id;

-- ─────────────────────────────────────────────
-- STEP 5: Register telegram identities
-- ─────────────────────────────────────────────

INSERT INTO platform_identities (user_id, platform, platform_id, display_name)
SELECT m.user_uuid, 'telegram', m.telegram_id, p.user_name
FROM   _user_migration m
JOIN   profiles p ON p.id = m.profile_id;

-- ─────────────────────────────────────────────
-- STEP 6: Migrate user_id in data tables (telegram_id → UUID)
-- ─────────────────────────────────────────────

-- Drop old FK constraints first
ALTER TABLE daily_logs    DROP CONSTRAINT IF EXISTS daily_logs_user_id_fkey;
ALTER TABLE finances      DROP CONSTRAINT IF EXISTS finances_user_id_fkey;
ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_user_id_fkey;
ALTER TABLE user_documents DROP CONSTRAINT IF EXISTS user_documents_user_id_fkey;

-- Remap user_id values
UPDATE daily_logs dl
SET    user_id = m.user_uuid
FROM   _user_migration m
WHERE  dl.user_id = m.telegram_id;

UPDATE finances f
SET    user_id = m.user_uuid
FROM   _user_migration m
WHERE  f.user_id = m.telegram_id;

UPDATE knowledge_base kb
SET    user_id = m.user_uuid
FROM   _user_migration m
WHERE  kb.user_id = m.telegram_id;

UPDATE user_documents ud
SET    user_id = m.user_uuid
FROM   _user_migration m
WHERE  ud.user_id = m.telegram_id;

-- Add new FK constraints pointing to users(id)
ALTER TABLE daily_logs
    ADD CONSTRAINT daily_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE finances
    ADD CONSTRAINT finances_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE knowledge_base
    ADD CONSTRAINT knowledge_base_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_documents
    ADD CONSTRAINT user_documents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────
-- STEP 7: Finalize profiles table
-- ─────────────────────────────────────────────

-- uuid_id must not be null and must be unique
ALTER TABLE profiles
    ALTER COLUMN uuid_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uuid_id
    ON profiles(uuid_id);

ALTER TABLE profiles
    ADD CONSTRAINT profiles_uuid_id_fkey
    FOREIGN KEY (uuid_id) REFERENCES users(id) ON DELETE CASCADE;

-- telegram_id becomes nullable (web-only users have no telegram)
ALTER TABLE profiles
    ALTER COLUMN telegram_id DROP NOT NULL;

-- goals NOT NULL default
ALTER TABLE profiles
    ALTER COLUMN goals SET DEFAULT '{}';
UPDATE profiles SET goals = '{}' WHERE goals IS NULL;
ALTER TABLE profiles
    ALTER COLUMN goals SET NOT NULL;

-- ─────────────────────────────────────────────
-- STEP 8: Add missing tables from new schema
-- ─────────────────────────────────────────────

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

-- ─────────────────────────────────────────────
-- STEP 9: Create/replace match_logs function
-- ─────────────────────────────────────────────

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

COMMIT;

-- Verify
SELECT 'users'              AS tbl, COUNT(*) FROM users
UNION ALL
SELECT 'platform_identities',        COUNT(*) FROM platform_identities
UNION ALL
SELECT 'profiles',                   COUNT(*) FROM profiles
UNION ALL
SELECT 'daily_logs',                 COUNT(*) FROM daily_logs
UNION ALL
SELECT 'finances',                   COUNT(*) FROM finances
UNION ALL
SELECT 'knowledge_base',             COUNT(*) FROM knowledge_base
UNION ALL
SELECT 'user_documents',             COUNT(*) FROM user_documents;
