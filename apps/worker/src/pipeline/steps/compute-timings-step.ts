import { eq, and, desc } from 'drizzle-orm'
import { getDb, reels, stories, scenes, assets, channels } from '@reels/db'
import { buildInputHash } from '@reels/providers'
import {
  AudioScriptSchema,
  TimingsSchema,
  OperatorSfxSchema,
  operatorCueLabel,
  computeTimings,
  isVocalSfxPrompt,
  dropEventsNear,
  effectiveGenre,
  type ComputeTimingsInput,
  type SceneSpan,
  type AlignedChar,
  type SfxEvent,
} from '@reels/core'
import { runStep } from '../harness.js'
import { resolveFirstMs } from '../anchors.js'

// compute_timings pipeline step — step 6 (docs/02 §4)
// Wraps the pure function, reads inputs from DB, persists Timings to reels.timings.

export async function runComputeTimings(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.audioScript || !reel.storyId) throw new Error(`Reel missing audioScript or storyId: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  // Genre picks the outro tail's length (§4.65) — same per-genre tuning as the dramatic pauses.
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)
  // Genre is per-REEL since series (specs/channel-series.md): read the frozen value, never the channel's
  // current one. It feeds both the outro tail AND the cache key below, so reading the channel here would
  // let a later channel edit silently re-time a finished reel.
  const genre = effectiveGenre(reel, channel)

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
  // Sound-design hygiene: drop LLM SFX with vocal prompts (mirrors the generate_sfx filter — a cue that
  // won't be synthesized shouldn't be scheduled either). See sfx-rules.ts.
  audioScript.sfx = audioScript.sfx.filter((c) => !isVocalSfxPrompt(c.prompt))
  // Operator + smart cues (SFX/speech/ambience). Placed AFTER compute_timings via soft anchoring, so an
  // ambiguous or slightly-off anchor lands at the first match instead of dropping / throwing.
  const operatorCues = OperatorSfxSchema.parse(reel.operatorSfx ?? [])

  const sceneSpans: SceneSpan[] = reelScenes.map((s) => ({
    idx: s.idx,
    narrationText: s.narrationText,
    tier: (s.tier as 'still' | 'video'),
  }))

  // v3: vocal-SFX drop + proximity dedupe + late music build-start (sound-design hygiene, 2026-07-06).
  // v4: sustained cues (endAnchor → endMs spans) + hash cue CONTENT, not count — a re-designed script
  // with the same number of cues must re-time (anchors/spans change), which a bare count missed.
  // v5: case-insensitive anchor fallback (LLM lowercases sentence-initial anchors).
  // v6: climax ring-out room (extend the reel when a loud hit lands near the end, by the shortfall only).
  // v7: outro tail — the closing image holds for a per-genre beat after the last spoken word (§4.65), so
  // genreCategory now changes the timings and must bust the cache.
  // v8: genre resolves PER REEL (series). Hashing the channel column would collide two reels on the same
  // channel that ran under different genres — identical narration + scenes, different outro tail, one
  // cache entry. The version bump also re-times every existing reel once, deliberately.
  // v10: explicit `resolve` endings hold 2.6s after voice (owner playback, 2026-09-01). Bust persisted
  // 1.8s timing plans so every future re-run receives the longer, shape-owned landing.
  const inputHash = buildInputHash('compute_timings.v10', {
    narration: story.body,
    genreCategory: genre,
    // Alignment IS the master clock; a re-synthesized voiceover has new timestamps under a new row
    // (createdAt). Hash it so a voice/narration change busts the cache instead of reusing stale timings.
    voiceoverAt: voiceover.createdAt,
    sceneCount: sceneSpans.length,
    sfxCues: audioScript.sfx.map((c) => `${c.anchor}@${c.offsetMs}>${c.endAnchor ?? ''}`).join('|'),
    opCues: operatorCues.map((c) => `${c.anchor}@${c.offsetMs}`).join('|'), // cue changes → re-run
    hasMusic: !!audioScript.music,
    hasSilence: !!audioScript.silenceDrop,
    ending: audioScript.ending
      ? `${audioScript.ending.anchor}:${audioScript.ending.focus}:${audioScript.ending.shape}`
      : 'legacy',
  })

  const result = await runStep(
    { reelId, stepName: 'compute_timings', inputHash, spendsProviderMoney: false },
    async () => {
      const timingsInput: ComputeTimingsInput = {
        narration: story.body,
        alignment: meta.alignment,
        durationMs: meta.durationMs,
        scenes: sceneSpans,
        audioScript,
        twistAnchor: story.twistAnchor ?? '',
        genreCategory: genre,
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
      // Operator wins on the same anchor AND on the same BEAT: exact-anchor dedupe misses same-moment
      // collisions with different anchor text ("mahinang tawa" vs "may narinig akong mahinang tawa" →
      // two laughs at once). Drop LLM events within 1.5s of any operator/smart cue.
      const llmEvents = dropEventsNear(
        timings.sfxEvents.filter((e) => !opAnchors.has(e.anchor)),
        opEvents.map((e) => e.atMs),
      )
      timings.sfxEvents = [...llmEvents, ...opEvents]

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
