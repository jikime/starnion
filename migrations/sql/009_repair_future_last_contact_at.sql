-- 009_repair_future_last_contact_at.sql
--
-- Repair connections.last_contact_at rows that were polluted by the
-- Phase 2 calendar ingestor between connectingest commit d957716 and
-- the fix in commit 17e7139. The bug: IngestActivities advanced
-- last_contact_at via GREATEST(stored, occurred_at) without checking
-- whether occurred_at was in the past. As soon as the lookahead window
-- widened (commit 17e7139 → +14d), upcoming calendar events started
-- being written into last_contact_at, breaking drift detection
-- (negative days_since) and inflating the score recompute's recency
-- term.
--
-- This migration is idempotent and tenant-safe: it operates on every
-- connection row whose last_contact_at is currently in the future,
-- regardless of which user owns it. For each polluted row it picks the
-- max occurred_at of the connection's PAST activity rows, falling back
-- to NULL when none exist.
--
-- Going forward the bug is fixed in:
--   - gateway/internal/adapter/repository/postgres/connection_repository.go
--     (IngestActivities only bumps for occurred_at <= NOW())
--   - agent/skills/connect-activity/scripts/activity.py
--     (_bump_last_contact short-circuits on future timestamps)

BEGIN;

-- Step 1: rebuild last_contact_at from the most recent past activity
-- for any connection whose stored value is in the future.
UPDATE connections c
   SET last_contact_at = sub.max_past
  FROM (
    SELECT connection_id, MAX(occurred_at) AS max_past
      FROM connection_activities
     WHERE occurred_at <= NOW()
     GROUP BY connection_id
  ) sub
 WHERE c.id = sub.connection_id
   AND c.last_contact_at IS NOT NULL
   AND c.last_contact_at > NOW();

-- Step 2: any future-dated rows that didn't have a past activity at
-- all → reset to NULL (treat the connection as never contacted, which
-- the score formula handles correctly).
UPDATE connections
   SET last_contact_at = NULL
 WHERE last_contact_at IS NOT NULL
   AND last_contact_at > NOW();

INSERT INTO schema_migrations (version) VALUES ('9.0.0') ON CONFLICT DO NOTHING;

COMMIT;
