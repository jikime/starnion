-- 016: Per-user LLM provider configurations and personas

-- User provider configurations (API keys, enabled models per provider)
CREATE TABLE IF NOT EXISTS user_providers (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL,  -- 'anthropic' | 'gemini' | 'openai' | 'zai' | 'custom'
    api_key        TEXT        NOT NULL DEFAULT '',
    base_url       TEXT        NOT NULL DEFAULT '',  -- required for 'custom'
    enabled_models TEXT[]      NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON user_providers(user_id);

-- User personas (each with a specific provider + model assignment)
CREATE TABLE IF NOT EXISTS user_personas (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    provider      TEXT        NOT NULL DEFAULT '',
    model         TEXT        NOT NULL DEFAULT '',
    system_prompt TEXT        NOT NULL DEFAULT '',
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_personas_user_id ON user_personas(user_id);
