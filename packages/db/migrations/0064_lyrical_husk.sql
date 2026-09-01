-- Keep source presentation distinct from ordinary reference conditioning. Existing image_origin,
-- appearance_bindings, and watermark migrations remain owned by 0061–0063.
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "source_presentation_entity" text;
