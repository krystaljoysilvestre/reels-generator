import { eq, and, desc } from 'drizzle-orm'
import { getDb, reels, stories, scenes, assets } from '@reels/db'
import { buildInputHash } from '@reels/providers'
import {
  AudioScriptSchema,
  TimingsSchema,
  OperatorSfxSchema,
  operatorCueLabel,
  computeTimings,
  type ComputeTimingsInput,
  type SceneSpan,
  type AlignedChar,
  type SfxEvent,
} from '@reels/core'
import { runStep } from '../harness.js'

// Resolve an anchor to its FIRST occurrence in the narration (soft — returns null if absent). Operator
// cues use this instead of compute_timings' strict unique-or-throw resolution, so an ambiguous anchor
// still places (at the first match) rather than silently vanishing or crashing the render.
function resolveFirstMs(cps: string[], alignment: AlignedChar[], anchor: string, offsetMs: number, durationMs: number): number | null {
  const a = Array.from(anchor)
  if (a.length === 0 || a.length > cps.length) return null
  for (let i = 0; i <= cps.length - a.length; i++) {
    let match = true
    for (let j = 0; j < a.length; j++) { if (cps[i + j] !== a[j]) { match = false; break } }
    if (match) {
      const start = alignment[i]?.startMs
      if (start == null) return null
      return Math.max(0, Math.min(start + offsetMs, durationMs))
    }
  }
  return null
}

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

  // Load alignment (the master clock) from the voiceover asset meta. A voice change (re-run of
  // generate_tts) appends a NEW voiceover row with fresh alignment; take the newest so timings are
  // computed against the audio that actually plays, not a stale earlier take.
  const voiceover = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'voiceover')),
    orderBy: [desc(assets.createdAt)],
  })
  if (!voiceover) throw new Error(`No voiceover asset for reel: ${reelId}`)

  const meta = voiceover.meta as { alignment: AlignedChar[]; durationMs: number }
  if (!meta.alignment || !meta.durationMs) {
    throw new Error('Voiceover asset missing alignment or durationMs in meta')
  }

  const audioScript = AudioScriptSchema.parse(reel.audioScript)
  // Operator + smart cues (SFX/speech/ambience). Placed AFTER compute_timings via soft anchoring, so an
  // ambiguous or slightly-off anchor lands at the first match instead of dropping / throwing.
  const operatorCues = OperatorSfxSchema.parse(reel.operatorSfx ?? [])

  const sceneSpans: SceneSpan[] = reelScenes.map((s) => ({
    idx: s.idx,
    narrationText: s.narrationText,
    tier: (s.tier as 'still' | 'video'),
  }))

  const inputHash = buildInputHash('compute_timings.v2', {
    narration: story.body,
    // Alignment IS the master clock; a re-synthesized voiceover has new timestamps under a new row
    // (createdAt). Hash it so a voice/narration change busts the cache instead of reusing stale timings.
    voiceoverAt: voiceover.createdAt,
    sceneCount: sceneSpans.length,
    sfxCount: audioScript.sfx.length,
    opCues: operatorCues.map((c) => `${c.anchor}@${c.offsetMs}`).join('|'), // cue changes → re-run
    hasMusic: !!audioScript.music,
    hasSilence: !!audioScript.silenceDrop,
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

      // Place operator/smart cues by first-occurrence (soft). Operator wins over an LLM SFX on the same
      // anchor, so the mixer's anchor→asset match stays 1:1.
      const cps = Array.from(story.body)
      const opEvents: SfxEvent[] = []
      const opAnchors = new Set<string>()
      for (const c of operatorCues) {
        const atMs = resolveFirstMs(cps, meta.alignment, c.anchor, c.offsetMs, meta.durationMs)
        if (atMs == null) continue // anchor absent (narration edited) → skip rather than crash
        opAnchors.add(c.anchor)
        opEvents.push({ anchor: c.anchor, prompt: operatorCueLabel(c), atMs, volumeDb: c.volumeDb })
      }
      timings.sfxEvents = [...timings.sfxEvents.filter((e) => !opAnchors.has(e.anchor)), ...opEvents]

      const validated = TimingsSchema.parse(timings)

      // Persist scene startMs/endMs back to scene rows. Must scope by BOTH reel and scene idx — without
      // the idx predicate every row is overwritten with the last scene's span (all scenes collapse to
      // one timing).
      for (const st of validated.scenes) {
        await db
          .update(scenes)
          .set({ startMs: st.startMs, endMs: st.endMs })
          .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, st.idx)))
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
