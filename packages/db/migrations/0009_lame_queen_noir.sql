ALTER TABLE "channels" ADD COLUMN "story_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "narrator_persona" jsonb DEFAULT '{}'::jsonb NOT NULL;