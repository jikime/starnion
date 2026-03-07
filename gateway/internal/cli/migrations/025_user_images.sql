-- Migration 025: Add user_images table for AI-generated/edited/analyzed images
-- Tracks images from all channels: web UI, Telegram, WebChat

CREATE TABLE IF NOT EXISTS user_images (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    name       TEXT        NOT NULL DEFAULT 'image.png',
    mime       TEXT        NOT NULL DEFAULT 'image/png',
    size       BIGINT      NOT NULL DEFAULT 0,
    source     TEXT        NOT NULL DEFAULT 'web',   -- 'web', 'telegram', 'webchat'
    type       TEXT        NOT NULL DEFAULT 'generated',  -- 'generated', 'edited', 'analyzed'
    prompt     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_images_user_id ON user_images(user_id);
CREATE INDEX IF NOT EXISTS idx_user_images_created_at ON user_images(created_at DESC);
