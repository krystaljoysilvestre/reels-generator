-- Channel Series — the Editorial Program dimension (specs/channel-series.md), plus per-reel genre.
--
-- Two new tables and two new reels columns. Entirely additive: a channel with no series behaves exactly
-- as it does today (the scheduler falls through to planner-invented ideas), and every existing reel's
-- genre_category stays NULL, which effectiveGenre() reads as "use the channel's".
--
-- WHY reels.genre_category EXISTS AT ALL: a series carries its own genre, so genre stops being a
-- channel-wide constant. The resolved value is FROZEN onto the reel at creation rather than resolved on
-- every read, because both channel settings and series derivation can change afterwards (the latter is
-- non-deterministic LLM output) — and genre feeds step cache keys, the writer identity, the gate rubric
-- and the scene module. A reel whose genre could move under it would be re-judged and re-rendered
-- differently from how it was made.
--
-- WHY channel_series.genre_category IS NULLABLE: NULL means "this series has no opinion", NOT "copy the
-- channel's genre". Storing a duplicate would rot silently the first time a channel's own genre is
-- corrected (channel.v1 misclassifying a documentary-framed idea as horror is a real, observed case),
-- leaving every neutral series holding a stale value with nothing to surface it.
CREATE TABLE IF NOT EXISTS "channel_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "genre_category" text,
  "narrative_style" text,
  "taste_rubric" text,
  "order_idx" integer DEFAULT 0 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_series_channel" ON "channel_series" ("channel_id");
--> statement-breakpoint
-- The seed queue. Deliberately NOT unique on (series_id, subject): re-telling a subject years later is a
-- new queued row, not a status transition on the old one, so the history of what was made from what
-- stays readable.
CREATE TABLE IF NOT EXISTS "series_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "series_id" uuid NOT NULL REFERENCES "channel_series"("id") ON DELETE cascade,
  "subject" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "used_by_reel_id" uuid REFERENCES "reels"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_topics_channel" ON "series_topics" ("channel_id");
--> statement-breakpoint
-- The scheduler's hot path: the next queued topic for a series, oldest first.
CREATE INDEX IF NOT EXISTS "idx_series_topics_series_status" ON "series_topics" ("series_id", "status", "created_at");
--> statement-breakpoint
-- set null, not cascade: deleting a series must never destroy the reels it produced.
ALTER TABLE "reels" ADD COLUMN IF NOT EXISTS "series_id" uuid REFERENCES "channel_series"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN IF NOT EXISTS "genre_category" text;
