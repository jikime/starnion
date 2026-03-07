-- Migration: Fix vector dimensions from 1536 to 768 for text-embedding-004
-- Run against an existing database that was initialised with vector(1536).

-- 1. Drop HNSW indexes (cannot alter column type with indexes present).
DROP INDEX IF EXISTS idx_daily_logs_embedding;
DROP INDEX IF EXISTS idx_document_sections_embedding;
DROP INDEX IF EXISTS idx_knowledge_base_embedding;

-- 2. Alter column types.
ALTER TABLE daily_logs ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE document_sections ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE knowledge_base ALTER COLUMN embedding TYPE vector(768);

-- 3. Recreate HNSW indexes.
CREATE INDEX idx_daily_logs_embedding ON daily_logs
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_document_sections_embedding ON document_sections
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_knowledge_base_embedding ON knowledge_base
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 4. Update match_logs function signature.
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
    AND daily_logs.embedding IS NOT NULL
    AND 1 - (daily_logs.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
