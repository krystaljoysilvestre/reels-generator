-- Defensive dedupe before enforcing uniqueness: keep the NEWEST row per (reel_id, storage_key).
-- No-op on a DB that never accumulated duplicates; protects environments that did (before the pipeline
-- inserts became upserts, a re-run silently duplicated a row). Scene image/video pointers track the
-- newest row, so keeping newest avoids dangling references. NULL reel_id rows (app-level assets like
-- style presets) are left alone — Postgres treats them as distinct, matching the unique index.
DELETE FROM "assets" a
USING "assets" b
WHERE a.reel_id IS NOT NULL
  AND a.reel_id = b.reel_id
  AND a.storage_key = b.storage_key
  AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_assets_reel_storage_key" ON "assets" USING btree ("reel_id","storage_key");
