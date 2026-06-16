DO $$ BEGIN
 CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'voiceover', 'sfx', 'ambient', 'music', 'render');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."compilation_status" AS ENUM('drafting', 'rendering', 'render_qa', 'approved', 'published', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."pipeline_step_status" AS ENUM('pending', 'running', 'done', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."platform" AS ENUM('fb', 'ig', 'yt', 'tiktok');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."reel_status" AS ENUM('drafting', 'story_review', 'storyboard', 'rendering', 'render_qa', 'spot_check', 'approved', 'scheduled', 'published', 'rejected', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."rejection_reason" AS ENUM('twist_predictable', 'voice_mismatch', 'visual_off', 'pacing', 'weak_hook', 'off_culture', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."story_source" AS ENUM('user', 'ai', 'remix', 'submission');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reel_id" uuid,
	"channel_id" uuid,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"niche_description" text NOT NULL,
	"languages" text[] DEFAULT '{"tagalog"}' NOT NULL,
	"tone_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style_preset" text DEFAULT '' NOT NULL,
	"world_bible" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lut_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"voice_pool" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_packs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"posting_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compilations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"theme" text,
	"reel_ids" uuid[] DEFAULT '{}' NOT NULL,
	"intro_script" text,
	"transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chapter_marks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "compilation_status" DEFAULT 'drafting' NOT NULL,
	"render_url" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"youtube_video_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"qualified_views" integer DEFAULT 0 NOT NULL,
	"avg_watch_pct" integer DEFAULT 0 NOT NULL,
	"retention_3s" integer DEFAULT 0 NOT NULL,
	"followers_delta" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reel_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"status" "pipeline_step_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"input_hash" text,
	"output" jsonb,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reel_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_post_id" text,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"disclosure_applied" boolean DEFAULT false NOT NULL,
	"kill_switch_expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"story_id" uuid,
	"status" "reel_status" DEFAULT 'drafting' NOT NULL,
	"language" text DEFAULT 'tagalog' NOT NULL,
	"voice_id" text,
	"audio_script" jsonb,
	"timings" jsonb,
	"render_url" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"operator_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reel_id" uuid NOT NULL,
	"reason_code" "rejection_reason" NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reel_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"narration_text" text NOT NULL,
	"visual_prompt" text,
	"motion_prompt" text,
	"tier" text DEFAULT 'still' NOT NULL,
	"image_asset_id" uuid,
	"video_asset_id" uuid,
	"start_ms" integer,
	"end_ms" integer,
	"mood" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"source" "story_source" DEFAULT 'ai' NOT NULL,
	"language" text DEFAULT 'tagalog' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"logline" text,
	"twist_anchor" text,
	"subgenre_tags" text[] DEFAULT '{}' NOT NULL,
	"performance_score" integer DEFAULT 0 NOT NULL,
	"is_reference" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compilations" ADD CONSTRAINT "compilations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metrics" ADD CONSTRAINT "metrics_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publications" ADD CONSTRAINT "publications_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reels" ADD CONSTRAINT "reels_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reels" ADD CONSTRAINT "reels_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rejections" ADD CONSTRAINT "rejections_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenes" ADD CONSTRAINT "scenes_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_reel" ON "assets" USING btree ("reel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_steps_reel" ON "pipeline_steps" USING btree ("reel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pipeline_steps_reel_step" ON "pipeline_steps" USING btree ("reel_id","step_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reels_channel" ON "reels" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reels_status" ON "reels" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scenes_reel" ON "scenes" USING btree ("reel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_scenes_reel_idx" ON "scenes" USING btree ("reel_id","idx");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stories_channel" ON "stories" USING btree ("channel_id");