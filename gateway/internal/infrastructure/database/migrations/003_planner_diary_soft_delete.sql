-- Migration: add archived_at to planner_diary for soft-delete support.
--
-- Memory compaction previously hard-deleted diary rows after summarising them.
-- Soft delete preserves originals so hallucinated summaries can be recovered.
-- Archived rows are excluded from normal queries via the partial index below.

ALTER TABLE planner_diary
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Partial index: queries that filter WHERE archived_at IS NULL run without touching archived rows.
CREATE INDEX IF NOT EXISTS idx_planner_diary_active
  ON planner_diary (user_id, entry_date)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN planner_diary.archived_at IS
  'Set by memory_compaction scheduler when the row has been summarised into '
  'knowledge_base. NULL = active record. Non-NULL = soft-deleted / archived.';
