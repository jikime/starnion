-- =============================================================
-- StarNion Database Schema — v1.0.0 Baseline
-- Fresh-install baseline: run this on a new database.
-- For upgrades, use docker/migrations/incremental/*.sql instead.
-- PostgreSQL 16 + pgvector
-- =============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================
-- MIGRATION TRACKING
-- =============================================================

-- Records which schema versions have been applied to this database.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT        NOT NULL PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark this baseline as applied immediately after creation.
INSERT INTO schema_migrations (version) VALUES ('1.0.0') ON CONFLICT DO NOTHING;

-- =============================================================
-- IDENTITY & AUTH
-- =============================================================

-- Central users table — identity + credentials + preferences in one place.
-- email/password_hash are NULL for non-credential users (e.g. Telegram-only).
-- role: 'admin' | 'user'  (default 'user')
CREATE TABLE IF NOT EXISTS users (
    id            TEXT        NOT NULL PRIMARY KEY,
    display_name  TEXT,
    email         TEXT        UNIQUE,
    password_hash TEXT,
    role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    preferences   JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform → user_id mapping (telegram / discord / web / credential / …)
CREATE TABLE IF NOT EXISTS platform_identities (
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform       TEXT        NOT NULL,  -- 'telegram'|'discord'|'slack'|'kakao'|'web'|'credential'
    platform_id    TEXT        NOT NULL,  -- platform-native ID (e.g. telegram chat_id, email)
    display_name   TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_identities_user_id
    ON platform_identities(user_id);

-- One-time account-linking codes (10-min TTL)
CREATE TABLE IF NOT EXISTS platform_link_codes (
    code       TEXT        NOT NULL PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_link_codes_user_id
    ON platform_link_codes(user_id);


-- =============================================================
-- FINANCIAL RECORDS
-- =============================================================

CREATE TABLE IF NOT EXISTS finances (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER     NOT NULL,          -- KRW
    category    TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finances_user_id      ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_created_at   ON finances(created_at);
CREATE INDEX IF NOT EXISTS idx_finances_user_created ON finances(user_id, created_at DESC);

-- =============================================================
-- DAILY LOGS  (vector + full-text hybrid RAG)
-- =============================================================

CREATE TABLE IF NOT EXISTS daily_logs (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    sentiment   TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id      ON daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_created ON daily_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_embedding ON daily_logs
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_daily_logs_content_tsv
    ON daily_logs USING gin(content_tsv);

-- =============================================================
-- DOCUMENTS
-- =============================================================

CREATE TABLE IF NOT EXISTS documents (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    file_type   TEXT        NOT NULL,
    file_url    TEXT        NOT NULL,
    object_key  TEXT        NOT NULL DEFAULT '',
    size        BIGINT      NOT NULL DEFAULT 0,
    indexed     BOOLEAN     NOT NULL DEFAULT FALSE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_id     ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS document_sections (
    id          BIGSERIAL NOT NULL PRIMARY KEY,
    document_id BIGINT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT      NOT NULL,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB     NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_document_sections_embedding ON document_sections
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_document_sections_content_tsv
    ON document_sections USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
    ON document_sections(document_id);

-- =============================================================
-- IMAGES
-- =============================================================

CREATE TABLE IF NOT EXISTS images (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    name       TEXT        NOT NULL DEFAULT 'image.png',
    mime       TEXT        NOT NULL DEFAULT 'image/png',
    size       BIGINT      NOT NULL DEFAULT 0,
    source     TEXT        NOT NULL DEFAULT 'web',        -- 'web', 'telegram', 'webchat'
    type       TEXT        NOT NULL DEFAULT 'generated',  -- 'generated', 'edited', 'analyzed'
    prompt     TEXT,
    analysis   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_images_user_id    ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);

-- =============================================================
-- AUDIOS
-- =============================================================

CREATE TABLE IF NOT EXISTS audios (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    name       TEXT        NOT NULL DEFAULT 'audio.wav',
    mime       TEXT        NOT NULL DEFAULT 'audio/wav',
    size       BIGINT      NOT NULL DEFAULT 0,
    duration   INTEGER     NOT NULL DEFAULT 0,             -- seconds (best-effort)
    source     TEXT        NOT NULL DEFAULT 'web',         -- 'web', 'telegram', 'webchat'
    type       TEXT        NOT NULL DEFAULT 'uploaded',    -- 'uploaded', 'recorded', 'generated'
    transcript TEXT,
    prompt     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audios_user_id    ON audios(user_id);
CREATE INDEX IF NOT EXISTS idx_audios_created_at ON audios(created_at DESC);

-- =============================================================
-- REPORTS
-- =============================================================

CREATE TABLE IF NOT EXISTS reports (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    report_type TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type       ON reports(report_type);

-- =============================================================
-- KNOWLEDGE BASE  (vector + full-text hybrid RAG)
-- =============================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
    id          BIGSERIAL   NOT NULL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    source      TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id  ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_key ON knowledge_base(user_id, key);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_tsv
    ON knowledge_base USING gin(content_tsv);

-- =============================================================
-- SKILLS (catalog + per-user settings)
-- =============================================================

CREATE TABLE IF NOT EXISTS skills (
    id                 TEXT        NOT NULL PRIMARY KEY,
    name               TEXT        NOT NULL,
    description        TEXT        NOT NULL,
    category           TEXT        NOT NULL,
    emoji              TEXT                 DEFAULT '',
    tools              TEXT[]               DEFAULT '{}',
    reports            TEXT[]               DEFAULT '{}',
    cron_rules         TEXT[]               DEFAULT '{}',
    enabled_by_default BOOLEAN              DEFAULT TRUE,
    permission_level   INT                  DEFAULT 1,
    sort_order         INT                  DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_id    TEXT        NOT NULL,
    skill_id   TEXT        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    enabled    BOOLEAN     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

-- =============================================================
-- GOOGLE OAUTH2 TOKENS
-- =============================================================

CREATE TABLE IF NOT EXISTS google_tokens (
    user_id       TEXT        NOT NULL PRIMARY KEY,
    access_token  TEXT        NOT NULL,
    refresh_token TEXT        NOT NULL,
    token_uri     TEXT                 DEFAULT 'https://oauth2.googleapis.com/token',
    scopes        TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INTEGRATION KEYS  (Notion, GitHub, etc.)
-- =============================================================

CREATE TABLE IF NOT EXISTS integration_keys (
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider   TEXT        NOT NULL,  -- 'notion' | 'github' | etc.
    api_key    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider)
);

-- =============================================================
-- CONVERSATIONS & MESSAGES
-- =============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL DEFAULT '새 대화',
    platform   TEXT        NOT NULL DEFAULT 'web',   -- 'web', 'telegram', 'discord', …
    thread_id  TEXT        NOT NULL,                 -- LangGraph thread ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_id_updated_at
    ON conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_platform
    ON conversations (user_id, platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL,
    attachments     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conv_created
    ON messages (conversation_id, created_at DESC);

-- =============================================================
-- CHANNEL SETTINGS  (per-user)
-- =============================================================

CREATE TABLE IF NOT EXISTS channel_settings (
    user_id      TEXT        NOT NULL,
    channel      TEXT        NOT NULL,
    bot_token    TEXT        NOT NULL DEFAULT '',
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy    TEXT        NOT NULL DEFAULT 'allow',   -- allow | pairing | deny
    group_policy TEXT        NOT NULL DEFAULT 'allow',   -- allow | mention | deny
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_channel_settings_channel
    ON channel_settings (channel);

-- Telegram pairing
CREATE TABLE IF NOT EXISTS telegram_approved_contacts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id TEXT        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_approved_contacts_owner
    ON telegram_approved_contacts (owner_user_id);

CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id TEXT        NOT NULL,
    telegram_id   TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    message_text  TEXT        NOT NULL DEFAULT '',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | denied
    resolved_at   TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_owner_status
    ON telegram_pairing_requests (owner_user_id, status);

-- =============================================================
-- USER PROVIDERS & PERSONAS
-- =============================================================

CREATE TABLE IF NOT EXISTS providers (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL,  -- 'anthropic' | 'gemini' | 'openai' | 'zai' | 'custom'
    api_key        TEXT        NOT NULL DEFAULT '',
    base_url       TEXT        NOT NULL DEFAULT '',   -- required for 'custom'
    enabled_models TEXT[]      NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id);

CREATE TABLE IF NOT EXISTS personas (
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
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);

-- v1.3.5: Auto-seed 5 built-in personas for every new user.
CREATE OR REPLACE FUNCTION fn_seed_default_personas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- 1. 기본 비서
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id,
        '기본 비서',
        '모든 기능을 지원하는 범용 AI 비서',
        '', '',
        'You are a smart, reliable personal AI assistant integrated into Starnion — a personal life management platform. Your role is to help the user with any task across all features: managing finances, writing diary entries, tracking goals, searching the web, analyzing documents and images, generating reports, and answering general questions.

Always respond in the user''s language. Be concise and practical. When the user''s request maps to a specific Starnion feature (e.g., adding a transaction, checking budget status, creating a goal), proactively use the available tools to complete it. If a request is ambiguous, ask one focused clarifying question rather than making assumptions. Maintain a professional yet approachable tone.',
        true
    )
    ON CONFLICT DO NOTHING;

    -- 2. 마음 친구
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id,
        '마음 친구',
        '감정을 터놓고 대화할 수 있는 따뜻한 공감 파트너',
        '', '',
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
    )
    ON CONFLICT DO NOTHING;

    -- 3. 라이프 코치
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id,
        '라이프 코치',
        '목표 달성과 성장을 함께하는 동기 부여 코치',
        '', '',
        'You are an energetic, results-oriented life coach focused on helping the user grow, build better habits, and achieve meaningful goals. You work across all life dimensions: personal development, productivity, health, relationships, and daily routines.

Core behaviors:
- Help the user clarify what they truly want and why it matters to them
- Break big goals into specific, actionable steps with realistic timelines
- Ask powerful coaching questions that challenge assumptions and spark insight (e.g., "What would need to be true for this to work?")
- Celebrate progress and reframe setbacks as learning opportunities
- Hold the user accountable without being harsh — be encouraging but honest
- When relevant, connect to Starnion features: review goal progress, check diary entries for patterns, analyze habits over time
- Keep energy positive and forward-focused; avoid dwelling on past failures

You are a partner in the user''s growth journey, not just an advisor.',
        false
    )
    ON CONFLICT DO NOTHING;

    -- 4. 금융 전문가
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id,
        '금융 전문가',
        '예산·지출·저축 전략을 도와주는 재정 어드바이저',
        '', '',
        'You are a knowledgeable personal finance expert with deep expertise in budgeting, expense analysis, savings strategies, and financial goal planning. You help the user take full control of their financial life using data from Starnion.

Core behaviors:
- Analyze spending patterns, budget utilization, and financial trends with precision
- Provide clear, actionable advice tailored to the user''s actual financial data
- Explain financial concepts in plain language — no unnecessary jargon
- Help the user set realistic savings targets and build sustainable budgets
- When data is available, use Starnion tools to retrieve actual transaction history, budget status, and reports before giving advice
- Flag potential financial risks (overspending in categories, insufficient emergency fund, etc.) proactively
- Balance analytical rigor with practical, real-world advice the user can act on today

Your goal is to help the user make smarter financial decisions, not just report numbers.',
        false
    )
    ON CONFLICT DO NOTHING;

    -- 5. 데이터 분석가
    INSERT INTO personas (user_id, name, description, provider, model, system_prompt, is_default)
    VALUES (
        NEW.id,
        '데이터 분석가',
        '리포트·통계·패턴에서 인사이트를 도출하는 분석 전문가',
        '', '',
        'You are a sharp, detail-oriented data analyst who specializes in turning raw data into clear insights. Within Starnion, you focus on financial reports, spending statistics, behavioral patterns, usage analytics, and goal progress metrics.

Core behaviors:
- Interpret data accurately and surface meaningful trends, anomalies, and correlations
- Present findings in a structured, easy-to-understand format — use tables, comparisons, and percentages where helpful
- Go beyond describing what the data shows — explain what it means and what the user should consider doing
- When generating insights, leverage all available Starnion data: transaction history, report summaries, goal progress, and activity logs
- Ask clarifying questions about the scope or timeframe of analysis when needed
- Be precise with numbers; avoid vague statements like "spending increased" — say "spending increased 23% compared to last month"
- Maintain an analytical, objective tone while keeping explanations accessible

Your job is to make the user''s data speak clearly and help them act on what it reveals.',
        false
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_counselor_persona ON users;
DROP TRIGGER IF EXISTS trg_seed_default_personas ON users;
CREATE TRIGGER trg_seed_default_personas
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION fn_seed_default_personas();

-- =============================================================
-- LIFE — DIARY
-- =============================================================

CREATE TABLE IF NOT EXISTS diary_entries (
    id          SERIAL      PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL,
    mood        TEXT        NOT NULL DEFAULT '보통'
                            CHECK (mood IN ('매우좋음', '좋음', '보통', '나쁨', '매우나쁨')),
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    entry_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_embedding ON diary_entries
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_diary_entries_content_tsv ON diary_entries USING gin(content_tsv);

-- =============================================================
-- LIFE — GOALS
-- =============================================================

CREATE TABLE IF NOT EXISTS goals (
    id             BIGSERIAL   PRIMARY KEY,
    user_id        TEXT        NOT NULL,
    title          TEXT        NOT NULL,
    icon           TEXT        NOT NULL DEFAULT '🎯',
    category       TEXT        NOT NULL DEFAULT 'general',
    target_value   NUMERIC     NOT NULL DEFAULT 0,
    current_value  NUMERIC     NOT NULL DEFAULT 0,
    unit           TEXT        NOT NULL DEFAULT '',
    start_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
    end_date       DATE,
    status         TEXT        NOT NULL DEFAULT 'in_progress'
                               CHECK (status IN ('in_progress','completed','abandoned')),
    description    TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    completed_date DATE,
    abandoned_date DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user_status  ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS goal_checkins (
    id         BIGSERIAL   PRIMARY KEY,
    goal_id    BIGINT      NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id    TEXT        NOT NULL,
    check_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(goal_id, check_date)
);
CREATE INDEX IF NOT EXISTS idx_goal_checkins_goal ON goal_checkins(goal_id);

-- =============================================================
-- LIFE — MEMOS
-- =============================================================

CREATE TABLE IF NOT EXISTS memos (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    tag         TEXT        NOT NULL DEFAULT '개인',
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memos_user_id          ON memos(user_id);
CREATE INDEX IF NOT EXISTS idx_memos_user_tag_created ON memos(user_id, tag, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_embedding ON memos
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_memos_content_tsv ON memos USING gin(content_tsv);

-- =============================================================
-- MEMORY — CONTENT TAGS (auto-tagging overlay)
-- =============================================================

CREATE TABLE IF NOT EXISTS content_tags (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    source      TEXT        NOT NULL CHECK (source IN ('diary', 'memo')),
    source_id   BIGINT      NOT NULL,
    tag         TEXT        NOT NULL,
    auto_tagged BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, source_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_content_tags_user_tag ON content_tags(user_id, tag);
CREATE INDEX IF NOT EXISTS idx_content_tags_source   ON content_tags(source, source_id);

-- =============================================================
-- LIFE — D-DAY
-- =============================================================

CREATE TABLE IF NOT EXISTS ddays (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    target_date DATE        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '📅',
    description TEXT        NOT NULL DEFAULT '',
    recurring   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ddays_user_id ON ddays(user_id);

-- =============================================================
-- WEB SEARCHES
-- =============================================================

CREATE TABLE IF NOT EXISTS searches (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query       TEXT        NOT NULL,
    result      TEXT        NOT NULL DEFAULT '',
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_searches_user_id    ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searches_embedding ON searches
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_searches_content_tsv
    ON searches USING gin(content_tsv);

-- =============================================================
-- USAGE LOGS
-- =============================================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id            BIGSERIAL      PRIMARY KEY,
    user_id       TEXT           NOT NULL,
    model         TEXT           NOT NULL,
    provider      TEXT           NOT NULL DEFAULT '',
    input_tokens  INTEGER        NOT NULL DEFAULT 0,
    output_tokens INTEGER        NOT NULL DEFAULT 0,
    cached_tokens INTEGER        NOT NULL DEFAULT 0,
    cost_usd      NUMERIC(12, 8) NOT NULL DEFAULT 0,
    status        TEXT           NOT NULL DEFAULT 'success',  -- 'success' | 'error'
    call_type     TEXT           NOT NULL DEFAULT 'chat',     -- 'chat' | 'tool' | 'embed'
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_logs_user_id_idx    ON usage_logs (user_id);
CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx ON usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_logs_user_date_idx  ON usage_logs (user_id, created_at DESC);

-- =============================================================
-- NOTIFICATIONS
-- =============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL,   -- budget_warning, dday, inactive_reminder, spending_anomaly, daily_summary, monthly_closing, pattern_insight, goal_status, weekly
    message     TEXT        NOT NULL,
    read        BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (user_id, created_at DESC);

-- =============================================================
-- FUNCTIONS
-- =============================================================

-- Vector similarity search over daily_logs
CREATE OR REPLACE FUNCTION match_logs(
    query_embedding vector(768),
    match_threshold float,
    match_count     int,
    p_user_id       text
)
RETURNS TABLE (id bigint, content text, similarity float)
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

-- =============================================================
-- TSVECTOR TRIGGERS  (auto-populate on INSERT/UPDATE)
-- =============================================================

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

CREATE OR REPLACE FUNCTION document_sections_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION diary_entries_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION memos_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
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

DROP TRIGGER IF EXISTS trg_daily_logs_tsv ON daily_logs;
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();

DROP TRIGGER IF EXISTS trg_knowledge_base_tsv ON knowledge_base;
CREATE TRIGGER trg_knowledge_base_tsv
    BEFORE INSERT OR UPDATE OF key, value ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION knowledge_base_tsv_trigger();

DROP TRIGGER IF EXISTS trg_document_sections_tsv ON document_sections;
CREATE TRIGGER trg_document_sections_tsv
    BEFORE INSERT OR UPDATE OF content ON document_sections
    FOR EACH ROW EXECUTE FUNCTION document_sections_tsv_trigger();

DROP TRIGGER IF EXISTS trg_diary_entries_tsv ON diary_entries;
CREATE TRIGGER trg_diary_entries_tsv
    BEFORE INSERT OR UPDATE OF title, content ON diary_entries
    FOR EACH ROW EXECUTE FUNCTION diary_entries_tsv_trigger();

DROP TRIGGER IF EXISTS trg_memos_tsv ON memos;
CREATE TRIGGER trg_memos_tsv
    BEFORE INSERT OR UPDATE OF title, content ON memos
    FOR EACH ROW EXECUTE FUNCTION memos_tsv_trigger();

DROP TRIGGER IF EXISTS trg_searches_tsv ON searches;
CREATE TRIGGER trg_searches_tsv
    BEFORE INSERT OR UPDATE OF query, result ON searches
    FOR EACH ROW EXECUTE FUNCTION searches_tsv_trigger();

-- =============================================================
-- MIGRATION VERSION RECORDS
-- Records all incremental migrations that this baseline already
-- includes, so the gateway migration runner skips them.
-- =============================================================
INSERT INTO schema_migrations (version) VALUES ('1.3.1') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('1.3.2') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('1.3.3') ON CONFLICT DO NOTHING;
