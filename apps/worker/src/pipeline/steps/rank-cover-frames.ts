// rank_cover_frames — score the reel's OWN frames for cover potential and record the pick.
//
// The frame the cover is built from used to be decided by one line at compose time: `first scene with
// isHero && an image, else the first scene with an image`. The planner flags three scenes as hero — its
// "worth animating" picks, which is a different question from "works as a cover" — and the code read the
// first of them. Crossroads' cover was therefore a bland empty office selected blind out of 42 available
// frames, and it scored 0 of 28 marks in the founder's treatment review. The last lap's conclusion was
// that cover quality tracked the FRAME, not the typography; this is that lever.
//
// Every frame is already generated and already paid for, so this adds one cheap vision call and no image
// generation. It runs inside runStep, so a re-render with unchanged frames is a cache hit and does not
// re-pay — the opposite of compose_cover, which must re-run whenever the creator edits the words.
import { eq, asc } from 'drizzle-orm'
import { getDb, reels, scenes, assets } from '@reels/db'
import { downloadBuffer, llmCall } from '@reels/providers'
import { PostMetaSchema, ReelCoverSchema, coverIsCreatorChosen, thumbnailOverlay, type ReelCover } from '@reels/core'
import { buildCoverFramePrompt, CoverFrameRankingSchema, COVER_FRAME_V1_VERSION, normalizeTextSpace } from '@reels/core/prompts/cover-frame.v1'
import { runStep } from '../harness.js'

// Cheap vision tier. Same model the real-place verification already uses in generate-images — reusing a
// value proven in this repo rather than picking a new one for a comparable judgement.
const COVER_FRAME_MODEL = 'claude-haiku-4-5-20251001'

// How many frames go to the model. A 42-scene long-form would otherwise send 42 images in one call, where
// vision tokens dominate the cost. Twelve is enough to cover a reel's arc while keeping the call ~1-2¢.
// When there are more, frames are sampled EVENLY across the reel rather than taking the first twelve, so
// the back half of a long-form is still represented.
const MAX_RANKED_FRAMES = 12

/** Evenly-spaced sample of `n` items, always including the first and last. */
function sampleEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items
  const step = (items.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => items[Math.round(i * step)]!)
}

export async function rankCoverFrames(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return

  // INVARIANT: human choice outranks generated choice until explicitly reset. A creator who picked a frame
  // must not have it moved by a later render's ranking pass. Checked before spending, not after.
  if (coverIsCreatorChosen(reel.cover)) {
    console.log(`[rank-cover] ${reelId.slice(0, 8)} keeping the creator's chosen frame — not re-ranking`)
    return
  }

  const reelScenes = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
  })
  const withImages = reelScenes.filter((s) => s.imageAssetId)
  if (withImages.length === 0) return

  // Nothing to choose between — record it anyway so the shortlist UI has something to show and so a
  // one-frame reel doesn't pay for a vision call to be told the obvious.
  if (withImages.length === 1) {
    const only = withImages[0]!
    const cover: ReelCover = {
      frameAssetId: only.imageAssetId!,
      source: 'ranked',
      shortlist: [{ assetId: only.imageAssetId!, sceneIdx: only.idx, score: 5, reason: 'The only frame this reel has.', textSpace: 'bottom' }],
      sampled: 1,
      total: 1,
    }
    await db.update(reels).set({ cover, updatedAt: new Date() }).where(eq(reels.id, reelId))
    return
  }

  const postMeta = PostMetaSchema.safeParse(reel.postMeta)
  const overlay = postMeta.success ? thumbnailOverlay(postMeta.data) : ''
  const title = postMeta.success ? postMeta.data.title : ''

  const candidates = sampleEvenly(withImages, MAX_RANKED_FRAMES)
  if (candidates.length < withImages.length) {
    // Never let a bounded pass read as exhaustive coverage.
    console.log(`[rank-cover] ${reelId.slice(0, 8)} sampling ${candidates.length} of ${withImages.length} frames evenly across the reel`)
  }

  const inputHash = `${COVER_FRAME_V1_VERSION}:${candidates.map((s) => s.imageAssetId).join(',')}:${overlay}`

  await runStep<ReelCover>({ reelId, stepName: 'rank_cover_frames', inputHash }, async () => {
    const allAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
    const images = await Promise.all(
      candidates.map(async (s) => {
        const asset = allAssets.find((a) => a.id === s.imageAssetId)
        if (!asset) return null
        return { sceneIdx: s.idx, assetId: asset.id, buffer: await downloadBuffer(asset.storageKey) }
      }),
    )
    const usable = images.filter((i): i is NonNullable<typeof i> => i !== null)
    if (usable.length === 0) throw new Error('no downloadable frames to rank')

    const p = buildCoverFramePrompt({ candidateCount: usable.length, overlay, title })
    const res = await llmCall({
      templateVersion: COVER_FRAME_V1_VERSION,
      schema: CoverFrameRankingSchema,
      provider: 'anthropic',
      model: COVER_FRAME_MODEL,
      system: p.system,
      messages: [
        {
          role: 'user',
          content: [
            ...usable.map((i, idx) => ([
              { type: 'text' as const, text: `Candidate ${idx}:` },
              { type: 'image' as const, mediaType: 'image/webp' as const, base64: i.buffer.toString('base64') },
            ])).flat(),
            { type: 'text' as const, text: p.userMessage },
          ],
        },
      ],
    })

    // Map the model's candidate indices back to real assets, dropping anything out of range rather than
    // trusting the index blindly — an invented candidate number would otherwise pick an arbitrary frame.
    const shortlist = res.data.ranked
      .filter((r) => r.candidate >= 0 && r.candidate < usable.length)
      .map((r) => {
        const frame = usable[r.candidate]!
        return { assetId: frame.assetId, sceneIdx: frame.sceneIdx, score: r.score, reason: r.reason, textSpace: normalizeTextSpace(r.textSpace) }
      })
    if (shortlist.length === 0) throw new Error('ranking returned no usable candidates')

    const cover: ReelCover = {
      frameAssetId: shortlist[0]!.assetId,
      source: 'ranked',
      shortlist,
      sampled: usable.length,
      total: withImages.length,
    }
    const validated = ReelCoverSchema.parse(cover)

    const heroIdx = (reelScenes.find((s) => s.isHero && s.imageAssetId) ?? withImages[0])?.idx
    console.log(
      `[rank-cover] ${reelId.slice(0, 8)} picked scene ${shortlist[0]!.sceneIdx} (${shortlist[0]!.score}/10) ` +
      `over the old hero pick scene ${heroIdx} — "${shortlist[0]!.reason}"`,
    )

    return { output: validated, costCents: res.costCents }
  })

  // Persist outside the step body so a cache hit still lands the value on the reel (the row may have been
  // written by an earlier run whose reel update was interrupted).
  const step = await db.query.pipelineSteps.findFirst({
    where: (t, { and, eq: e }) => and(e(t.reelId, reelId), e(t.stepName, 'rank_cover_frames')),
    orderBy: (t, { desc }) => [desc(t.finishedAt)],
  })
  const parsed = ReelCoverSchema.safeParse(step?.output)
  if (parsed.success && !coverIsCreatorChosen(reel.cover)) {
    await db.update(reels).set({ cover: parsed.data, updatedAt: new Date() }).where(eq(reels.id, reelId))
  }
}
