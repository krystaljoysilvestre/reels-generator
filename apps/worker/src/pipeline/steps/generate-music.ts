import { eq } from 'drizzle-orm'
import { getDb, reels, channels } from '@reels/db'
import { generateMusic, uploadBuffer, buildInputHash } from '@reels/providers'
import {
  AudioPacksSchema,
  ToneConfigSchema,
  AudioScriptSchema,
  TimingsSchema,
  buildMusicPrompt,
  clampMusicLengthMs,
} from '@reels/core'
import { runStep } from '../harness.js'

// generate_music — PER-REEL bespoke background bed (musicMode='ai' channels only).
//
// Composes ONE original instrumental bed for THIS reel: seeded by the channel's derived audioMood (its
// sonic DNA — instruments/texture/tempo) and tilted by this story's mood, sized to the reel's length.
// So every reel gets a fresh, on-brand bed that fits its own story (heard in context at spot_check)
// rather than reusing a fixed channel pool. preset/upload/none channels: no-op — the mixer uses their
// own track pool (or nothing). Arc-synced *scored* music (timed to peakMoment) builds on this later.
//
// REUSE: review-mode channels generate + vet this bed at the storyboard (/api/pipeline/preview-music),
// which sets musicKey/musicLengthMs before render. If that bed is already long enough to cover the
// final duration, we skip — the operator ships exactly the track they approved. We only (re)compose
// here when there's no bed yet (auto-mode channels skip the storyboard) or the storyboard estimate
// came up short (a too-short bed would loop with an audible seam in the mixer).

export async function generateMusicStep(reelId: string): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)
  if (!reel.timings || !reel.audioScript) throw new Error(`Reel missing timings or audioScript: ${reelId}`)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found`)
  const audioPacks = AudioPacksSchema.parse(channel.audioPacks ?? {})
  if (audioPacks.musicMode !== 'ai') return // only AI-music channels generate a per-reel bed

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  // Reuse a storyboard-vetted bed when it covers the final duration (no loop seam).
  if (reel.musicKey && reel.musicLengthMs != null && reel.musicLengthMs >= timings.durationMs) {
    console.log(`[music] ${reelId} reusing storyboard bed (${reel.musicLengthMs}ms ≥ ${timings.durationMs}ms)`)
    return
  }

  const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
  // This reel's mood tilt — from the annotated music brief (derived from the story's mood) — so the
  // bed fits THIS story while staying in the channel's sonic family.
  const prompt = buildMusicPrompt({
    audioMood: audioPacks.audioMood,
    toneIntensity: tone.intensity,
    nicheDescription: channel.nicheDescription,
    moodTags: audioScript.music?.moodTags ?? [],
  })
  // Size the bed to the reel — within Eleven Music's bounds, so no looping/seams.
  const lengthMs = clampMusicLengthMs(timings.durationMs)
  const inputHash = buildInputHash('generate_music.v1', { prompt, lengthMs, reelId })

  await runStep(
    { reelId, stepName: 'generate_music', inputHash },
    async () => {
      const { audio, costCents } = await generateMusic({ prompt, lengthMs })
      const storageKey = `audio/reel/${reelId}.mp3`
      await uploadBuffer(storageKey, audio, 'audio/mpeg')
      await db
        .update(reels)
        .set({ musicKey: storageKey, musicLengthMs: lengthMs, updatedAt: new Date() })
        .where(eq(reels.id, reelId))
      return { output: { storageKey }, costCents: costCents ?? 0 }
    },
  )
}
