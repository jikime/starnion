-- Migration 024: Add indexed flag to user_documents
-- Tracks whether a document has been chunked/embedded by the agent indexer.

ALTER TABLE user_documents
    ADD COLUMN IF NOT EXISTS indexed BOOLEAN NOT NULL DEFAULT FALSE;
