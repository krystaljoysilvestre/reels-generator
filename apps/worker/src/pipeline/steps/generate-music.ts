import { eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { getDb, reels, channels } from '@reels/db'
import { generateMusic, uploadBuffer, buildInputHash } from '@reels/providers'
import {
  AudioPacksSchema,
  ToneConfigSchema,
  AudioScriptSchema,
  TimingsSchema,
  buildMusicPrompt,
  clampMusicLengthMs,
  resolveMusicMood,
  MusicMoodSchema,
} from '@reels/core'
import { runStep } from '../harness.js'

// generate_music — PER-REEL bespoke background bed (musicMode='ai' channels only).
//
// Composes ONE original instrumental bed for THIS reel: seeded by the channel's derived audioMood (its
// sonic DNA — instruments/texture) and tilted by the operator's MOOD preset (arc + mood tags, resolved
// into audioScript.music by annotate_audio_script), sized to the reel's length. So every reel gets a
// fresh, on-brand bed that fits its own story. preset/upload/none channels: no-op — the mixer uses their
// own track pool (or nothing).
//
// IDEMPOTENCY: if a prior run of this step already composed the bed (reel.musicKey set), reuse it — don't
// re-pay the provider. (The bed is now generated only here at render; there's no storyboard preview.)

export async function generateMusicStep(reelId: string): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)
  if (!reel.timings || !reel.audioScript) throw new Error(`Reel missing timings or audioScript: ${reelId}`)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found`)
  const audioPacks = AudioPacksSchema.parse(channel.audioPacks ?? {})
  if (reel.musicUploadKey) return // operator uploaded a bed for this reel — the mixer uses it, don't generate
  if (audioPacks.musicMode !== 'ai') return // only AI-music channels generate a per-reel bed

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  // Idempotency is handled below by runStep's inputHash (prompt + length) — NOT a blanket "musicKey exists
  // → skip". That blanket skip meant a changed prompt (e.g. this evolving-bed rework) reused the old flat
  // bed forever. Now the content-hashed key changes with the prompt, so the mixer also re-mixes.

  const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
  // ONE coherent bed for the reel: the channel's sonic DNA + the operator's chosen MOOD (reel override →
  // channel default → audioMood fallback). The mood's rich phrase leads the bed's character; the mixer's
  // volume envelope supplies the swell toward the twist and SFX land the climax hit.
  const reelMood = MusicMoodSchema.safeParse(reel.musicMood)
  const { moodTags, prompt: moodPrompt } = resolveMusicMood(
    reelMood.success ? reelMood.data : null,
    audioPacks.musicMood,
    audioPacks.audioMood,
  )
  // Where the story's emotional peak sits (fraction of the reel) — so the bed builds toward the same beat
  // the mixer's volume envelope swells to. Fall back to a late peak when there's no music timing.
  const peakFrac = timings.music ? timings.music.peakAnchorMs / timings.durationMs : 0.8
  const prompt = buildMusicPrompt({
    audioMood: audioPacks.audioMood,
    toneIntensity: tone.intensity,
    nicheDescription: channel.nicheDescription,
    moodTags,
    ...(moodPrompt ? { moodPrompt } : {}),
    ...(audioScript.music?.type ? { musicType: audioScript.music.type } : {}),
    peakFrac,
  })
  const lengthMs = clampMusicLengthMs(timings.durationMs)
  // v4: evolving bed (was v3: steady wash). Prompt now carries the arc, so the hash changes and re-composes.
  const inputHash = buildInputHash('generate_music.v4', { prompt, lengthMs, reelId })

  await runStep(
    { reelId, stepName: 'generate_music', inputHash },
    async () => {
      const bed = await generateMusic({ prompt, lengthMs })
      // Content-hash the key on prompt+length so a re-composed bed lands on a NEW key — the mixer hashes
      // reel.musicKey, so a same-key overwrite would NOT trigger a re-mix and the new bed would go unheard.
      const promptHash = createHash('sha1').update(`${prompt}|${lengthMs}`).digest('hex').slice(0, 10)
      const key = `audio/reel/${reelId}-${promptHash}.mp3`
      await uploadBuffer(key, bed.audio, 'audio/mpeg')
      await db
        .update(reels)
        .set({ musicKey: key, musicLengthMs: lengthMs, updatedAt: new Date() })
        .where(eq(reels.id, reelId))
      return { output: { key }, costCents: bed.costCents ?? 0 }
    },
  )
}
