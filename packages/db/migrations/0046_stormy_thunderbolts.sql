ALTER TABLE "channels" ADD COLUMN "fact_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "fact_check_report" jsonb;