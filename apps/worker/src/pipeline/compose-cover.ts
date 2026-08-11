// Cover compositing — the post thumbnail, built from a scene frame plus burned overlay words.
//
// WHY THIS IS ITS OWN MODULE. This used to live inside the `render` step's runStep callback, which welded
// packaging to video rendering and produced a defect the publish-bar audit missed: `postMeta` is not in the
// render step's inputHash, so editing the thumbnail text was followed by a cache skip and the STALE cover
// published. Pulling it out means a cover can be rebuilt on its own, in seconds, without re-rendering (or
// re-billing) anything.
//
// It re-reads its own inputs from the DB rather than taking them as arguments, so the on-demand path only
// needs a reelId. Inside a multi-minute render that extra query is free.
//
// Cost: $0. Remotion renderStill of a single frame — compute only, no model call, no provider spend.
import { eq, asc } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, YOUTUBE_THUMBNAIL_MAX_BYTES } from '@reels/providers'
import { PostMetaSchema, CaptionStyleSchema, channelPlatformPreset, thumbnailOverlay } from '@reels/core'
import { renderThumbnailStill } from '@reels/render/remotion/render-remotion'

// One constant key per reel → the cover upserts in place, so every consumer (publish-youtube, auto-gate,
// the export zip) keeps resolving the same path and none of them needed changing.
export const coverStorageKey = (reelId: string) => `reels/${reelId}/thumbnail.jpg`

export interface ComposeCoverResult {
  storageKey: string
  overlay: string
  frameAssetId: string
}

/**
 * Rebuild a reel's cover from its current packaging.
 *
 * Returns null — never throws — when the reel simply has nothing to build from (no packaging yet, no
 * overlay words, no scene image). Callers treat that as "nothing to do": inside the render step it must
 * not fail a finished reel, and on the on-demand path a reel without packaging has no cover to refresh.
 * Genuine faults (a broken download, a Remotion crash) still throw so the caller can decide.
 *
 * @param frameAssetId Optional override — compose from THIS frame instead of the hero pick. The caller is
 *   responsible for having verified the asset belongs to this reel.
 */
export async function composeCover(
  { reelId, frameAssetId }: { reelId: string; frameAssetId?: string },
): Promise<ComposeCoverResult | null> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return null
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) return null

  const postMeta = PostMetaSchema.safeParse(reel.postMeta)
  // thumbnailOverlay() falls back to the title, so reels written before `thumbnailText` existed still
  // compose exactly as they did before (publish-bar audit, 2026-08-10).
  const overlay = postMeta.success ? thumbnailOverlay(postMeta.data) : ''
  if (!overlay) return null

  const reelScenes = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
  })

  // Hero selection stays exactly as it was — first flagged scene with an image, else the first scene with
  // any image. It is a known weak point (the planner flags three and this reads one) but changing it is
  // §3 of the packaging plan, gated on Checkpoint A. Extracting the composer must not also move the frame.
  const heroScene = frameAssetId
    ? reelScenes.find((s) => s.imageAssetId === frameAssetId)
    : (reelScenes.find((s) => s.isHero && s.imageAssetId) ?? reelScenes.find((s) => s.imageAssetId))
  const resolvedFrameId = frameAssetId ?? heroScene?.imageAssetId
  if (!resolvedFrameId) return null

  const frameAsset = await db.query.assets.findFirst({ where: eq(assets.id, resolvedFrameId) })
  // Scope check in depth: even though callers verify ownership, a frame from another reel must never be
  // composited onto this one's cover.
  if (!frameAsset || frameAsset.reelId !== reelId) return null

  const captionStyle = CaptionStyleSchema.parse(channel.captionStyle)
  const platformPreset = channelPlatformPreset(channel)

  const tmp = await mkdtemp(join(tmpdir(), `cover-${reelId.slice(0, 8)}-`))
  try {
    const framePath = join(tmp, 'frame.webp')
    await writeFile(framePath, await downloadBuffer(frameAsset.storageKey))
    const coverPath = join(tmp, 'cover.jpg')

    // Render at the CHANNEL'S OWN aspect. The platform preset is the authority: the scene images were
    // rendered at exactly these dimensions, and it matches the aspect each platform documents for its
    // thumbnail (9:16 for Shorts, 16:9 for long-form). This is what retires the old 16:9-for-everything
    // cover, whose vertical fitting spent two thirds of the canvas on a blurred smear.
    //
    // Quality steps DOWN until the file fits YouTube's 2MB thumbnails.set limit, rather than letting the
    // upload be silently rejected at publish time. 90 is the designed quality and is expected to fit; the
    // lower steps exist so a pathological frame degrades gracefully instead of losing its cover entirely.
    let bytes: Buffer | null = null
    for (const quality of [90, 80, 70, 60]) {
      await renderThumbnailStill({
        imagePath: framePath,
        title: overlay,
        outputPath: coverPath,
        ...(captionStyle.highlightColor ? { accent: captionStyle.highlightColor } : {}),
        width: platformPreset.width,
        height: platformPreset.height,
        quality,
      })
      bytes = await readFile(coverPath)
      if (bytes.length <= YOUTUBE_THUMBNAIL_MAX_BYTES) break
      console.warn(
        `[cover] ${reelId.slice(0, 8)} ${(bytes.length / 1_048_576).toFixed(2)}MB at q${quality} exceeds the 2MB publish limit — retrying lower`,
      )
    }
    if (!bytes) return null

    const storageKey = coverStorageKey(reelId)
    await uploadBuffer(storageKey, bytes, 'image/jpeg')

    // createdAt is bumped on every rebuild — the asset proxy serves `reels/` keys with `no-store`, and the
    // timestamp is what lets the UI cache-bust a cover that changed under the same key.
    const meta = { role: 'thumbnail', title: overlay, frameAssetId: resolvedFrameId }
    await db.insert(assets).values({
      reelId,
      channelId: reel.channelId,
      kind: 'image',
      storageKey,
      provider: 'local',
      costCents: 0,
      meta,
    }).onConflictDoUpdate({
      target: [assets.reelId, assets.storageKey],
      set: { meta, createdAt: new Date() },
    })

    return { storageKey, overlay, frameAssetId: resolvedFrameId }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
