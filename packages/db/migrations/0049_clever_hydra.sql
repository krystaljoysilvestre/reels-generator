ALTER TABLE "spend_events" DROP CONSTRAINT "spend_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "spend_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spend_events" ADD CONSTRAINT "spend_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_spend_events_created" ON "spend_events" USING btree ("created_at");