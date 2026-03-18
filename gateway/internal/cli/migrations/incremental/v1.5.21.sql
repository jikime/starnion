-- v1.5.21.sql
-- Add depends_on column to goals for dependency chains.
--
-- A goal with depends_on set is "blocked" until the referenced goal
-- reaches status='completed'.  The agent layer enforces this by refusing
-- progress updates while the dependency is still in_progress.

ALTER TABLE goals
    ADD COLUMN IF NOT EXISTS depends_on BIGINT REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_goals_depends_on ON goals(depends_on);
