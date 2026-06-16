import { eq } from 'drizzle-orm'
import { getDb, reels, stories } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { AudioScriptSchema, type AudioScript } from '@reels/core'
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

  // Persist audio_script to reel
  await db
    .update(reels)
    .set({ audioScript: result.output as never, updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}
