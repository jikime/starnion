-- Skill catalog (agent upserts at startup)
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    emoji TEXT DEFAULT '',
    tools TEXT[] DEFAULT '{}',
    reports TEXT[] DEFAULT '{}',
    cron_rules TEXT[] DEFAULT '{}',
    enabled_by_default BOOLEAN DEFAULT TRUE,
    permission_level INT DEFAULT 1,
    sort_order INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user skill settings (no row = use enabled_by_default)
CREATE TABLE IF NOT EXISTS user_skills (
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL REFERENCES skills(id),
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);
