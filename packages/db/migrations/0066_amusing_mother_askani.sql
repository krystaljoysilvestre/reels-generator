CREATE INDEX IF NOT EXISTS "idx_assets_channel" ON "assets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_storage_key" ON "assets" USING btree ("storage_key");--> statement-breakpoint

-- Historical channel uploads predate the ownership ledger and lived only in channel columns or JSON
-- wizard state. Materialize those known shapes once so request-time authorization stays indexed and
-- bounded; no asset request should scan every tenant's draft/audio JSON.
WITH legacy_channel_assets AS (
  SELECT id AS channel_id, 'image'::asset_kind AS kind, avatar_key AS storage_key, 'channel_avatar'::text AS surface
  FROM channels
  WHERE avatar_key IS NOT NULL

  UNION ALL
  SELECT id, 'image'::asset_kind, style_image_key, 'channel_style_image'::text
  FROM channels
  WHERE style_image_key IS NOT NULL

  UNION ALL
  SELECT id, 'image'::asset_kind, draft_state->>'avatarKey', 'draft_avatar'::text
  FROM channels
  WHERE NULLIF(draft_state->>'avatarKey', '') IS NOT NULL

  UNION ALL
  SELECT c.id, 'music'::asset_kind, track->>'key', 'draft_music_upload'::text
  FROM channels c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.draft_state->'uploadedMusic') = 'array'
      THEN c.draft_state->'uploadedMusic' ELSE '[]'::jsonb END
  ) AS track
  WHERE NULLIF(track->>'key', '') IS NOT NULL

  UNION ALL
  SELECT c.id, 'image'::asset_kind, preview.value->>'imageKey', 'draft_style_preview'::text
  FROM channels c
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(c.draft_state->'stylePreviews') = 'object'
      THEN c.draft_state->'stylePreviews' ELSE '{}'::jsonb END
  ) AS preview
  WHERE NULLIF(preview.value->>'imageKey', '') IS NOT NULL

  UNION ALL
  SELECT c.id, 'music'::asset_kind, track->>'path', 'channel_music_pack'::text
  FROM channels c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.audio_packs->'musicPack') = 'array'
      THEN c.audio_packs->'musicPack' ELSE '[]'::jsonb END
  ) AS track
  WHERE NULLIF(track->>'path', '') IS NOT NULL
), deduplicated AS (
  SELECT DISTINCT ON (channel_id, storage_key) channel_id, kind, storage_key, surface
  FROM legacy_channel_assets
  WHERE NULLIF(storage_key, '') IS NOT NULL
  ORDER BY channel_id, storage_key, surface
)
INSERT INTO assets (channel_id, kind, storage_key, provider, cost_cents, meta)
SELECT d.channel_id, d.kind, d.storage_key, 'legacy_backfill', 0,
  jsonb_build_object('surface', d.surface, 'backfilledBy', '0066')
FROM deduplicated d
WHERE NOT EXISTS (
  SELECT 1 FROM assets a
  WHERE a.channel_id = d.channel_id AND a.storage_key = d.storage_key
);--> statement-breakpoint

-- Reel columns are the other pre-ledger compatibility edge. New generated objects are reel-namespaced
-- and new uploads write assets immediately; these rows preserve access to historical unscoped objects.
WITH legacy_reel_assets AS (
  SELECT id AS reel_id, 'music'::asset_kind AS kind, music_key AS storage_key, 'reel_music'::text AS surface
  FROM reels
  WHERE music_key IS NOT NULL

  UNION ALL
  SELECT id, 'music'::asset_kind, music_upload_key, 'reel_music_upload'::text
  FROM reels
  WHERE music_upload_key IS NOT NULL

  UNION ALL
  SELECT id, 'render'::asset_kind, render_url, 'reel_render'::text
  FROM reels
  WHERE render_url IS NOT NULL
), deduplicated AS (
  SELECT DISTINCT ON (reel_id, storage_key) reel_id, kind, storage_key, surface
  FROM legacy_reel_assets
  WHERE NULLIF(storage_key, '') IS NOT NULL
  ORDER BY reel_id, storage_key, surface
)
INSERT INTO assets (reel_id, kind, storage_key, provider, cost_cents, meta)
SELECT d.reel_id, d.kind, d.storage_key, 'legacy_backfill', 0,
  jsonb_build_object('surface', d.surface, 'backfilledBy', '0066')
FROM deduplicated d
WHERE NOT EXISTS (
  SELECT 1 FROM assets a
  WHERE a.reel_id = d.reel_id AND a.storage_key = d.storage_key
);
