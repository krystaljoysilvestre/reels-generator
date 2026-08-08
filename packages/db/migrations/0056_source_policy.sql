-- Source Policy — what a channel's stories may treat as REAL.
--
-- Consolidates four switches that already expressed this idea and none of which a creator could see:
-- story_mode ('ebn' = facts supplied and frozen), ebn_specialization, fact_check, and the story
-- planner's GUARDS line, which unconditionally instructed EVERY channel to fictionalize specific real
-- places. That last one silently laundered real named subjects — "White Lady of Balete Drive" became an
-- invented street on every reel — for exactly the channels built on real places and documented legends.
--
-- NULL everywhere is deliberate and means "never set": resolveChannelPolicy() then infers today's exact
-- behaviour from the legacy columns, so no existing channel changes. Turning a permission ON is always
-- an explicit creator choice; nothing here grants one by inference.
--
-- Frozen on the reel for the same reason genre_category is: a reel made under "fictional only" must not
-- be re-judged or re-rendered later under "real places allowed".
--
-- PRECEDENCE, which no future column may invert: the platform floor (depictive-ethics, EBN illustrative,
-- safety) is NON-OVERRIDABLE and sits above this. Source policy is narrative permission, never depiction
-- permission.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "source_policy" jsonb;
--> statement-breakpoint
ALTER TABLE "channel_series" ADD COLUMN IF NOT EXISTS "source_policy" jsonb;
--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN IF NOT EXISTS "source_policy" jsonb;
