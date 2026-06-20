import { eq } from 'drizzle-orm'
import { getDb, channels } from '@reels/db'
import { generateMusic, uploadBuffer } from '@reels/providers'
import { AudioPacksSchema, ToneConfigSchema, peakFracForType, type MusicTrack } from '@reels/core'

// generate_channel_beds — CHANNEL-scoped (not part of the reel pipeline). When a channel uses
// AI-generated music (musicMode='ai'), compose a small BESPOKE bed pool ONCE from the channel's mood,
// so every reel draws an original, on-brand bed (mood-matched at mix time). Generated async at channel
// creation; idempotent (skips if this channel's beds already exist). Scored/arc-timed music is later.

const BED_LENGTH_MS = 30_000
// Hard constraints on every bed (same as the preset library): no voices (would fight the narration),
// seamless loop, sits under a speaking voice.
const CONSTRAINT =
  ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
  ' Seamless loop: consistent texture and steady volume throughout, no intro or outro, no big hits.' +
  ' Sits quietly in the background under a speaking voice.'

// Three beds spanning the channel's mood range so the mixer can match each reel: a core bed, a more
// intense one (tense/climactic reels), and a calmer one (quieter reels).
const VARIANTS: Array<{ id: string; suffix: string; tags: string[] }> = [
  { id: 'core', suffix: '', tags: [] },
  { id: 'intense', suffix: ', a more tense, darker and more intense variation', tags: ['tense', 'intense', 'dark'] },
  { id: 'calm', suffix: ', a calmer, sparser and more restrained variation', tags: ['calm', 'sparse', 'restrained'] },
]

export async function generateChannelBeds(channelId: string): Promise<void> {
  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  const audioPacks = AudioPacksSchema.parse(channel.audioPacks ?? {})
  if (audioPacks.musicMode !== 'ai') return // only AI-music channels get bespoke beds

  // Idempotency: skip if this channel's bespoke beds already exist.
  const prefix = `audio/channel/${channelId}/`
  if (audioPacks.musicPack.some((t) => t.path.startsWith(prefix))) return

  // Base prompt from the derived audioMood; fall back to niche/tone if it's missing.
  const mood = audioPacks.audioMood
  const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
  const basePrompt =
    mood?.prompt?.trim() ||
    `a ${tone.intensity >= 6 ? 'dark, tense' : 'warm, gentle'} cinematic background bed for: ${channel.nicheDescription.slice(0, 160)}`
  const type = mood?.type ?? 'low_drone'
  const baseTags = mood?.moodTags ?? []

  const beds: MusicTrack[] = []
  let costCents = 0
  for (const v of VARIANTS) {
    const { audio, costCents: c } = await generateMusic({ prompt: basePrompt + v.suffix + '.' + CONSTRAINT, lengthMs: BED_LENGTH_MS })
    const path = `${prefix}${v.id}.mp3`
    await uploadBuffer(path, audio, 'audio/mpeg')
    beds.push({ id: `channel-${v.id}`, path, type, peakFrac: peakFracForType(type), moodTags: [...new Set([...baseTags, ...v.tags])] })
    costCents += c ?? 0
  }

  // Persist beds into the channel's musicPack + bill the generation to the channel.
  await db
    .update(channels)
    .set({
      audioPacks: { ...audioPacks, musicPack: [...audioPacks.musicPack, ...beds] },
      costCents: channel.costCents + costCents,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId))
}
