-- =============================================================
-- 007_connections.sql
-- Phase 1 of the Connect (인맥) feature.
-- Introduces the authoritative `connections` table and the
-- append-only `connection_activities` interaction log.
-- Both are per-user (user_id scoped, ON DELETE CASCADE).
--
-- The updated_at trigger reuses update_updated_at_column() which
-- was defined in 001_init.sql (line 681) and has been reused
-- by every subsequent domain table (users, finances, budgets, ...).
-- =============================================================

-- ---- UP ----------------------------------------------------

BEGIN;

-- ── connections ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connections (
    id                        UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                      TEXT          NOT NULL,
    role                      TEXT,
    company                   TEXT,
    category                  TEXT          NOT NULL DEFAULT 'acquaintance'
                                              CHECK (category IN ('family', 'friend', 'business', 'acquaintance')),
    email                     TEXT,
    phone                     TEXT,
    birthday                  DATE,
    meeting_location          TEXT,
    group_key                 TEXT,
    tags                      TEXT[]        NOT NULL DEFAULT '{}',
    context_notes             TEXT          NOT NULL DEFAULT '',
    last_contact_at           TIMESTAMPTZ,
    contact_frequency_target  INTEGER       NOT NULL DEFAULT 30
                                              CHECK (contact_frequency_target > 0),
    connection_score          REAL          NOT NULL DEFAULT 0.5
                                              CHECK (connection_score >= 0 AND connection_score <= 1),
    business_card             JSONB,
    social_profiles           JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN connections.social_profiles IS
    'JSONB with exactly 5 keys: facebook, instagram, x, linkedin, threads. Unknown keys rejected at the application layer.';
COMMENT ON COLUMN connections.business_card IS
    'Nullable JSONB: {image_url, company_name_en, dept, address, website, fax, scanned_at, ocr_raw_text}.';
COMMENT ON COLUMN connections.connection_score IS
    '0..1 persisted score. Read-only via public API. Recomputed nightly by connect_score_recompute (Phase 2).';
COMMENT ON COLUMN connections.contact_frequency_target IS
    'Target interval in days between contacts. Drives drift detection in Phase 2.';

CREATE INDEX IF NOT EXISTS idx_connections_user
    ON connections (user_id);

CREATE INDEX IF NOT EXISTS idx_connections_user_last_contact
    ON connections (user_id, last_contact_at);

CREATE INDEX IF NOT EXISTS idx_connections_user_score
    ON connections (user_id, connection_score DESC);

CREATE INDEX IF NOT EXISTS idx_connections_tags_gin
    ON connections USING GIN (tags);

DROP TRIGGER IF EXISTS update_connections_updated_at ON connections;
CREATE TRIGGER update_connections_updated_at
    BEFORE UPDATE ON connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── connection_activities (append-only interaction log) ──────
CREATE TABLE IF NOT EXISTS connection_activities (
    id             BIGSERIAL     NOT NULL PRIMARY KEY,
    user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id  UUID          NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    kind           TEXT          NOT NULL
                                    CHECK (kind IN ('email', 'calendar', 'manual', 'telegram')),
    occurred_at    TIMESTAMPTZ   NOT NULL,
    duration_min   INTEGER       NOT NULL DEFAULT 0,
    weight         REAL          NOT NULL DEFAULT 1,
    note           TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connection_activities_user_conn
    ON connection_activities (user_id, connection_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_activities_user_kind_occ
    ON connection_activities (user_id, kind, occurred_at DESC);

-- Idempotency guard for Phase 2 UC-201 (IngestActivityBatch):
-- re-ingesting the same (connection_id, kind, occurred_at) must be a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_activities_unique_event
    ON connection_activities (connection_id, kind, occurred_at);

INSERT INTO schema_migrations (version) VALUES ('7.0.0') ON CONFLICT DO NOTHING;

COMMIT;

-- ---- DOWN --------------------------------------------------
-- For local rollback only. Production rollbacks should use a
-- point-in-time restore — this script drops data.
--
-- BEGIN;
--   DROP TRIGGER  IF EXISTS update_connections_updated_at ON connections;
--   DROP INDEX    IF EXISTS idx_connection_activities_unique_event;
--   DROP INDEX    IF EXISTS idx_connection_activities_user_kind_occ;
--   DROP INDEX    IF EXISTS idx_connection_activities_user_conn;
--   DROP TABLE    IF EXISTS connection_activities;
--   DROP INDEX    IF EXISTS idx_connections_tags_gin;
--   DROP INDEX    IF EXISTS idx_connections_user_score;
--   DROP INDEX    IF EXISTS idx_connections_user_last_contact;
--   DROP INDEX    IF EXISTS idx_connections_user;
--   DROP TABLE    IF EXISTS connections;
--   DELETE FROM schema_migrations WHERE version = '7.0.0';
-- COMMIT;
