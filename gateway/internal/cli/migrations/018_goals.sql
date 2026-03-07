-- Goals management
CREATE TABLE IF NOT EXISTS goals (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '🎯',
    category    TEXT        NOT NULL DEFAULT 'general',
    target_value NUMERIC    NOT NULL DEFAULT 0,
    current_value NUMERIC   NOT NULL DEFAULT 0,
    unit        TEXT        NOT NULL DEFAULT '',
    start_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    end_date    DATE,
    status      TEXT        NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
    description TEXT,
    completed_date DATE,
    abandoned_date DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals(user_id, created_at DESC);

-- Daily check-ins for habit-type goals
CREATE TABLE IF NOT EXISTS goal_checkins (
    id          BIGSERIAL PRIMARY KEY,
    goal_id     BIGINT      NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL,
    check_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(goal_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_goal_checkins_goal ON goal_checkins(goal_id);
