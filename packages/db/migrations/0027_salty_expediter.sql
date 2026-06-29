ALTER TABLE "scenes" ADD COLUMN "primary_entity" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "supporting_entities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "scene_intent" text;