-- v1.5.21.sql
-- Add depends_on column to goals table for goal dependency chains

ALTER TABLE goals
    ADD COLUMN IF NOT EXISTS depends_on BIGINT REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_goals_depends_on
    ON goals (depends_on)
    WHERE depends_on IS NOT NULL;
