DO $$ BEGIN
 CREATE TYPE "public"."story_origin" AS ENUM('setup', 'library', 'pipeline');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "origin" "story_origin" DEFAULT 'pipeline' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reels_story" ON "reels" USING btree ("story_id") WHERE story_id IS NOT NULL;--> statement-breakpoint
-- Backfill origin (idempotent — safe to re-run if wizard inserts land in a migrate→deploy gap).
-- Pipeline rows always carry elements+logline (generate_story); wizard samples and BYO scripts carry neither.
-- Linked + no pipeline metadata = BYO script → library.
UPDATE "stories" s SET "origin" = 'library'
WHERE s."elements" IS NULL AND s."logline" IS NULL
  AND EXISTS (SELECT 1 FROM "reels" r WHERE r."story_id" = s."id");--> statement-breakpoint
-- Unlinked + no pipeline metadata = wizard samples (+ orphaned BYO) → setup.
UPDATE "stories" s SET "origin" = 'setup'
WHERE s."elements" IS NULL AND s."logline" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "reels" r WHERE r."story_id" = s."id");
