CREATE INDEX IF NOT EXISTS "idx_channels_user" ON "channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_compilations_channel" ON "compilations" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reels_created" ON "reels" USING btree ("created_at");