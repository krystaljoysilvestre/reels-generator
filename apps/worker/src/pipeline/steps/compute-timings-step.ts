import { eq } from 'drizzle-orm'
import { getDb, reels, stories, scenes, assets } from '@reels/db'
import { buildInputHash } from '@reels/providers'
import {
  AudioScriptSchema,
  TimingsSchema,
  computeTimings,
  type ComputeTimingsInput,
  type SceneSpan,
  type AlignedChar,
} from '@reels/core'
import { runStep } from '../harness.js'

// compute_timings pipeline step — step 6 (docs/02 §4)
// Wraps the pure function, reads inputs from DB, persists Timings to reels.timings.

export async function runComputeTimings(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.audioScript || !reel.storyId) throw new Error(`Reel missing audioScript or storyId: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  const reelScenes = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  reelScenes.sort((a, b) => a.idx - b.idx)
  if (reelScenes.length === 0) throw new Error(`No scenes for reel: ${reelId}`)

  // Load alignment from the voiceover asset meta
  const voiceoverAsset = await db.query.assets.findFirst({
    where: eq(assets.reelId, reelId),
  })
  // Find the voiceover asset (kind = 'voiceover')
  const allAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const voiceover = allAssets.find((a) => a.kind === 'voiceover')
  if (!voiceover) throw new Error(`No voiceover asset for reel: ${reelId}`)

  const meta = voiceover.meta as { alignment: AlignedChar[]; durationMs: number }
  if (!meta.alignment || !meta.durationMs) {
    throw new Error('Voiceover asset missing alignment or durationMs in meta')
  }

  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  const sceneSpans: SceneSpan[] = reelScenes.map((s) => ({
    idx: s.idx,
    narrationText: s.narrationText,
    tier: (s.tier as 'still' | 'video'),
  }))

  const inputHash = buildInputHash('compute_timings.v1', {
    narration: story.body,
    sceneCount: sceneSpans.length,
    sfxCount: audioScript.sfx.length,
    hasMusic: !!audioScript.music,
  })

  const result = await runStep(
    { reelId, stepName: 'compute_timings', inputHash },
    async () => {
      const timingsInput: ComputeTimingsInput = {
        narration: story.body,
        alignment: meta.alignment,
        durationMs: meta.durationMs,
        scenes: sceneSpans,
        audioScript,
        twistAnchor: story.twistAnchor ?? '',
      }

      const timings = computeTimings(timingsInput)
      const validated = TimingsSchema.parse(timings)

      // Persist scene startMs/endMs back to scene rows
      for (const st of validated.scenes) {
        await db
          .update(scenes)
          .set({ startMs: st.startMs, endMs: st.endMs })
          .where(eq(scenes.reelId, reelId))
      }

      return { output: validated, costCents: 0 }  // pure computation, no provider cost
    },
  )

  // Persist full Timings to reel
  await db
    .update(reels)
    .set({ timings: result.output as never, updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}
