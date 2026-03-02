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
  embedding vector(768),
  content_tsv tsvector,
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
  embedding vector(768),
  content_tsv tsvector,
  metadata JSONB DEFAULT '{}'
);

-- Knowledge base entries
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(telegram_id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  embedding vector(768),
  content_tsv tsvector,
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

-- GIN indexes for full-text search
CREATE INDEX IF NOT EXISTS idx_daily_logs_content_tsv ON daily_logs USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_tsv ON knowledge_base USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_document_sections_content_tsv ON document_sections USING gin(content_tsv);

-- Vector similarity search function
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

-- Trigger functions to auto-populate tsvector on INSERT/UPDATE

CREATE OR REPLACE FUNCTION daily_logs_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION knowledge_base_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.key, '') || ' ' || COALESCE(NEW.value, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION document_sections_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_logs_tsv
  BEFORE INSERT OR UPDATE OF content ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();

CREATE TRIGGER trg_knowledge_base_tsv
  BEFORE INSERT OR UPDATE OF key, value ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION knowledge_base_tsv_trigger();

CREATE TRIGGER trg_document_sections_tsv
  BEFORE INSERT OR UPDATE OF content ON document_sections
  FOR EACH ROW EXECUTE FUNCTION document_sections_tsv_trigger();
