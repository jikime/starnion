-- =============================================================
-- 008_connection_activities_v2.sql
-- Phase 1.5 + Phase 2 groundwork for Activity Timeline.
--
-- Adds a `label` column so user-entered activities can carry a
-- category chip ("미팅", "통화", "식사", ...) orthogonal to the
-- existing `kind` column (which stores the source: email, calendar,
-- manual, telegram).
--
-- Also adds a partial index on the 90-day activity window used by
-- the Phase 2 score recompute cron. The existing unique index from
-- 007 (`idx_connection_activities_unique_event` on
-- (connection_id, kind, occurred_at)) already provides idempotency
-- for the Gmail/Calendar ingestor, so this migration does not touch
-- it.
-- =============================================================

-- ---- UP ----------------------------------------------------

BEGIN;

ALTER TABLE connection_activities
    ADD COLUMN IF NOT EXISTS label TEXT;

COMMENT ON COLUMN connection_activities.label IS
    'User-visible category (freeform, up to 40 chars): 미팅, 통화, 식사, 협업, 메시지, 기타, or custom. NULL for auto-ingested rows from Gmail/Calendar where the label is not inferred.';

-- Score recompute hot path: "give me this user's last 90 days of
-- activity ordered by occurred_at". The partial index keeps the
-- index size bounded — anything older than 100 days is dropped
-- automatically as occurred_at drifts out of range on the next
-- vacuum.
CREATE INDEX IF NOT EXISTS idx_connection_activities_user_occurred_recent
    ON connection_activities (user_id, occurred_at DESC);

INSERT INTO schema_migrations (version) VALUES ('8.0.0') ON CONFLICT DO NOTHING;

COMMIT;

-- ---- DOWN --------------------------------------------------
-- BEGIN;
--   DROP INDEX IF EXISTS idx_connection_activities_user_occurred_recent;
--   ALTER TABLE connection_activities DROP COLUMN IF EXISTS label;
--   DELETE FROM schema_migrations WHERE version = '8.0.0';
-- COMMIT;
