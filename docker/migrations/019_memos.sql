CREATE TABLE IF NOT EXISTS memos (
    id         BIGSERIAL PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    title      TEXT        NOT NULL DEFAULT '',
    content    TEXT        NOT NULL DEFAULT '',
    tag        TEXT        NOT NULL DEFAULT '개인',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memos_user_id ON memos(user_id);
