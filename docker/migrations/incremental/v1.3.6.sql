-- =============================================================
-- v1.3.6 — Add FK constraint on reports.user_id
--
-- Changes:
--   1. Add FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
--      to the reports table so orphaned report rows are automatically
--      removed when the owning user is deleted.
--
-- Idempotent: safe to run multiple times (DO block guards).
-- =============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   information_schema.table_constraints
        WHERE  constraint_name = 'fk_reports_user_id'
          AND  table_name      = 'reports'
    ) THEN
        ALTER TABLE reports
            ADD CONSTRAINT fk_reports_user_id
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END$$;

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.3.6') ON CONFLICT DO NOTHING;
