-- The character appearance selected by scene planning from analyze_story's valid identity states.
-- Empty means the parent entity's base/default look. Keeping this on the scene makes image generation,
-- on-demand regeneration, and later animation deterministic even when one identity appears at different
-- life stages across the story.
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "appearance_bindings" jsonb DEFAULT '{}'::jsonb NOT NULL;
