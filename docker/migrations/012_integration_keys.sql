-- Migration 012: integration_keys
-- Stores API key / PAT credentials for external service integrations.
-- OAuth-based integrations (Google) continue to use their own tables.

CREATE TABLE IF NOT EXISTS integration_keys (
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider   TEXT        NOT NULL,  -- 'notion' | 'github' | etc.
    api_key    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider)
);
