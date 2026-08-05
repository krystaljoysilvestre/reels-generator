-- A channel publishes to a SET of platforms, not one. Replaces `target_platform` (single value, with an
-- 'all' catch-all bucket) with `target_platforms`, so the creator's actual selection is on the row and the
-- render spec is COMPUTED from it (core's resolvePlatformPreset) instead of hidden behind 'all'.
--
-- Hand-written rather than drizzle-generated so the backfill sits between the add and the drop — a plain
-- generated pair would drop every existing channel's platform choice.
--
-- Backfill is exact per old value; the legacy 'all' bucket becomes the three vertical feeds it always stood
-- for. One deliberate behavior change rides along: the resolved safe-zone for that set is 20% (Facebook
-- Reels' bottom UI) where 'all' hardcoded 18%. That shifts the render fingerprint, so an existing reel
-- re-renders the next time its pipeline runs — finished reels stay as they are until then.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "target_platforms" text[] DEFAULT '{"tiktok","youtube_shorts","facebook_reels"}' NOT NULL;
--> statement-breakpoint
UPDATE "channels" SET "target_platforms" = CASE "target_platform"
  WHEN 'tiktok' THEN ARRAY['tiktok']
  WHEN 'youtube_shorts' THEN ARRAY['youtube_shorts']
  WHEN 'facebook_reels' THEN ARRAY['facebook_reels']
  WHEN 'youtube_long' THEN ARRAY['youtube_long']
  ELSE ARRAY['tiktok','youtube_shorts','facebook_reels']  -- 'all', plus anything unrecognized
END;
--> statement-breakpoint
ALTER TABLE "channels" DROP COLUMN IF EXISTS "target_platform";
