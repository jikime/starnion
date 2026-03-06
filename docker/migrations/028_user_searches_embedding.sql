-- Migration 028: Add vector embeddings + FTS to user_searches
--               Pattern matches 023_embedding_domain_tables.sql

ALTER TABLE user_searches
    ADD COLUMN IF NOT EXISTS embedding   vector(768),
    ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- HNSW index for vector similarity
CREATE INDEX IF NOT EXISTS idx_user_searches_embedding ON user_searches
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_user_searches_content_tsv
    ON user_searches USING gin(content_tsv);

-- Trigger: auto-populate user_searches.content_tsv
CREATE OR REPLACE FUNCTION user_searches_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.query, '') || ' ' || COALESCE(NEW.result, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_searches_tsv ON user_searches;
CREATE TRIGGER trg_user_searches_tsv
    BEFORE INSERT OR UPDATE OF query, result ON user_searches
    FOR EACH ROW EXECUTE FUNCTION user_searches_tsv_trigger();

-- Backfill content_tsv for existing rows
UPDATE user_searches
SET content_tsv = to_tsvector('simple', COALESCE(query, '') || ' ' || COALESCE(result, ''))
WHERE content_tsv IS NULL;
