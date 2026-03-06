-- Migration 029: Add analysis column to user_images for storing analyze_image results
ALTER TABLE user_images ADD COLUMN IF NOT EXISTS analysis TEXT;
