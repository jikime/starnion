-- Migration 010: Create messages table for cursor-based pagination
-- Stores all chat messages separately from LangGraph checkpoints.
-- Enables efficient paginated history without loading entire LangGraph state.

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conv_created
    ON messages (conversation_id, created_at DESC);
