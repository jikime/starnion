CREATE TABLE IF NOT EXISTS ddays (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    target_date DATE        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '📅',
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddays_user_id ON ddays(user_id);
