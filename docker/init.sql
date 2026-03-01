-- jiki Database Initialization
-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- User profiles (onboarding data)
CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  user_name TEXT,
  goals TEXT[],
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial records
CREATE TABLE IF NOT EXISTS finances (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(telegram_id),
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily logs with vector embedding for RAG
CREATE TABLE IF NOT EXISTS daily_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(telegram_id),
  content TEXT NOT NULL,
  sentiment TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document storage
CREATE TABLE IF NOT EXISTS user_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(telegram_id),
  title TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document chunks for RAG
CREATE TABLE IF NOT EXISTS document_sections (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'
);

-- Knowledge base entries
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(telegram_id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finances_user_id ON finances(user_id);
CREATE INDEX IF NOT EXISTS idx_finances_created_at ON finances(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id ON daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base(user_id);

-- HNSW vector indexes for fast similarity search
CREATE INDEX IF NOT EXISTS idx_daily_logs_embedding ON daily_logs
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_sections_embedding ON document_sections
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_logs(
  query_embedding vector(1536),
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
