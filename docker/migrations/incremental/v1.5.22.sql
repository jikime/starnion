-- v1.5.22.sql
-- Fix report_task_runs schema: replace user_id/report_type columns with job_name
-- (v1.5.20 was initially created with wrong schema; this corrects it in-place)

-- Drop wrong indexes created by the bad v1.5.20
DROP INDEX IF EXISTS idx_report_task_runs_user_id;
DROP INDEX IF EXISTS idx_report_task_runs_created_at;

-- Remove wrong columns if they exist
ALTER TABLE report_task_runs
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS report_type,
    DROP COLUMN IF EXISTS created_at;

-- Add correct column
ALTER TABLE report_task_runs
    ADD COLUMN IF NOT EXISTS job_name TEXT NOT NULL DEFAULT '';

-- Add started_at if missing (was 'started_at' already there but as nullable)
ALTER TABLE report_task_runs
    ALTER COLUMN started_at SET DEFAULT NOW();

-- Ensure correct indexes exist
CREATE INDEX IF NOT EXISTS idx_report_task_runs_job_name
    ON report_task_runs (job_name);

CREATE INDEX IF NOT EXISTS idx_report_task_runs_started_at
    ON report_task_runs (started_at DESC);
