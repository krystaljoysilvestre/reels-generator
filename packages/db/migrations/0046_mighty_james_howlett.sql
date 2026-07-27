CREATE TABLE IF NOT EXISTS "trending_niches" (
	"day" date NOT NULL,
	"segment" text DEFAULT 'global' NOT NULL,
	"niches" jsonb,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"refreshed_by_user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trending_niches_day_segment_pk" PRIMARY KEY("day","segment")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trending_niches" ADD CONSTRAINT "trending_niches_refreshed_by_user_id_users_id_fk" FOREIGN KEY ("refreshed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trending_niches_segment_day" ON "trending_niches" USING btree ("segment","day");