-- 006_scheduler_partial_index.sql
--
-- The scheduler's `runAndArmUserSchedules` runs on every active-tick
-- and executes two queries over `knowledge_base` restricted to rows
-- with key LIKE 'schedule:%'. Both queries then cast `value::jsonb`
-- and dereference `->>'status'` / `->>'next_fire_at'` for filtering
-- inside a MATERIALIZED CTE (see internal/infrastructure/scheduler/
-- user_schedules.go). Without a partial index, PostgreSQL falls back
-- to a sequential scan of the whole knowledge_base table, which
-- stores arbitrary user data (memory chunks, notes) alongside the
-- relatively small population of schedule rows.
--
-- This migration adds:
--
--   1. A partial B-tree index on `(user_id, id)` restricted to
--      schedule keys. Makes the CTE's WHERE `kb.key LIKE 'schedule:%'`
--      an index-only scan over a small index instead of a seq scan
--      over the full table.
--
--   2. A partial expression index on the epoch `next_fire_at` field
--      so the MIN-future query can walk already-sorted index tuples
--      instead of scanning + filtering + sorting in memory.
--
-- Both indexes are declared IF NOT EXISTS so the migration is
-- idempotent under starnion's built-in schema_migrations runner.

CREATE INDEX IF NOT EXISTS idx_knowledge_base_schedule_rows
    ON knowledge_base (user_id, id)
    WHERE key LIKE 'schedule:%';

CREATE INDEX IF NOT EXISTS idx_knowledge_base_schedule_next_fire_at
    ON knowledge_base ((((value::jsonb)->>'next_fire_at')::bigint))
    WHERE key LIKE 'schedule:%';
