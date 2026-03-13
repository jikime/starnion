-- =============================================================
-- v1.4.0 — Add language preference support
--
-- Changes:
--   1. Set default language preference ('ko') for existing users
--      whose preferences JSONB does not yet contain a "language" key.
--
-- SPEC: SPEC-I18N-001
-- Date: 2026-03-13
-- Idempotent: safe to run multiple times (WHERE guard on NULL check).
-- =============================================================

-- ─── 1. 기존 사용자 preferences에 language 기본값 'ko' 추가 ────────────────────
-- For existing users without language setting, default to Korean
UPDATE users
SET preferences = jsonb_set(
    COALESCE(preferences, '{}'::jsonb),
    '{language}',
    '"ko"'::jsonb,
    true
)
WHERE preferences->>'language' IS NULL;

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.4.0') ON CONFLICT DO NOTHING;
