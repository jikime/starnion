-- Diary entries table for per-user daily journal records.
CREATE TABLE IF NOT EXISTS diary_entries (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL,
    mood        TEXT        NOT NULL DEFAULT '보통',
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    entry_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date
    ON diary_entries (user_id, entry_date DESC);
