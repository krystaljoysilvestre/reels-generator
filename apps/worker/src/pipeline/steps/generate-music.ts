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

  // Always reuse a storyboard-vetted bed if one exists — the operator approved THAT track, so it must be
  // the one that ships. The mixer loops the bed to cover the reel, so a shorter-than-final bed is fine
  // (we over-generate at the storyboard to keep any loop seam off-screen). Only compose here when there's
  // no bed yet (e.g. auto-mode channels that skip the storyboard).
  if (reel.musicKey) {
    console.log(`[music] ${reelId} reusing approved storyboard bed (${reel.musicLengthMs ?? '?'}ms)`)
    return
  }

  const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
  // Two-section score: an intro (restrained build) + a climax (intense peak) bed of the same sonic family,
  // crossfaded at the twist in the mixer. Both tilt to THIS story's mood. (This path is for auto-mode
  // channels that skip the storyboard; review-mode reels arrive with both beds already composed there.)
  const common = {
    audioMood: audioPacks.audioMood,
    toneIntensity: tone.intensity,
    nicheDescription: channel.nicheDescription,
    moodTags: audioScript.music?.moodTags ?? [],
  }
  const introPrompt = buildMusicPrompt({ ...common, section: 'intro' })
  const climaxPrompt = buildMusicPrompt({ ...common, section: 'climax' })
  const lengthMs = clampMusicLengthMs(timings.durationMs)
  const inputHash = buildInputHash('generate_music.v2', { introPrompt, climaxPrompt, lengthMs, reelId })

  await runStep(
    { reelId, stepName: 'generate_music', inputHash },
    async () => {
      const intro = await generateMusic({ prompt: introPrompt, lengthMs })
      const climax = await generateMusic({ prompt: climaxPrompt, lengthMs })
      const keyA = `audio/reel/${reelId}.mp3`
      const keyB = `audio/reel/${reelId}-b.mp3`
      await uploadBuffer(keyA, intro.audio, 'audio/mpeg')
      await uploadBuffer(keyB, climax.audio, 'audio/mpeg')
      await db
        .update(reels)
        .set({ musicKey: keyA, musicKeyB: keyB, musicLengthMs: lengthMs, updatedAt: new Date() })
        .where(eq(reels.id, reelId))
      return { output: { keyA, keyB }, costCents: (intro.costCents ?? 0) + (climax.costCents ?? 0) }
    },
  )
}
