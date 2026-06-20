ALTER TABLE "channels" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "draft_state" jsonb;