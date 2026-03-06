-- 023: Add vector embeddings + FTS to diary_entries & memos
--      Add metadata JSONB to goals for evaluation caching
--      Add recurring flag to ddays

-- diary_entries: embedding + full-text search
ALTER TABLE diary_entries
    ADD COLUMN IF NOT EXISTS embedding   vector(768),
    ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- memos: embedding + full-text search
ALTER TABLE memos
    ADD COLUMN IF NOT EXISTS embedding   vector(768),
    ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- goals: metadata for caching LLM evaluation results
ALTER TABLE goals
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ddays: recurring flag
ALTER TABLE ddays
    ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT FALSE;

-- HNSW indexes for vector similarity
CREATE INDEX IF NOT EXISTS idx_diary_entries_embedding ON diary_entries
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_memos_embedding ON memos
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- GIN indexes for full-text search
CREATE INDEX IF NOT EXISTS idx_diary_entries_content_tsv
    ON diary_entries USING gin(content_tsv);

CREATE INDEX IF NOT EXISTS idx_memos_content_tsv
    ON memos USING gin(content_tsv);

-- Trigger: auto-populate diary_entries.content_tsv
CREATE OR REPLACE FUNCTION diary_entries_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-populate memos.content_tsv
CREATE OR REPLACE FUNCTION memos_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.content_tsv := to_tsvector('simple',
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_diary_entries_tsv ON diary_entries;
CREATE TRIGGER trg_diary_entries_tsv
    BEFORE INSERT OR UPDATE OF title, content ON diary_entries
    FOR EACH ROW EXECUTE FUNCTION diary_entries_tsv_trigger();

DROP TRIGGER IF EXISTS trg_memos_tsv ON memos;
CREATE TRIGGER trg_memos_tsv
    BEFORE INSERT OR UPDATE OF title, content ON memos
    FOR EACH ROW EXECUTE FUNCTION memos_tsv_trigger();
