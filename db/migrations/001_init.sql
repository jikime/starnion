-- =============================================================
-- NewStarNion: Consolidated Init Schema
-- Represents the FINAL database state after ALL migrations.
-- For NEW installations only — no ALTER TABLE or migration logic.
-- =============================================================

-- =============================================================
-- EXTENSIONS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================
-- TABLES (in dependency order)
-- =============================================================

-- ── Migration Tracking ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT        NOT NULL PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Identity & Auth ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name      TEXT,
    email             TEXT        UNIQUE,
    password_hash     TEXT,
    role              TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    preferences       JSONB       NOT NULL DEFAULT '{}',
    telegram_id       BIGINT      UNIQUE,
    telegram_username TEXT,
    avatar_url        TEXT,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_identities (
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform       TEXT        NOT NULL,
    platform_id    TEXT        NOT NULL,
    display_name   TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);

CREATE TABLE IF NOT EXISTS platform_link_codes (
    code       TEXT        NOT NULL PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Financial Records ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finances (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER     NOT NULL,
    category    TEXT        NOT NULL,
    description TEXT,
    location    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Daily Logs (vector + full-text hybrid RAG) ───────────────
CREATE TABLE IF NOT EXISTS daily_logs (
    id          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    sentiment   TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Knowledge Base (used by scheduler, cron, search) ────────
CREATE TABLE IF NOT EXISTS knowledge_base (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    source      TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Skills (catalog + per-user settings) ─────────────────────
CREATE TABLE IF NOT EXISTS user_skills (
    user_id    UUID        NOT NULL,
    skill_id   TEXT        NOT NULL,
    enabled    BOOLEAN     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

-- ── Google OAuth2 Tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_tokens (
    user_id       UUID        NOT NULL PRIMARY KEY,
    access_token  TEXT        NOT NULL,
    refresh_token TEXT        NOT NULL,
    token_uri     TEXT                 DEFAULT 'https://oauth2.googleapis.com/token',
    scopes        TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Integration Keys (Notion, GitHub, etc.) ──────────────────
CREATE TABLE IF NOT EXISTS integration_keys (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider   TEXT        NOT NULL,
    api_key    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider)
);

-- ── Conversations & Messages (old starnion style) ────────────
CREATE TABLE IF NOT EXISTS conversations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL DEFAULT '새 대화',
    platform   TEXT        NOT NULL DEFAULT 'web',
    thread_id  TEXT        NOT NULL DEFAULT '',
    persona_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL,
    attachments     JSONB,
    bot_name        TEXT,
    model_used      TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    context_tokens  INTEGER,
    context_window  INTEGER,
    tool_events     JSONB,
    search_vector   tsvector,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Chat Sessions & Messages (NewStarNion style) ─────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id                UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT,
    model             TEXT        NOT NULL DEFAULT 'claude-sonnet-4-6',
    session_file_path TEXT,
    metadata          JSONB       NOT NULL DEFAULT '{}',
    channel           VARCHAR(50) NOT NULL DEFAULT 'web',
    channel_session_key TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id            UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content       TEXT        NOT NULL DEFAULT '',
    tool_name     TEXT,
    tool_input    JSONB,
    tool_result   JSONB,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    embedding     vector(1024),
    search_vector tsvector    GENERATED ALWAYS AS (
        CASE WHEN role IN ('user', 'assistant')
             THEN to_tsvector('simple', coalesce(content, ''))
             ELSE NULL
        END
    ) STORED,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Channel Settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_settings (
    user_id      UUID        NOT NULL,
    channel      TEXT        NOT NULL,
    bot_token    TEXT        NOT NULL DEFAULT '',
    bot_username TEXT,
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy    TEXT        NOT NULL DEFAULT 'allow',
    group_policy TEXT        NOT NULL DEFAULT 'allow',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);

-- ── Telegram Pairing ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_approved_contacts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id UUID        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id UUID        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    message_text  TEXT        NOT NULL DEFAULT '',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT        NOT NULL DEFAULT 'pending',
    resolved_at   TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);

-- ── Providers & Model Assignments ────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL,
    api_key        TEXT        NOT NULL DEFAULT '',
    base_url       TEXT        NOT NULL DEFAULT '',
    enabled_models TEXT[]      NOT NULL DEFAULT '{}',
    endpoint_type  TEXT        NOT NULL DEFAULT 'other',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS model_assignments (
    id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    use_case   TEXT        NOT NULL,
    provider   TEXT        NOT NULL DEFAULT '',
    model      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, use_case)
);

-- ── Personas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    provider      TEXT        NOT NULL DEFAULT '',
    model         TEXT        NOT NULL DEFAULT '',
    system_prompt TEXT        NOT NULL DEFAULT '',
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    bot_name      TEXT        NOT NULL DEFAULT '',
    user_name     TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

-- ── (diary_entries, goals, goal_checkins, memos, content_tags, ddays removed) ──

-- ── Franklin Planner: Roles ─────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_roles (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#3b6de0',
    big_rock    TEXT        NOT NULL DEFAULT '',
    mission     TEXT,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Franklin Planner: Tasks ─────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_tasks (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','done','forwarded','cancelled','in-progress','delegated')),
    priority          CHAR(1)     NOT NULL DEFAULT 'C'
                      CHECK (priority IN ('A','B','C')),
    sort_order        INT         NOT NULL DEFAULT 0,
    role_id           BIGINT      REFERENCES planner_roles(id) ON DELETE SET NULL,
    time_start        TEXT,
    time_end          TEXT,
    delegatee         TEXT,
    note              TEXT,
    task_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
    is_inbox          BOOLEAN     NOT NULL DEFAULT FALSE,
    forwarded_from_id BIGINT      REFERENCES planner_tasks(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Franklin Planner: Weekly Goals ──────────────────────────
CREATE TABLE IF NOT EXISTS planner_weekly_goals (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     BIGINT      NOT NULL REFERENCES planner_roles(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    done        BOOLEAN     NOT NULL DEFAULT FALSE,
    week_start  DATE        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Franklin Planner: Goals (D-Day) ────────────────────────
CREATE TABLE IF NOT EXISTS planner_goals (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    role_id         BIGINT      REFERENCES planner_roles(id) ON DELETE SET NULL,
    due_date        DATE        NOT NULL,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','archived')),
    linked_task_ids BIGINT[]    DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Franklin Planner: Diary ────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_diary (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date  DATE        NOT NULL,
    one_liner   TEXT        NOT NULL DEFAULT '',
    mood        TEXT        NOT NULL DEFAULT 'neutral'
                CHECK (mood IN ('great','good','neutral','tired','rough')),
    full_note   TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, entry_date)
);

-- ── Franklin Planner: Reflection Notes ─────────────────────
CREATE TABLE IF NOT EXISTS planner_reflection_notes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_date   DATE        NOT NULL,
    notes       JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, note_date)
);

-- ── Web Searches ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS searches (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query       TEXT        NOT NULL,
    result      TEXT        NOT NULL DEFAULT '',
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Files (unified: documents + images + audios) ─────────────
CREATE TABLE IF NOT EXISTS files (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL DEFAULT '',
    mime        TEXT        NOT NULL DEFAULT '',
    file_type   TEXT        NOT NULL DEFAULT 'document',
    url         TEXT        NOT NULL DEFAULT '',
    object_key  TEXT        NOT NULL DEFAULT '',
    size        BIGINT      NOT NULL DEFAULT 0,
    source      TEXT        NOT NULL DEFAULT 'web',
    sub_type    TEXT        NOT NULL DEFAULT '',
    indexed     BOOLEAN     NOT NULL DEFAULT FALSE,
    prompt      TEXT,
    analysis    TEXT,
    duration    INTEGER     NOT NULL DEFAULT 0,
    transcript  TEXT,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_sections (
    id          BIGSERIAL   PRIMARY KEY,
    file_id     BIGINT      NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB       NOT NULL DEFAULT '{}'
);

-- ── Usage Logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
    id            BIGSERIAL      PRIMARY KEY,
    user_id       UUID           NOT NULL,
    model         TEXT           NOT NULL,
    provider      TEXT           NOT NULL DEFAULT '',
    input_tokens  INTEGER        NOT NULL DEFAULT 0,
    output_tokens INTEGER        NOT NULL DEFAULT 0,
    cached_tokens INTEGER        NOT NULL DEFAULT 0,
    cost_usd      NUMERIC(12, 8) NOT NULL DEFAULT 0,
    status        TEXT           NOT NULL DEFAULT 'success',
    call_type     TEXT           NOT NULL DEFAULT 'chat',
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── Notifications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    read        BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Scheduler Job Tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS report_task_runs (
    id          BIGSERIAL    PRIMARY KEY,
    job_name    TEXT         NOT NULL,
    started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status      TEXT         NOT NULL DEFAULT 'running',
    error       TEXT
);

-- ── Cron Schedules ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_schedules (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    cron_expr   TEXT        NOT NULL,
    action_type TEXT        NOT NULL DEFAULT 'notify',
    action_data JSONB       NOT NULL DEFAULT '{}',
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Budgets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category   TEXT        NOT NULL,
    amount     BIGINT      NOT NULL DEFAULT 0,
    period     TEXT        NOT NULL DEFAULT 'monthly',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, category, period)
);

-- ── Model Pricing ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_pricing (
    id              UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model           TEXT           NOT NULL,
    provider        TEXT           NOT NULL DEFAULT '',
    input_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    output_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
    cache_input_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, model)
);

-- =============================================================
-- INDEXES
-- =============================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- platform_identities
CREATE INDEX IF NOT EXISTS idx_platform_identities_user_id ON platform_identities(user_id);

-- platform_link_codes
CREATE INDEX IF NOT EXISTS idx_platform_link_codes_user_id ON platform_link_codes(user_id);

-- finances
CREATE INDEX IF NOT EXISTS idx_finances_user_id      ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_created_at   ON finances(created_at);
CREATE INDEX IF NOT EXISTS idx_finances_user_created ON finances(user_id, created_at DESC);


-- daily_logs
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id      ON daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_created ON daily_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_embedding    ON daily_logs
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_daily_logs_content_tsv  ON daily_logs USING gin(content_tsv);

-- knowledge_base
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id    ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_key   ON knowledge_base(user_id, key);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding  ON knowledge_base
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_tsv ON knowledge_base USING gin(content_tsv);

-- conversations
CREATE INDEX IF NOT EXISTS conversations_user_id_updated_at ON conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_platform           ON conversations (user_id, platform, updated_at DESC);

-- messages
CREATE INDEX IF NOT EXISTS messages_conv_created                ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created    ON messages(conversation_id, created_at ASC);

-- chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id      ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_channel       ON chat_sessions(user_id, channel, channel_session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated  ON chat_sessions(user_id, updated_at DESC);

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id      ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created  ON chat_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_embedding        ON chat_messages
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chat_messages_fts              ON chat_messages
    USING GIN (search_vector) WHERE search_vector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_search_vector    ON chat_messages
    USING gin(search_vector) WHERE search_vector IS NOT NULL;

-- channel_settings
CREATE INDEX IF NOT EXISTS idx_channel_settings_channel ON channel_settings (channel);

-- telegram pairing
CREATE INDEX IF NOT EXISTS idx_approved_contacts_owner        ON telegram_approved_contacts (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_owner_status  ON telegram_pairing_requests (owner_user_id, status);

-- providers
CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id);

-- model_assignments
CREATE INDEX IF NOT EXISTS idx_model_assignments_user_id      ON model_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_model_assignments_user_usecase  ON model_assignments(user_id, use_case);

-- personas
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);

-- (diary_entries, goals, goal_checkins, memos, content_tags, ddays indexes removed)

-- planner_roles
CREATE INDEX IF NOT EXISTS idx_planner_roles_user ON planner_roles(user_id);

-- planner_tasks
CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_date   ON planner_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_inbox  ON planner_tasks(user_id, is_inbox) WHERE is_inbox = TRUE;
CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_status ON planner_tasks(user_id, status);

-- planner_weekly_goals
CREATE INDEX IF NOT EXISTS idx_planner_wgoals_user_week ON planner_weekly_goals(user_id, week_start);

-- planner_goals
CREATE INDEX IF NOT EXISTS idx_planner_goals_user        ON planner_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_planner_goals_user_status ON planner_goals(user_id, status);

-- planner_diary
CREATE INDEX IF NOT EXISTS idx_planner_diary_user_date   ON planner_diary(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_planner_diary_embedding   ON planner_diary
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_planner_diary_content_tsv ON planner_diary USING gin(content_tsv);

-- planner_reflection_notes
CREATE INDEX IF NOT EXISTS idx_planner_reflections_user_date ON planner_reflection_notes(user_id, note_date);

-- searches
CREATE INDEX IF NOT EXISTS idx_searches_user_id    ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searches_embedding  ON searches
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_searches_content_tsv ON searches USING gin(content_tsv);

-- files
CREATE INDEX IF NOT EXISTS idx_files_user_id        ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_file_type      ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_user_type      ON files(user_id, file_type);
CREATE INDEX IF NOT EXISTS idx_files_created_at     ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_user_type_date ON files(user_id, file_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_name_trgm      ON files USING gin(name gin_trgm_ops);

-- file_sections
CREATE INDEX IF NOT EXISTS idx_file_sections_file_id     ON file_sections(file_id);
CREATE INDEX IF NOT EXISTS idx_file_sections_content_tsv ON file_sections USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_file_sections_embedding   ON file_sections
    USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)
    WHERE embedding IS NOT NULL;

-- usage_logs
CREATE INDEX IF NOT EXISTS usage_logs_user_id_idx    ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx ON usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_logs_user_date_idx  ON usage_logs (user_id, created_at DESC);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (user_id, created_at DESC);

-- report_task_runs
CREATE INDEX IF NOT EXISTS idx_report_task_runs_job_name   ON report_task_runs (job_name);
CREATE INDEX IF NOT EXISTS idx_report_task_runs_status     ON report_task_runs (status);
CREATE INDEX IF NOT EXISTS idx_report_task_runs_started_at ON report_task_runs (started_at DESC);

-- cron_schedules
CREATE INDEX IF NOT EXISTS idx_cron_schedules_user_id ON cron_schedules(user_id);

-- budgets
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

-- =============================================================
-- VIEWS & FUNCTIONS
-- =============================================================

-- Vector search function
CREATE OR REPLACE FUNCTION match_logs(
    query_embedding vector(768),
    match_threshold float,
    match_count     int,
    p_user_id       uuid
)
RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dl.id,
        dl.content,
        1 - (dl.embedding <=> query_embedding) AS similarity
    FROM daily_logs dl
    WHERE dl.user_id = p_user_id
      AND dl.embedding IS NOT NULL
      AND 1 - (dl.embedding <=> query_embedding) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- TSVector trigger functions
CREATE OR REPLACE FUNCTION daily_logs_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION knowledge_base_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.key, '') || ' ' || COALESCE(NEW.value, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION planner_diary_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.one_liner, '') || ' ' || COALESCE(NEW.full_note, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION searches_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.query, '') || ' ' || COALESCE(NEW.result, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION file_sections_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Default personas seed function
CREATE OR REPLACE FUNCTION fn_seed_default_personas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id, '기본 비서', '모든 기능을 지원하는 범용 AI 비서', '', '',
        'You are a smart, reliable personal AI assistant integrated into Starnion — a personal life management platform. Your role is to help the user with any task across all features: managing finances, writing diary entries, tracking goals, searching the web, analyzing documents and images, generating reports, and answering general questions.

Always respond in the user''s language. Be concise and practical. When the user''s request maps to a specific Starnion feature (e.g., adding a transaction, checking budget status, creating a goal), proactively use the available tools to complete it. If a request is ambiguous, ask one focused clarifying question rather than making assumptions. Maintain a professional yet approachable tone.',
        true
    ) ON CONFLICT DO NOTHING;

    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id, '마음 친구', '감정을 터놓고 대화할 수 있는 따뜻한 공감 파트너', '', '',
        'You are a warm, empathetic companion the user can talk to about anything — stress, worries, loneliness, joy, or anything weighing on their mind. Your primary role is to listen deeply and respond with genuine understanding, not to give advice unless explicitly asked.

Core behaviors:
- Prioritize empathy and emotional validation over problem-solving
- Reflect back what the user is feeling to show you truly understand
- Ask gentle, open-ended follow-up questions to help the user explore their feelings
- Never judge, minimize, or rush the user''s emotions
- Use a warm, natural, conversational tone — like a trusted friend who always has time for you
- If the user seems to be in serious distress, gently acknowledge their pain and, if appropriate, suggest they speak with a professional

You are not a therapist. You are a caring presence that helps the user feel heard and less alone.',
        false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id, '라이프 코치', '목표 달성과 성장을 함께하는 동기 부여 코치', '', '',
        'You are an energetic, results-oriented life coach focused on helping the user grow, build better habits, and achieve meaningful goals.

Core behaviors:
- Help the user clarify what they truly want and why it matters to them
- Break big goals into specific, actionable steps with realistic timelines
- Ask powerful coaching questions that challenge assumptions and spark insight
- Celebrate progress and reframe setbacks as learning opportunities
- Hold the user accountable without being harsh — be encouraging but honest
- When relevant, connect to Starnion features: review goal progress, check diary entries for patterns
- Keep energy positive and forward-focused

You are a partner in the user''s growth journey, not just an advisor.',
        false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id, '금융 전문가', '예산·지출·저축 전략을 도와주는 재정 어드바이저', '', '',
        'You are a knowledgeable personal finance expert with deep expertise in budgeting, expense analysis, savings strategies, and financial goal planning.

Core behaviors:
- Analyze spending patterns, budget utilization, and financial trends with precision
- Provide clear, actionable advice tailored to the user''s actual financial data
- Explain financial concepts in plain language — no unnecessary jargon
- Help the user set realistic savings targets and build sustainable budgets
- When data is available, use Starnion tools to retrieve actual transaction history, budget status, and reports before giving advice
- Flag potential financial risks proactively
- Balance analytical rigor with practical, real-world advice

Your goal is to help the user make smarter financial decisions, not just report numbers.',
        false
    ) ON CONFLICT DO NOTHING;

    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id, '데이터 분석가', '리포트·통계·패턴에서 인사이트를 도출하는 분석 전문가', '', '',
        'You are a sharp, detail-oriented data analyst who specializes in turning raw data into clear insights.

Core behaviors:
- Interpret data accurately and surface meaningful trends, anomalies, and correlations
- Present findings in a structured, easy-to-understand format — use tables, comparisons, and percentages where helpful
- Go beyond describing what the data shows — explain what it means and what the user should consider doing
- When generating insights, leverage all available Starnion data
- Ask clarifying questions about the scope or timeframe of analysis when needed
- Be precise with numbers; avoid vague statements
- Maintain an analytical, objective tone while keeping explanations accessible

Your job is to make the user''s data speak clearly and help them act on what it reveals.',
        false
    ) ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

-- =============================================================
-- TRIGGERS
-- =============================================================

-- TSVector triggers
DROP TRIGGER IF EXISTS trg_daily_logs_tsv ON daily_logs;
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();

DROP TRIGGER IF EXISTS trg_knowledge_base_tsv ON knowledge_base;
CREATE TRIGGER trg_knowledge_base_tsv
    BEFORE INSERT OR UPDATE OF key, value ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION knowledge_base_tsv_trigger();

DROP TRIGGER IF EXISTS trg_planner_diary_tsv ON planner_diary;
CREATE TRIGGER trg_planner_diary_tsv
    BEFORE INSERT OR UPDATE OF one_liner, full_note ON planner_diary
    FOR EACH ROW EXECUTE FUNCTION planner_diary_tsv_trigger();

DROP TRIGGER IF EXISTS trg_searches_tsv ON searches;
CREATE TRIGGER trg_searches_tsv
    BEFORE INSERT OR UPDATE OF query, result ON searches
    FOR EACH ROW EXECUTE FUNCTION searches_tsv_trigger();

DROP TRIGGER IF EXISTS trg_file_sections_tsv ON file_sections;
CREATE TRIGGER trg_file_sections_tsv
    BEFORE INSERT OR UPDATE OF content ON file_sections
    FOR EACH ROW EXECUTE FUNCTION file_sections_tsv_trigger();

-- updated_at triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- (diary_entries, goals updated_at triggers removed)

-- Default personas trigger
DROP TRIGGER IF EXISTS trg_seed_default_personas ON users;
CREATE TRIGGER trg_seed_default_personas
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION fn_seed_default_personas();

-- =============================================================
-- SEED DATA
-- =============================================================

-- Version records
INSERT INTO schema_migrations (version) VALUES ('1.0.0') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('2.0.0') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('2.1.0') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('3.0.0') ON CONFLICT DO NOTHING;

-- =============================================================
-- DEFERRED FOREIGN KEYS (cross-table references)
-- =============================================================
-- conversations.persona_id → personas (personas created after conversations)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_conversations_persona_id' AND table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT fk_conversations_persona_id
      FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL;
  END IF;
END $$;
