-- =============================================================
-- v1.4.1 — Add endpoint_type to providers, add model_assignments table
--
-- Changes:
--   1. providers: endpoint_type TEXT NOT NULL DEFAULT 'other' 컬럼 추가
--   2. model_assignments 테이블 신규 생성
--
-- Date: 2026-03-14
-- Idempotent: safe to run multiple times (IF NOT EXISTS / IF column not exists guards).
-- =============================================================

-- ─── 1. providers 테이블에 endpoint_type 컬럼 추가 ─────────────────────────────
ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS endpoint_type TEXT NOT NULL DEFAULT 'other';

-- ─── 2. model_assignments 테이블 생성 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_assignments (
    id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    use_case   TEXT        NOT NULL,
    provider   TEXT        NOT NULL DEFAULT '',
    model      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, use_case)
);
CREATE INDEX IF NOT EXISTS idx_model_assignments_user_id ON model_assignments(user_id);

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.4.1') ON CONFLICT DO NOTHING;
