-- Migration 030: usage_logs table for tracking LLM API call costs and token usage

CREATE TABLE IF NOT EXISTS usage_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    model       TEXT        NOT NULL,
    provider    TEXT        NOT NULL DEFAULT '',
    input_tokens  INTEGER   NOT NULL DEFAULT 0,
    output_tokens INTEGER   NOT NULL DEFAULT 0,
    cached_tokens INTEGER   NOT NULL DEFAULT 0,
    cost_usd    NUMERIC(12, 8) NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'success',  -- 'success' | 'error'
    call_type   TEXT        NOT NULL DEFAULT 'chat',     -- 'chat' | 'tool' | 'embed'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_logs_user_id_idx    ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx ON usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_logs_user_date_idx  ON usage_logs (user_id, created_at DESC);
