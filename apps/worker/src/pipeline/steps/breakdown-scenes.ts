import { eq } from 'drizzle-orm'
import { getDb, reels, stories, scenes, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { ScenesOutputSchema, WorldBibleSchema, reviewSceneBreakdown } from '@reels/core'
import { buildScenesPrompt, SCENES_V1_VERSION, buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema } from '../../prompts-bridge.js'
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

  // Peak line drives the climax scene (here) + the music swell/sting (compute_timings reads twist_anchor).
  // Generated stories carry it; BYO/legacy stories don't, so extract one and persist it so BOTH consumers
  // benefit. Idempotent: once twist_anchor is set, a re-run skips this and the breakdown hash stays stable.
  let peakMoment = story.twistAnchor?.trim() ?? ''
  let peakCost = 0
  if (!peakMoment) {
    const peak = buildPeakExtractPrompt(story.body)
    const peakLlm = await llmCall({
      templateVersion: PEAK_EXTRACT_V1_VERSION,
      schema: PeakExtractSchema,
      system: peak.system,
      messages: [{ role: 'user', content: peak.userMessage }],
    })
    peakCost = peakLlm.costCents
    const candidate = peakLlm.data.peakMoment.trim()
    // Trust it only if it's a real verbatim substring (the schema can't enforce that); else leave empty
    // and the climax/music fall back to their soft defaults rather than anchoring to a hallucinated line.
    if (candidate && story.body.includes(candidate)) {
      peakMoment = candidate
      await db.update(stories).set({ twistAnchor: candidate }).where(eq(stories.id, story.id))
    }
  }

  const { system, userMessage } = buildScenesPrompt({
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    era: worldBible.era,
    regionDescriptor: worldBible.region,
    nicheDescription: channel.nicheDescription ?? '',
    genreCategory: channel.genreCategory ?? undefined, // LLM-derived bucket; builder keyword-classifies if absent
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

      // QA the breakdown. Two severities: tiling errors (gaps/coverage) + structural QA errors (peak
      // split, too many video tiers) earn ONE LLM repair round; warnings (image-prompt hygiene, soft
      // misses) are logged for observability, never block.
      const qaInput = (s: typeof llm.data.scenes) => ({
        narration: story.body,
        peakMoment,
        minScenes,
        maxScenes,
        scenes: s.map((x) => ({ narrationText: x.narrationText, imagePrompt: x.imagePrompt, tier: x.tier, location: x.location })),
      })
      const tilingError = validateSceneTiling(story.body, llm.data.scenes.map((s) => s.narrationText))
      const qa = reviewSceneBreakdown(qaInput(llm.data.scenes))
      const errors = [tilingError, ...qa.errors].filter((e): e is string => Boolean(e))

      let final = llm.data
      let cost = llm.costCents
      if (errors.length > 0) {
        const repairLlm = await llmCall({
          templateVersion: SCENES_V1_VERSION,
          schema: ScenesOutputSchema,
          system,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: JSON.stringify(llm.data) },
            {
              role: 'user',
              content: `Fix these issues with the scene breakdown, then return the corrected JSON only:\n- ${errors.join('\n- ')}\nEvery narrationText must be a verbatim copy-paste from the narration (no ellipsis); together they must tile the entire narration with no gaps or overlaps.`,
            },
          ],
        })
        final = repairLlm.data
        cost += repairLlm.costCents
      }

      // Log residual notes (post-repair) so real failures accumulate without blocking the render.
      const residualTiling = validateSceneTiling(story.body, final.scenes.map((s) => s.narrationText))
      const finalQa = reviewSceneBreakdown(qaInput(final.scenes))
      const notes = [...(residualTiling ? [residualTiling] : []), ...finalQa.errors, ...finalQa.warnings]
      if (notes.length > 0) {
        console.warn(`[scene-qa] ${reelId.slice(0, 8)} ${notes.length} note(s):\n  - ${notes.join('\n  - ')}`)
      }

      return { output: final, costCents: cost + peakCost }
    },
  )

  // Persist scenes (upsert by reel + idx). Renumber idx by array (= narration) order rather than trusting
  // the LLM's idx values: the upsert keys on [reelId, idx], so a duplicate idx from the model would
  // silently overwrite a scene. Post-tiling the array is already in narration order, so i+1 is canonical.
  for (let i = 0; i < result.output.scenes.length; i++) {
    const s = result.output.scenes[i]!
    await db
      .insert(scenes)
      .values({
        reelId,
        idx: i + 1,
        narrationText: s.narrationText,
        visualPrompt: s.imagePrompt,   // content only; style injected in generate_images
        motionPrompt: s.motionPrompt,
        tier: s.tier,
        isHero: s.tier === 'video', // durable hero designation = the LLM's video pick (tier may change later)
        mood: s.mood,
        location: s.location,
      })
      .onConflictDoUpdate({
        target: [scenes.reelId, scenes.idx],
        set: {
          narrationText: s.narrationText,
          visualPrompt: s.imagePrompt,
          motionPrompt: s.motionPrompt,
          tier: s.tier,
          isHero: s.tier === 'video',
          mood: s.mood,
          location: s.location,
        },
      })
  }
}
