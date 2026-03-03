-- Migration 006: user_credentials
-- Credential-based authentication (email + bcrypt password)
-- Allows web users to have a persistent identity independent of Telegram.

CREATE TABLE IF NOT EXISTS user_credentials (
    user_id       TEXT        NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credentials_email ON user_credentials(email);
