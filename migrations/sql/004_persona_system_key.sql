-- 004_persona_system_key.sql
-- Add system_key to personas to enable i18n for built-in seed personas.

ALTER TABLE personas ADD COLUMN IF NOT EXISTS system_key VARCHAR(64);

-- Backfill existing seed personas by matching known Korean names.
UPDATE personas SET system_key = 'default_assistant' WHERE system_key IS NULL AND name = '기본 비서';
UPDATE personas SET system_key = 'empathy_friend'    WHERE system_key IS NULL AND name = '마음 친구';
UPDATE personas SET system_key = 'life_coach'        WHERE system_key IS NULL AND name = '라이프 코치';
UPDATE personas SET system_key = 'finance_expert'    WHERE system_key IS NULL AND name = '금융 전문가';
UPDATE personas SET system_key = 'data_analyst'      WHERE system_key IS NULL AND name = '데이터 분석가';
