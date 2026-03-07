-- Migration 008: Add platform column to conversations
-- Supports multi-platform conversation view (telegram, discord, slack, etc.)

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS conversations_platform
  ON conversations (user_id, platform, updated_at DESC);

-- Backfill: create a read-only Telegram conversation row for every linked Telegram account.
-- id = user_id (UUID) = LangGraph thread_id used by the Telegram bot.
INSERT INTO conversations (id, user_id, title, platform)
SELECT user_id::uuid, user_id, '텔레그램', 'telegram'
FROM platform_identities
WHERE platform = 'telegram'
ON CONFLICT (id) DO NOTHING;
