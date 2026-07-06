import { eq } from 'drizzle-orm'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, reels, stories, scenes, assets, channels } from '@reels/db'
import { ElevenLabsTtsProvider, buildInputHash, downloadBuffer, uploadBuffer } from '@reels/providers'
import { moodToVoiceSettings, ToneConfigSchema, planNarrationPauses, resolvePauses, applyPausesToAlignment, type VoiceSettings } from '@reels/core'
import { insertSilences } from '@reels/render'
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
    columns: { idx: true, mood: true, narrationText: true },
  })
  reelScenes.sort((a, b) => a.idx - b.idx)
  const moodTags = [...new Set(reelScenes.flatMap((s) => s.mood ?? []))]
  const override = reel.voiceSettings as VoiceSettings | null
  const voiceSettings = override ?? moodToVoiceSettings(moodTags, ToneConfigSchema.parse(channel.toneConfig ?? {}), channel.genreCategory)

  // Dramatic pauses (horror): silence is spliced into the voiceover AFTER synthesis and the alignment
  // shifts to match — the narration text stays verbatim, so nothing downstream re-rolls. Beats are planned
  // up front (positions + TARGET total silence) so the cache busts when pacing changes; the actual top-up
  // is resolved against the real alignment below. [M10-safe: alignment length is preserved]
  const pauseBeats = planNarrationPauses(story.body, reelScenes.map((s) => s.narrationText), channel.genreCategory)

  const inputHash = buildInputHash('tts.elevenlabs.v3', {
    narration: story.body,   // hash of the exact text to catch any upstream mutation
    voiceId: reel.voiceId,
    voiceSettings,           // re-run if the derived delivery changes
    beats: pauseBeats.map((b) => `${b.cpIndex}:${b.targetMs}`).join('|'), // re-run if pacing changes
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

      // Resolve beats against the REAL alignment: only top up silence that isn't already there naturally.
      const pauses = resolvePauses(pauseBeats, ttsResult.alignment)
      if (pauses.length === 0) {
        return {
          output: {
            audioStorageKey: ttsResult.audioStorageKey,
            durationMs: ttsResult.durationMs,
            alignment: ttsResult.alignment, // AlignedChar[] — the master clock
          },
          costCents: ttsResult.costCents,
        }
      }

      // Splice the resolved silences into the just-uploaded voiceover, then shift the alignment to match.
      const applied = applyPausesToAlignment(ttsResult.alignment, ttsResult.durationMs, pauses)
      const tmp = await mkdtemp(join(tmpdir(), 'tts-pause-'))
      try {
        const inPath = join(tmp, 'in.mp3')
        const outPath = join(tmp, 'out.mp3')
        await writeFile(inPath, await downloadBuffer(ttsResult.audioStorageKey))
        await insertSilences(inPath, outPath, applied.insertions)
        await uploadBuffer(ttsResult.audioStorageKey, await readFile(outPath), 'audio/mpeg')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }

      return {
        output: {
          audioStorageKey: ttsResult.audioStorageKey,
          durationMs: applied.durationMs,   // extended by the total inserted silence
          alignment: applied.alignment,     // shifted master clock (same length, times moved)
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
