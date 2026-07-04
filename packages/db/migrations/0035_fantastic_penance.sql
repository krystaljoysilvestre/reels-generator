DO $$ BEGIN
 ALTER TABLE "scenes" ADD CONSTRAINT "scenes_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenes" ADD CONSTRAINT "scenes_video_asset_id_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metrics_publication" ON "metrics" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_publications_reel" ON "publications" USING btree ("reel_id");