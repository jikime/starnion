-- Migration 009: Add thread_id column to conversations
-- Separates the UI conversation UUID from the actual LangGraph thread_id.
-- For web conversations, thread_id = id (same UUID).
-- For telegram, thread_id = numeric telegram platform_id (where checkpoints actually live).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS thread_id TEXT;

-- Web conversations: thread_id equals the conversation UUID.
UPDATE conversations
  SET thread_id = id::text
  WHERE platform = 'web';

-- Telegram conversations: use the numeric telegram platform_id as thread_id
-- so history lookup hits the correct LangGraph checkpoints.
UPDATE conversations c
  SET thread_id = pi.platform_id
  FROM platform_identities pi
  WHERE c.user_id = pi.user_id
    AND pi.platform = 'telegram'
    AND c.platform = 'telegram';

-- Fallback: any remaining nulls default to id.
UPDATE conversations
  SET thread_id = id::text
  WHERE thread_id IS NULL;

ALTER TABLE conversations
  ALTER COLUMN thread_id SET NOT NULL;
