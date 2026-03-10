-- =============================================================
-- v1.3.1 — DB Performance Optimizations
--
-- 1. Composite indexes for high-frequency query patterns
--    · finances     (user_id, created_at DESC)
--    · daily_logs   (user_id, created_at DESC)
--    · memos        (user_id, tag, created_at DESC)
--    · knowledge_base (user_id, key)
--    · document_sections (document_id)
-- 2. ANALYZE to update planner statistics on affected tables
-- =============================================================

-- ─── 1. finances: user + date range aggregation ─────────────────────────────
-- get_monthly_summary / get_weekly_summary / get_daily_totals / get_period_summary
-- all filter by (user_id, created_at range) before GROUP BY category.
CREATE INDEX IF NOT EXISTS idx_finances_user_created
    ON finances (user_id, created_at DESC);

-- ─── 2. daily_logs: user + date range retrieval ──────────────────────────────
-- get_recent / get_by_date_range / search_similar (date filter)
-- all filter by (user_id, created_at range).
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_created
    ON daily_logs (user_id, created_at DESC);

-- ─── 3. memos: user + tag filtering + ordering ───────────────────────────────
-- list_memos(tag=?) scans (user_id, tag) without a matching index today.
CREATE INDEX IF NOT EXISTS idx_memos_user_tag_created
    ON memos (user_id, tag, created_at DESC);

-- ─── 4. knowledge_base: user + key prefix/exact lookups ─────────────────────
-- get_by_key / get_by_key_prefix / delete_by_key all filter (user_id, key).
-- The LIKE prefix search ('pattern:analysis:%') also benefits from this.
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_key
    ON knowledge_base (user_id, key);

-- ─── 5. document_sections: document_id for JOIN pushdown ─────────────────────
-- search_by_user / search_fulltext_by_user join document_sections → documents
-- on document_sections.document_id; a B-tree index accelerates the join.
CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
    ON document_sections (document_id);

-- ─── Update planner statistics ───────────────────────────────────────────────
ANALYZE finances;
ANALYZE daily_logs;
ANALYZE memos;
ANALYZE knowledge_base;
ANALYZE document_sections;

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.3.1') ON CONFLICT DO NOTHING;
