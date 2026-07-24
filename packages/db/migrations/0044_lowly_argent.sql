ALTER TABLE "channels" ADD COLUMN "story_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "ebn_specialization" text DEFAULT 'historical_events';--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "dossier" text;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "evidence_bible" jsonb;