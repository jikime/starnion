-- Add missing columns to user_documents for MinIO integration
ALTER TABLE user_documents
    ADD COLUMN IF NOT EXISTS object_key TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS size       BIGINT  NOT NULL DEFAULT 0;
