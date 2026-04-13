-- 005_chat_hot_path_indexes.sql
-- Two composite / partial indexes that accelerate the scheduler's hottest
-- reads and the notification dedup check.
--
-- (notifications) The scheduler's `alreadySentToday` probe filters by
-- (user_id, type, created_at >= CURRENT_DATE). The existing
-- idx_notifications_created_at(user_id, created_at DESC) forces a scan of
-- the user's entire day of notifications and an in-memory type filter.
-- Adding `type` as the middle column collapses that to a single index seek.
--
-- (knowledge_base) `runAndArmUserSchedules` runs
--     SELECT ... FROM knowledge_base WHERE key LIKE 'schedule:%'
-- across all users. Neither idx_knowledge_base_user_id nor
-- idx_knowledge_base_user_key is usable because `user_id` is unrestricted.
-- A partial index on the `schedule:` prefix is tiny (one row per user
-- schedule) and lets the planner pick it unconditionally.

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
    ON notifications (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_schedule_keys
    ON knowledge_base (user_id, id)
    WHERE key LIKE 'schedule:%';
