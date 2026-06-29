import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, channels, reels } from '@reels/db'
import { eq, and, inArray } from 'drizzle-orm'
import { generateImage, ContentFilterError, ProviderRateLimitError, llmCall, SCENE_IMAGE_QUALITY } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt } from '@reels/core'
import { buildReviseScenePrompt, REVISE_SCENE_V1_VERSION, ReviseSceneSchema } from '@reels/core/prompts/revise-scene.v1'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // `instruction` = an optional plain-language change ("lights off", "show the old house instead"); it's
  // turned into a proper image prompt by the LLM below, never fed to the image model raw. The same LLM call also
  // classifies the change so the system silently picks how to regenerate (see `improve` below) — the
  // operator never has to choose between "refine" and "fresh take".
  const { reelId, sceneIdx, instruction } = (await req.json()) as {
    reelId: string; sceneIdx: number; instruction?: string
  }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)),
  })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!scene || !channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const basePrompt = (scene.visualPrompt || '').trim()
  if (!basePrompt) return NextResponse.json({ error: 'No visual prompt' }, { status: 400 })

  // A plain-language change goes through the LLM first, NOT straight into the image model. The LLM bakes the
  // change into a proper, content-only image prompt (same conventions scenes.v1 produces) so the image model
  // always gets a well-formed description. The result is persisted as the scene's new description (below).
  const tweak = instruction?.trim()
  let contentPrompt = basePrompt
  // No instruction → a plain fresh re-roll. With an instruction, the LLM decides: an additive tweak
  // refines the current image (i2i), a subject/framing swap re-rolls from scratch (t2i).
  let improve = false
  if (tweak) {
    try {
      const { system, userMessage } = buildReviseScenePrompt(basePrompt, tweak, { genreCategory: channel.genreCategory })
      const revised = await llmCall({
        templateVersion: REVISE_SCENE_V1_VERSION,
        schema: ReviseSceneSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })
      contentPrompt = revised.data.imagePrompt.trim() || basePrompt
      improve = revised.data.intent === 'refine'
    } catch {
      return NextResponse.json({ error: 'Could not apply your change — try rephrasing it.' }, { status: 502 })
    }
  }
  // The style preset always leads (system owns style); the content (LLM-revised or operator-edited) follows.
  const finalPrompt = assembleImagePrompt(contentPrompt, channel.stylePreset)

  // "Improve" → edit FROM the current image: anchor the scene's composition/location while letting the
  // operator's tweak land. A subject/framing swap re-rolls from scratch (the "replace" path's job) instead.
  const currentImage = improve && scene.imageAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
    : null

  let result
  try {
    result = await generateImage({
      prompt: finalPrompt,
      negativePrompt: assembleNegativePrompt({ genreCategory: channel.genreCategory }),
      reelId,
      sceneIdx,
      quality: SCENE_IMAGE_QUALITY,
      ...(currentImage ? { referenceImageKey: currentImage.storageKey } : {}),
    })
  } catch (err) {
    // Surface a usable message instead of an opaque 500 — a content-filter rejection on the tweak is the
    // operator's to fix (reword it), and a rate limit is worth retrying.
    if (err instanceof ContentFilterError) {
      return NextResponse.json({ error: 'The image was rejected by the safety filter — try rewording your change.' }, { status: 422 })
    }
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Image service is busy — wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Image generation failed — try again.' }, { status: 502 })
  }

  const [asset] = await db.insert(assets).values({
    reelId,
    channelId: channel.id,
    kind: 'image',
    storageKey: result.asset.storageKey,
    provider: 'openai',
    costCents: result.costCents,
    meta: result.asset.meta,
  }).returning()

  // A new image invalidates any motion: the clip was animated from the OLD image. So reset the scene to a
  // still (Motion toggle off) and discard the stale clips. The operator flips Motion back on to re-animate
  // the fresh image. `isHero` is left intact — the scene is still a designated key beat. When the operator's
  // change rewrote the description (via the LLM), persist it so later regens build on the updated scene
  // rather than reverting to the original.
  const descChanged = contentPrompt !== scene.visualPrompt
  await db.update(scenes)
    .set({ imageAssetId: asset!.id, tier: 'still', ...(descChanged ? { visualPrompt: contentPrompt } : {}) })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

  // Accumulate cost
  if (reel) {
    await db.update(reels).set({ costCents: reel.costCents + result.costCents, updatedAt: new Date() }).where(eq(reels.id, reelId))
  }

  return NextResponse.json({ ok: true, storageKey: result.asset.storageKey })
}
