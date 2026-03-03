-- Add attachments column to messages for MinIO file references.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;
