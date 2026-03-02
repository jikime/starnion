-- Google OAuth2 token storage for per-user Google Workspace integration.
CREATE TABLE IF NOT EXISTS google_tokens (
    user_id    TEXT PRIMARY KEY,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_uri     TEXT DEFAULT 'https://oauth2.googleapis.com/token',
    scopes        TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
