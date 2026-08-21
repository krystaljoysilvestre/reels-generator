-- The roaming logo overlay is gone from the renderer, so this column has nothing left to configure.
-- It never had a writer either: no surface in the app ever set it, so every reel took the app default.
-- Dropped rather than left behind as dead configuration.
ALTER TABLE "channels" DROP COLUMN IF EXISTS "watermark_key";
