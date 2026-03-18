-- v1.5.20.sql
-- Add report_task_runs table for scheduler job tracking and dead-task recovery.
--
-- Each cron job execution writes a row at start (status='running') and updates
-- it to 'success' or 'failed' when done.  Rows that remain 'running' after the
-- gateway restarts are marked 'dead' by recoverDeadTasks() in the scheduler.

CREATE TABLE IF NOT EXISTS report_task_runs (
    id          BIGSERIAL    PRIMARY KEY,
    job_name    TEXT         NOT NULL,
    started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status      TEXT         NOT NULL DEFAULT 'running',  -- running | success | failed | dead
    error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_task_runs_job_name   ON report_task_runs (job_name);
CREATE INDEX IF NOT EXISTS idx_report_task_runs_status     ON report_task_runs (status);
CREATE INDEX IF NOT EXISTS idx_report_task_runs_started_at ON report_task_runs (started_at DESC);
