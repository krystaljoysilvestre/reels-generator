import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, reels } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { generateVideo, FalEngineSchema, ContentFilterError, ProviderRateLimitError } from '@reels/providers'
import { resolveMotionSettings } from '@reels/core'
import { getSession } from '@/lib/auth'

// Best-effort in-flight guard (B5): a fast double-click would otherwise launch two paid clips before
// either insert lands, since the have-variation check below only catches already-finished ones. An
// in-memory set keyed by reel:scene short-circuits a concurrent second request on the same instance —
// cheap belt-and-suspenders on top of the client's disabled button (not distributed, and that's fine
// for the double-click it targets).
const inFlight = new Set<string>()

// On-demand single-scene animation: lets the operator vet motion for a hero (tier:'video') scene
// from the storyboard, BEFORE committing to a full render. A preview answers a yes/no "is this motion
// good?" — one clip is enough, so we generate ONLY variation 0 (half the vetting cost). render-phase
// animate_scenes skips variations that already exist, so it reuses this clip as v0 and backfills the
// second variation only when you actually render — and render defaults to v0, so the clip you vetted
// is exactly the one that ships.
const VARIATION_COUNT = 1

// i2v is slow (tens of seconds per variation). Give the route room beyond the platform default.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, sceneIdx } = (await req.json()) as { reelId: string; sceneIdx: number }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)),
  })
  if (!reel || !scene) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (scene.tier !== 'video') return NextResponse.json({ error: 'Scene is not a video tier' }, { status: 400 })
  if (!scene.imageAssetId) return NextResponse.json({ error: 'Scene has no image yet' }, { status: 400 })

  const imageAsset = await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
  if (!imageAsset) return NextResponse.json({ error: 'Scene image asset missing' }, { status: 400 })

  // Which variations already exist (e.g. a prior preview) — skip them so a re-click only fills gaps.
  const existing = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const haveVariation = new Set(
    existing
      .filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx)
      .map((a) => (a.meta as Record<string, unknown>)['variationIdx']),
  )

  const lockKey = `${reelId}:${sceneIdx}`
  if (inFlight.has(lockKey)) {
    return NextResponse.json({ error: 'This scene is already being animated — hang tight.' }, { status: 409 })
  }
  inFlight.add(lockKey)

  const engine = FalEngineSchema.parse({})
  const motion = resolveMotionSettings(scene.motionSettings)
  let costAdded = 0

  try {
    for (let v = 0; v < VARIATION_COUNT; v++) {
      if (haveVariation.has(v)) continue
      const result = await generateVideo({
        imageStorageKey: imageAsset.storageKey,
        motionPrompt: scene.motionPrompt ?? 'slow cinematic drift',
        durationSec: motion.durationSec,
        reelId,
        sceneIdx,
        variationIdx: v,
        engine,
      })

      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'video',
        storageKey: result.asset.storageKey,
        provider: 'fal',
        providerJobId: result.providerJobId ?? null,
        costCents: result.costCents,
        meta: { ...result.asset.meta, sceneIdx, variationIdx: v },
      })
      costAdded += result.costCents
    }
  } catch (err) {
    // Map provider failures to actionable statuses instead of an opaque 500: a content-filter rejection
    // is the operator's to fix, and a rate limit is worth a calm retry (the client backs off on 429).
    if (err instanceof ContentFilterError) {
      return NextResponse.json({ error: 'This shot couldn’t be animated — try reshooting it first.' }, { status: 422 })
    }
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'That take didn’t come through — try again.' }, { status: 502 })
  } finally {
    inFlight.delete(lockKey)
  }

  if (costAdded > 0) {
    await db.update(reels)
      .set({ costCents: reel.costCents + costAdded, updatedAt: new Date() })
      .where(eq(reels.id, reelId))
  }

  return NextResponse.json({ ok: true, costCents: costAdded })
}
