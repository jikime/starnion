-- Migration 005: Multi-Platform Identity Federation
-- 기존 telegram_id 기반 구조를 플랫폼 독립적 user_id(UUID)로 전환
-- 기존 Telegram 데이터는 모두 보존됨

-- ============================================================
-- Step 1: 새 테이블 생성
-- ============================================================

-- 플랫폼 독립적 중앙 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,           -- UUID (gen_random_uuid()::text)
    display_name TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 플랫폼 ID → user_id 매핑 테이블
CREATE TABLE IF NOT EXISTS platform_identities (
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL,          -- 'telegram'|'discord'|'slack'|'kakao'|'teams'|'whatsapp'|'web'
    platform_id     TEXT NOT NULL,          -- 각 플랫폼의 native user ID
    display_name    TEXT,
    metadata        JSONB DEFAULT '{}',     -- 플랫폼별 추가 정보 (username, avatar 등)
    last_active_at  TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_identities_user_id
    ON platform_identities(user_id);

-- 계정 연결 페어링 코드 테이블 (임시 코드로 플랫폼 간 연결)
CREATE TABLE IF NOT EXISTS platform_link_codes (
    code        TEXT PRIMARY KEY,           -- e.g. "JIKI-7492"
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_link_codes_user_id
    ON platform_link_codes(user_id);

-- ============================================================
-- Step 2: profiles 테이블에 uuid_id 임시 컬럼 추가 후 백필
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uuid_id TEXT;

-- 기존 각 Telegram 사용자에 대해 UUID 생성
UPDATE profiles
SET uuid_id = gen_random_uuid()::text
WHERE uuid_id IS NULL;

-- uuid_id NOT NULL 제약 추가
ALTER TABLE profiles ALTER COLUMN uuid_id SET NOT NULL;

-- ============================================================
-- Step 3: users 테이블에 기존 Telegram 사용자 데이터 삽입
-- ============================================================

INSERT INTO users (id, display_name, created_at, updated_at)
SELECT uuid_id, user_name, created_at, updated_at
FROM profiles
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 4: platform_identities에 Telegram 계정 연결
-- ============================================================

INSERT INTO platform_identities (user_id, platform, platform_id, display_name, created_at)
SELECT uuid_id, 'telegram', telegram_id, user_name, created_at
FROM profiles
ON CONFLICT (platform, platform_id) DO NOTHING;

-- ============================================================
-- Step 5: finances 테이블 user_id → UUID로 업데이트
-- ============================================================

-- FK 제약 임시 해제
ALTER TABLE finances DROP CONSTRAINT IF EXISTS finances_user_id_fkey;

-- 데이터 업데이트: telegram_id → UUID
UPDATE finances f
SET user_id = p.uuid_id
FROM profiles p
WHERE f.user_id = p.telegram_id;

-- 새 FK 추가
ALTER TABLE finances
    ADD CONSTRAINT finances_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

-- ============================================================
-- Step 6: daily_logs 테이블 user_id → UUID로 업데이트
-- ============================================================

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_user_id_fkey;

UPDATE daily_logs dl
SET user_id = p.uuid_id
FROM profiles p
WHERE dl.user_id = p.telegram_id;

ALTER TABLE daily_logs
    ADD CONSTRAINT daily_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

-- ============================================================
-- Step 7: user_documents 테이블 user_id → UUID로 업데이트
-- ============================================================

ALTER TABLE user_documents DROP CONSTRAINT IF EXISTS user_documents_user_id_fkey;

UPDATE user_documents ud
SET user_id = p.uuid_id
FROM profiles p
WHERE ud.user_id = p.telegram_id;

ALTER TABLE user_documents
    ADD CONSTRAINT user_documents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

-- ============================================================
-- Step 8: knowledge_base 테이블 user_id → UUID로 업데이트
-- ============================================================

ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_user_id_fkey;

UPDATE knowledge_base kb
SET user_id = p.uuid_id
FROM profiles p
WHERE kb.user_id = p.telegram_id;

ALTER TABLE knowledge_base
    ADD CONSTRAINT knowledge_base_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

-- ============================================================
-- Step 9: user_skills 테이블 user_id → UUID로 업데이트
-- ============================================================

-- user_skills는 FK가 없으므로 직접 업데이트
UPDATE user_skills us
SET user_id = p.uuid_id
FROM profiles p
WHERE us.user_id = p.telegram_id;

-- ============================================================
-- Step 10: google_tokens 테이블 user_id → UUID로 업데이트
-- ============================================================

-- google_tokens.user_id는 PK이므로 특별 처리 필요
-- 임시 테이블로 데이터 이동
CREATE TEMP TABLE google_tokens_backup AS SELECT * FROM google_tokens;

TRUNCATE google_tokens;

INSERT INTO google_tokens (user_id, access_token, refresh_token, token_uri, scopes, expires_at, created_at, updated_at)
SELECT p.uuid_id, b.access_token, b.refresh_token, b.token_uri, b.scopes, b.expires_at, b.created_at, b.updated_at
FROM google_tokens_backup b
JOIN profiles p ON p.telegram_id = b.user_id;

DROP TABLE google_tokens_backup;

-- ============================================================
-- Step 11: match_logs 함수 업데이트 (p_user_id는 이제 UUID)
-- ============================================================

CREATE OR REPLACE FUNCTION match_logs(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id text
)
RETURNS TABLE (
  id bigint,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    daily_logs.id,
    daily_logs.content,
    1 - (daily_logs.embedding <=> query_embedding) AS similarity
  FROM daily_logs
  WHERE daily_logs.user_id = p_user_id
    AND 1 - (daily_logs.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 완료 확인
-- ============================================================

-- profiles.uuid_id는 platform_identities 역참조용으로 유지
-- profiles.telegram_id는 Telegram API (chat_id) 조회용으로 유지
-- 모든 데이터 테이블은 이제 users.id (UUID) 기준으로 동작
