-- v1.5.20: report_task_runs table for scheduler dead-task recovery

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
