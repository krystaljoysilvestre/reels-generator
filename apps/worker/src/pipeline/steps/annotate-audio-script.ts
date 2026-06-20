import { eq } from 'drizzle-orm'
import { getDb, reels, stories } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { AudioScriptSchema, AudioPacksSchema, type AudioScript } from '@reels/core'
import { buildAudioScriptPrompt, AUDIOSCRIPT_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// annotate_audio_script — step 2 (docs/02 §4)
// Validates anchor uniqueness after generation.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateAnchorUniqueness(narration: string, audioScript: any): string[] {
  const errors: string[] = []

  const allAnchors: { anchor: string; field: string }[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...audioScript.sfx.map((s: any) => ({ anchor: s.anchor as string, field: 'sfx' })),
    ...(audioScript.silenceDrop ? [{ anchor: audioScript.silenceDrop.anchor, field: 'silenceDrop' }] : []),
  ]

  for (const { anchor, field } of allAnchors) {
    if (!anchor) continue
    const occurrences = countOccurrences(narration, anchor)
    if (occurrences === 0) errors.push(`${field} anchor not found in narration: "${anchor}"`)
    if (occurrences > 1) errors.push(`${field} anchor ambiguous (${occurrences} matches): "${anchor}"`)
  }

  return errors
}

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0
  let count = 0, pos = 0
  while ((pos = text.indexOf(sub, pos)) !== -1) { count++; pos++ }
  return count
}

export async function annotateAudioScript(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  const { system, userMessage } = buildAudioScriptPrompt(story.body)
  const inputHash = buildInputHash(AUDIOSCRIPT_V1_VERSION, { narration: story.body })

  const result = await runStep(
    { reelId, stepName: 'annotate_audio_script', inputHash },
    async () => {
      const llm = await llmCall({
        templateVersion: AUDIOSCRIPT_V1_VERSION,
        schema: AudioScriptSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Validate anchor uniqueness — repair call if any fail
      const errors = validateAnchorUniqueness(story.body, llm.data)
      if (errors.length > 0) {
        const repairLlm = await llmCall({
          templateVersion: AUDIOSCRIPT_V1_VERSION,
          schema: AudioScriptSchema,
          system,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: JSON.stringify(llm.data) },
            {
              role: 'user',
              content: `The following anchors are invalid: ${errors.join('; ')}. Each anchor must be an exact substring that appears EXACTLY ONCE in the narration. Extend any ambiguous anchor span until unique. Return the corrected JSON only.`,
            },
          ],
        })
        return { output: repairLlm.data, costCents: llm.costCents + repairLlm.costCents }
      }

      return { output: llm.data, costCents: llm.costCents }
    },
  )

  // Every reel should have background music (Sound step). If this reel's script proposed none, inject
  // an intent — empty anchors let compute-timings pick the start (0) and peak (twist/0.8×duration).
  //  • AI-music channels have no pool (each reel's bed is generated downstream by generate_music), so
  //    seed the intent from the channel's derived audioMood.
  //  • preset/upload channels seed from their first pool bed; selectMusicTrack matches it by type.
  const audioScript = result.output as AudioScript
  if (!audioScript.music) {
    const { channels } = await import('@reels/db')
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
    const audioPacks = channel ? AudioPacksSchema.parse(channel.audioPacks) : undefined
    if (audioPacks?.musicMode === 'ai') {
      audioScript.music = {
        type: audioPacks.audioMood?.type ?? 'low_drone',
        startAnchor: '',
        peakAnchor: '',
        moodTags: audioPacks.audioMood?.moodTags ?? [],
      }
    } else {
      const bed = audioPacks?.musicPack[0]
      if (bed) {
        audioScript.music = { type: bed.type, startAnchor: '', peakAnchor: '', moodTags: bed.moodTags }
      }
    }
  }

  // Persist audio_script to reel
  await db
    .update(reels)
    .set({ audioScript: audioScript as never, updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}
