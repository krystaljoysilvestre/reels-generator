import { eq } from 'drizzle-orm'
import { getDb, reels, channels } from '@reels/db'
import { generateMusic, uploadBuffer, buildInputHash } from '@reels/providers'
import { AudioPacksSchema, ToneConfigSchema, AudioScriptSchema, TimingsSchema } from '@reels/core'
import { runStep } from '../harness.js'

// generate_music — PER-REEL bespoke background bed (musicMode='ai' channels only).
//
// Composes ONE original instrumental bed for THIS reel: seeded by the channel's derived audioMood (its
// sonic DNA — instruments/texture/tempo) and tilted by this story's mood, sized to the reel's length.
// So every reel gets a fresh, on-brand bed that fits its own story (heard in context at spot_check)
// rather than reusing a fixed channel pool. preset/upload/none channels: no-op — the mixer uses their
// own track pool (or nothing). Arc-synced *scored* music (timed to peakMoment) builds on this later.

// Same hard constraints as the preset library: no vocals (would fight the narration), steady texture,
// sits under a speaking voice.
const CONSTRAINT =
  ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
  ' Consistent texture and steady volume throughout, no jarring hits or big drops.' +
  ' Sits quietly in the background under a speaking voice.'

const MUSIC_MIN_MS = 10_000
const MUSIC_MAX_MS = 300_000

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

  // Base sonic DNA from the channel's derived audioMood; fall back to niche/tone if it's missing.
  const mood = audioPacks.audioMood
  const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
  const basePrompt =
    mood?.prompt?.trim() ||
    `a ${tone.intensity >= 6 ? 'dark, tense' : 'warm, gentle'} cinematic background bed for: ${channel.nicheDescription.slice(0, 160)}`

  // This reel's mood tilt — from the annotated music brief (derived from the story's mood) — so the
  // bed fits THIS story while staying in the channel's sonic family.
  const reelMoods = audioScript.music?.moodTags ?? []
  const tilt = reelMoods.length ? ` Lean ${reelMoods.join(', ')} for this story.` : ''

  // Size the bed to the reel — within Eleven Music's bounds, so no looping/seams.
  const lengthMs = Math.min(MUSIC_MAX_MS, Math.max(MUSIC_MIN_MS, timings.durationMs))
  const prompt = basePrompt + tilt + CONSTRAINT
  const inputHash = buildInputHash('generate_music.v1', { prompt, lengthMs, reelId })

  await runStep(
    { reelId, stepName: 'generate_music', inputHash },
    async () => {
      const { audio, costCents } = await generateMusic({ prompt, lengthMs })
      const storageKey = `audio/reel/${reelId}.mp3`
      await uploadBuffer(storageKey, audio, 'audio/mpeg')
      await db.update(reels).set({ musicKey: storageKey, updatedAt: new Date() }).where(eq(reels.id, reelId))
      return { output: { storageKey }, costCents: costCents ?? 0 }
    },
  )
}
