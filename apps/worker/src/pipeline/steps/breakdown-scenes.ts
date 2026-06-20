import { eq } from 'drizzle-orm'
import { getDb, reels, stories, scenes, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { ScenesOutputSchema, WorldBibleSchema } from '@reels/core'
import { buildScenesPrompt, SCENES_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// breakdown_scenes — step 3 (docs/02 §4)
// Scenes emit full contiguous narration substrings [M9].
// Style suffix is NOT in the prompt — injected server-side in generate_images [CLAUDE.md rule 2].

function validateSceneTiling(narration: string, sceneTexts: string[]): string | null {
  // Verify scenes tile the narration gaplessly (same check as compute_timings will do)
  let cursor = 0
  const normalized = narration.trim()
  for (const text of sceneTexts) {
    const idx = normalized.indexOf(text, cursor)
    if (idx === -1) return `Scene text not found at cursor ${cursor}: "${text.slice(0, 50)}..."`
    if (idx > cursor && normalized.slice(cursor, idx).trim() !== '') {
      return `Gap between scenes at position ${cursor}–${idx}`
    }
    cursor = idx + text.length
  }
  const trailing = normalized.slice(cursor).trim()
  if (trailing.length > 0) return `Narration not fully covered; trailing: "${trailing.slice(0, 50)}"`
  return null
}

export async function breakdownScenes(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const [story, channel] = await Promise.all([
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!story || !channel) throw new Error('Story or channel not found')

  const worldBible = WorldBibleSchema.parse(channel.worldBible)

  // Scene count is BEAT-driven, not clock-driven: give the director a length-scaled range
  // (~1 scene / 9-16s) and let the story's dramatic beats decide the exact number within it.
  // The peak line (story.twistAnchor = the LLM's peakMoment) is passed so the climax always
  // gets its own dedicated shot. All bounds stay inside the schema's hard 3-16 range.
  const seconds = channel.targetSeconds ?? 75
  const minScenes = Math.max(3, Math.floor(seconds / 16))
  const maxScenes = Math.min(16, Math.max(minScenes + 1, Math.ceil(seconds / 9)))
  const peakMoment = story.twistAnchor ?? ''

  const { system, userMessage } = buildScenesPrompt({
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    era: worldBible.era,
    regionDescriptor: worldBible.region,
    narration: story.body,
    minScenes,
    maxScenes,
    peakMoment,
  })

  const inputHash = buildInputHash(SCENES_V1_VERSION, { narration: story.body, channelId: channel.id, minScenes, maxScenes, peakMoment })

  const result = await runStep(
    { reelId, stepName: 'breakdown_scenes', inputHash },
    async () => {
      const llm = await llmCall({
        templateVersion: SCENES_V1_VERSION,
        schema: ScenesOutputSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Validate tiling — repair if scenes don't cover narration gaplessly
      const tilingError = validateSceneTiling(
        story.body,
        llm.data.scenes.map((s) => s.narrationText),
      )

      if (tilingError) {
        const repairLlm = await llmCall({
          templateVersion: SCENES_V1_VERSION,
          schema: ScenesOutputSchema,
          system,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: JSON.stringify(llm.data) },
            {
              role: 'user',
              content: `Scene coverage error: ${tilingError}. Each scene's narrationText must be a verbatim copy-paste from the narration, no ellipsis. Together they must tile the entire narration with no gaps. Return corrected JSON only.`,
            },
          ],
        })
        return { output: repairLlm.data, costCents: llm.costCents + repairLlm.costCents }
      }

      return { output: llm.data, costCents: llm.costCents }
    },
  )

  // Persist scenes (upsert by reel + idx)
  for (const s of result.output.scenes) {
    await db
      .insert(scenes)
      .values({
        reelId,
        idx: s.idx,
        narrationText: s.narrationText,
        visualPrompt: s.imagePrompt,   // content only; style injected in generate_images
        motionPrompt: s.motionPrompt,
        tier: s.tier,
        mood: s.mood,
      })
      .onConflictDoUpdate({
        target: [scenes.reelId, scenes.idx],
        set: {
          narrationText: s.narrationText,
          visualPrompt: s.imagePrompt,
          motionPrompt: s.motionPrompt,
          tier: s.tier,
          mood: s.mood,
        },
      })
  }
}
