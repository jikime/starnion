-- Migration 002: Add full-text search support (tsvector + GIN indexes)
-- Adds tsvector columns alongside existing pgvector embeddings for hybrid search.
-- Uses 'simple' configuration for Korean/English mixed-language tokenization.

-- 1. Add tsvector columns
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS content_tsv tsvector;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS content_tsv tsvector;
ALTER TABLE document_sections ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- 2. GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS idx_daily_logs_content_tsv ON daily_logs USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_tsv ON knowledge_base USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_document_sections_content_tsv ON document_sections USING gin(content_tsv);

-- 3. Trigger functions to auto-populate tsvector on INSERT/UPDATE

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

-- 4. Triggers (BEFORE INSERT OR UPDATE)

DROP TRIGGER IF EXISTS trg_daily_logs_tsv ON daily_logs;
CREATE TRIGGER trg_daily_logs_tsv
  BEFORE INSERT OR UPDATE OF content ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();

DROP TRIGGER IF EXISTS trg_knowledge_base_tsv ON knowledge_base;
CREATE TRIGGER trg_knowledge_base_tsv
  BEFORE INSERT OR UPDATE OF key, value ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION knowledge_base_tsv_trigger();

DROP TRIGGER IF EXISTS trg_document_sections_tsv ON document_sections;
CREATE TRIGGER trg_document_sections_tsv
  BEFORE INSERT OR UPDATE OF content ON document_sections
  FOR EACH ROW EXECUTE FUNCTION document_sections_tsv_trigger();

-- 5. Backfill existing rows
UPDATE daily_logs SET content_tsv = to_tsvector('simple', COALESCE(content, '')) WHERE content_tsv IS NULL;
UPDATE knowledge_base SET content_tsv = to_tsvector('simple', COALESCE(key, '') || ' ' || COALESCE(value, '')) WHERE content_tsv IS NULL;
UPDATE document_sections SET content_tsv = to_tsvector('simple', COALESCE(content, '')) WHERE content_tsv IS NULL;
