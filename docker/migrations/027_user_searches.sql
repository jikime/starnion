-- Migration 027: Add user_searches table
-- Stores search results that the user explicitly chose to save.

CREATE TABLE IF NOT EXISTS user_searches (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query      TEXT        NOT NULL,
    result     TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_searches_user_id    ON user_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_searches_created_at ON user_searches(created_at DESC);
