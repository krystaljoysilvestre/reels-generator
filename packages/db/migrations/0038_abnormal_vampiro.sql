ALTER TABLE "channels" ADD COLUMN "narrative_style" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "narrative_voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "style_influence" text DEFAULT 'medium' NOT NULL;