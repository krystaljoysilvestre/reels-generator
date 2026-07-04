import { eq } from 'drizzle-orm'
import { getDb, reels, stories, scenes, assets, channels } from '@reels/db'
import { ElevenLabsTtsProvider, buildInputHash } from '@reels/providers'
import { moodToVoiceSettings, ToneConfigSchema, type VoiceSettings } from '@reels/core'
import { runStep } from '../harness.js'

const ttsProvider = new ElevenLabsTtsProvider()

// generate_tts — step 5 (docs/02 §4)
// CRITICAL: narration submitted VERBATIM, no pre-processing [M10].
// The alignment chars must be 1:1 with Array.from(narration) or compute_timings throws.

export async function generateTts(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId || !reel.voiceId) throw new Error(`Reel missing story or voiceId: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  // Verify voice is in the channel pool
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  // Per-reel delivery: use the operator's manual override if they tweaked it in the voice picker;
  // otherwise auto-derive ElevenLabs voice_settings from the channel's tone baseline + this reel's mood
  // (aggregated from its scene moods). A tense story reads differently from a wistful one. [Step 3]
  const reelScenes = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    columns: { mood: true },
  })
  const moodTags = [...new Set(reelScenes.flatMap((s) => s.mood ?? []))]
  const override = reel.voiceSettings as VoiceSettings | null
  const voiceSettings = override ?? moodToVoiceSettings(moodTags, ToneConfigSchema.parse(channel.toneConfig ?? {}))

  const inputHash = buildInputHash('tts.elevenlabs.v1', {
    narration: story.body,   // hash of the exact text to catch any upstream mutation
    voiceId: reel.voiceId,
    voiceSettings,           // re-run if the derived delivery changes
  })

  const result = await runStep(
    { reelId, stepName: 'generate_tts', inputHash },
    async () => {
      // Submit story.body VERBATIM — no normalization, SSML, or text mutation [M10]
      const ttsResult = await ttsProvider.synthesize({
        narration: story.body,
        voiceId: reel.voiceId!,
        reelId,
        voiceSettings,
      })

      return {
        output: {
          audioStorageKey: ttsResult.audioStorageKey,
          durationMs: ttsResult.durationMs,
          alignment: ttsResult.alignment, // AlignedChar[] — the master clock
        },
        costCents: ttsResult.costCents,
      }
    },
  )

  // Persist the voiceover asset with alignment as meta. The storage key is constant per reel, so a voice
  // change (re-synthesis) upserts THIS row in place — refreshing the alignment and bumping createdAt so
  // compute_timings / mix_audio (which hash voiceover.createdAt) recompute against the new take.
  await db
    .insert(assets)
    .values({
      reelId,
      channelId: reel.channelId,
      kind: 'voiceover',
      storageKey: result.output.audioStorageKey,
      provider: 'elevenlabs',
      costCents: result.costCents,
      meta: {
        durationMs: result.output.durationMs,
        alignment: result.output.alignment, // word timestamps = master clock
      },
    })
    .onConflictDoUpdate({
      target: [assets.reelId, assets.storageKey],
      set: {
        channelId: reel.channelId,
        provider: 'elevenlabs',
        costCents: result.costCents,
        meta: { durationMs: result.output.durationMs, alignment: result.output.alignment },
        createdAt: new Date(),
      },
    })
}
