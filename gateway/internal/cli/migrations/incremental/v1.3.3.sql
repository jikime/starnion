-- =============================================================
-- v1.3.3 — Normalise diary_entries.mood to 5 canonical values
--
-- Maps free-form mood/sentiment strings (saved by the AI agent)
-- to the canonical set recognised by the UI wellness page:
--   매우좋음 / 좋음 / 보통 / 나쁨 / 매우나쁨
--
-- Only rows whose mood is not already one of the 5 valid values
-- are touched. Idempotent: safe to run multiple times.
-- =============================================================

UPDATE diary_entries
SET mood = CASE
    -- 매우좋음
    WHEN LOWER(mood) IN (
        '매우좋음', '매우 좋음', '최고', '행복', '기쁨', '신남',
        '흥분', '설렘', '즐거움', '뿌듯',
        'great', 'excellent', 'amazing', 'happy', 'joyful'
    ) THEN '매우좋음'

    -- 좋음
    WHEN LOWER(mood) IN (
        '좋음', '좋아', '괜찮음', '평온', '편안', '안정', '산뜻',
        'good', 'nice', 'calm', 'peaceful'
    ) THEN '좋음'

    -- 나쁨
    WHEN LOWER(mood) IN (
        '나쁨', '안좋음', '피곤', '지침', '스트레스', '슬픔', '슬프다',
        '우울', '화남', '짜증', '걱정', '불안',
        'sad', 'tired', 'stressed', 'bad', 'anxious', 'angry', 'worried'
    ) THEN '나쁨'

    -- 매우나쁨
    WHEN LOWER(mood) IN (
        '매우나쁨', '매우 나쁨', '최악', '절망', '힘듦', '너무힘듦',
        'terrible', 'awful', 'depressed'
    ) THEN '매우나쁨'

    -- 보통 (fallback for anything unrecognised)
    ELSE '보통'
END
WHERE mood NOT IN ('매우좋음', '좋음', '보통', '나쁨', '매우나쁨');

-- ─── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('1.3.3') ON CONFLICT DO NOTHING;
