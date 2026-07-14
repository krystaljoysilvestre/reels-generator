import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { getDb, reels, stories, scenes, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { ScenesOutputSchema, WorldBibleSchema, StoryBibleSchema, EMPTY_STORY_BIBLE, resolveEntities, reviewSceneBreakdown, MOTION_BUDGET, estimateNarrationSec, retileToNarration, cameraMovePrompt, animatorMotionPrompt, slug } from '@reels/core'
import { buildScenesPrompt, SCENES_V1_VERSION, buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// The breakdown LLM returns the schema's INPUT shape (defaulted fields are still optional pre-parse); this
// is what llmCall hands back as `.data`. Type the best-of-N plumbing against it so mutations line up.
type BreakdownData = z.input<typeof ScenesOutputSchema>

// breakdown_scenes — step 3 (docs/02 §4)
// Scenes emit full contiguous narration substrings [M9].
// Style suffix is NOT in the prompt — injected server-side in generate_images (the system owns the look).

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

  // Story Bible (from analyze_story). null = not analyzed → fail-soft: the director describes entities
  // inline (pre-bible behavior) and we skip the perspective override + unresolved-ref QA.
  const analyzed = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  const storyBible = analyzed ?? EMPTY_STORY_BIBLE

  // Scene count is BEAT-driven, not clock-driven: give the director a length-scaled range
  // (~1 scene / 9-16s) and let the story's dramatic beats decide the exact number within it.
  // The RANGE must scale to how much narration is actually on screen, NOT the channel's nominal target:
  // a 60s-target channel whose story ran long (335 words ≈ 134s) was getting a 3-7 budget built for 60s,
  // so 6 scenes stretched over ~167s → ~28s dead stills. Derive from the estimated spoken length of THIS
  // story (words ÷ 2.5/s, the shared rate), floored at the target so a rare short story still gets enough.
  // The peak line (story.twistAnchor = the LLM's peakMoment) is passed so the climax always gets its own
  // dedicated shot. All bounds stay inside the schema's hard 3-16 range; MAX_SCENE_SEC in scene-qa then
  // hard-caps any single shot's span (repairable) so a long story can't hide a 51s monologue in one frame.
  const seconds = Math.max(channel.targetSeconds ?? 75, estimateNarrationSec(story.body))
  const minScenes = Math.max(3, Math.floor(seconds / 16))
  // Cap the prompt TARGET at 14, two below the schema's hard max of 16 (ScenesOutputSchema). The model
  // occasionally overshoots the ceiling it's given by a scene or two; if that ceiling IS the schema max,
  // the overshoot fails validation and — after llmCall's single repair — throws, failing the whole reel.
  // Leaving two scenes of headroom turns a rare overshoot into a valid breakdown instead of a crash.
  const maxScenes = Math.min(14, Math.max(minScenes + 1, Math.ceil(seconds / 9)))

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
    bibleEntitiesJson: JSON.stringify(storyBible.entities, null, 2),
    // Authoritative perspective only when analysis actually ran; else let the director detect it.
    narratorPerspective: analyzed ? analyzed.continuity.narratorPerspective : undefined,
    directorNotes: storyBible.constraints.directorNotes,
    era: worldBible.era,
    regionDescriptor: worldBible.region,
    nicheDescription: channel.nicheDescription ?? '',
    genreCategory: channel.genreCategory ?? undefined, // LLM-derived bucket; builder keyword-classifies if absent
    narration: story.body,
    minScenes,
    maxScenes,
    peakMoment,
    maxVideoTiers: MOTION_BUDGET, // motion budget → subscription-derived later
    journey: storyBible.continuity.journey, // world-state ground truth (where/who per leg) — obeyed by the director
  })

  // Bible folded into the hash: editing the bible (or re-analysis) re-triggers the breakdown.
  const inputHash = buildInputHash(SCENES_V1_VERSION, { narration: story.body, channelId: channel.id, minScenes, maxScenes, peakMoment, storyBible })

  const result = await runStep(
    { reelId, stepName: 'breakdown_scenes', inputHash },
    async () => {
      const qaInput = (s: BreakdownData['scenes']) => ({
        narration: story.body,
        peakMoment,
        minScenes,
        maxScenes,
        scenes: s.map((x) => ({ narrationText: x.narrationText, imagePrompt: x.imagePrompt, tier: x.tier, location: x.location, primaryEntity: x.primaryEntity ?? null, supportingEntities: x.supportingEntities ?? [], subjectMotion: x.subjectMotion ?? '', sceneIntent: x.sceneIntent ?? null })),
        // Journey-grounded checks (location/cast vs the world-state) — fail-soft: empty journey → skipped.
        bibleEntities: storyBible.entities,
        narratorEntityId: analyzed?.continuity.narratorEntityId ?? null,
        journey: storyBible.continuity.journey,
      })

      // Character-consistency backstop: in a first-person reel the narrator's own body/reflection edges most
      // POV frames, and the LLM often forgets to reference the narrator entity, so they render as a different
      // person each scene. Attach the narrator entity to any shot whose prompt clearly shows their body.
      const narratorId = analyzed?.continuity.narratorEntityId
      const applyNarratorBackstop = (scenes: BreakdownData['scenes']): void => {
        if (!(narratorId && analyzed?.continuity.narratorPerspective === 'first_person')) return
        const BODY_CUE = /\b(hands?|arms?|forearms?|shoulders?|reflection|reflected|(?:her|his|their)\s+(?:face|body|head))\b/i
        const narratorSlug = slug(narratorId)
        for (const s of scenes) {
          const refs = [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])].map(slug)
          if (refs.includes(narratorSlug)) continue
          if (BODY_CUE.test(s.imagePrompt)) s.supportingEntities = [...(s.supportingEntities ?? []), narratorId]
        }
      }

      // Deterministic tiling guarantee (see retileToNarration): snap each scene to the exact narration
      // substring so the set tiles gaplessly + verbatim; a dropped span folds into the preceding scene.
      // Returns false only when the scenes can't be aligned at all → raw LLM text kept (likely a residual gap).
      const applyRetile = (scenes: BreakdownData['scenes']): boolean => {
        const retiled = retileToNarration(story.body, scenes.map((s) => s.narrationText))
        if (!retiled) return false
        scenes.forEach((s, i) => { s.narrationText = retiled[i]! })
        return true
      }

      // Best-of-N. The breakdown is only correct if it (a) tiles the WHOLE narration — a gap is fatal, as
      // compute_timings throws on any uncovered span — AND (b) keeps every shot under the duration limit.
      // Both used to be best-effort (one repair, then persist regardless), which let fatal gaps and 28s
      // "visually dead" shots through — a bigger risk now that we cut more, shorter scenes. So we roll up to
      // N times, score each AFTER the deterministic retile (tiling + duration + structural QA), feed the
      // failures back to the next roll, and keep the BEST. Most reels pass on the first roll and break out.
      const MAX_ATTEMPTS = 3
      let cost = peakCost
      let best: { output: BreakdownData; violations: number; notes: string[] } | null = null
      let prev: BreakdownData | null = null
      let prevErrors: string[] = []

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const messages: { role: 'user' | 'assistant'; content: string }[] = attempt === 0 || !prev
          ? [{ role: 'user', content: userMessage }]
          : [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: JSON.stringify(prev) },
              { role: 'user', content: `Fix these issues, then return the corrected JSON only:\n- ${prevErrors.join('\n- ')}\nEvery narrationText must be a VERBATIM copy-paste from the narration (no ellipsis, no paraphrase); together they must tile the ENTIRE narration with no gaps or overlaps. Keep every scene under ~16 seconds (~40 words). Stay within ${minScenes}–${maxScenes} scenes — never exceed ${maxScenes}.` },
            ]
        // Up to 16 scenes, each with a 45-75 word imagePrompt, overruns the 4096 default → truncated JSON.
        const llm = await llmCall({ templateVersion: SCENES_V1_VERSION, schema: ScenesOutputSchema, system, messages, maxTokens: 8192 })
        cost += llm.costCents
        const output = llm.data

        applyNarratorBackstop(output.scenes)
        const tiled = applyRetile(output.scenes)

        const tilingError = validateSceneTiling(story.body, output.scenes.map((s) => s.narrationText))
        const qa = reviewSceneBreakdown(qaInput(output.scenes))
        const errors = [...(tilingError ? [tilingError] : []), ...qa.errors]
        // A bailed retile means a probable un-fixable gap → weight it heavily so a tiled roll always wins.
        const violations = errors.length + (tiled ? 0 : 3)
        const unresolvedRefs = analyzed
          ? [...new Set(output.scenes.flatMap((s) => resolveEntities(storyBible, { primaryEntity: s.primaryEntity ?? null, supportingEntities: s.supportingEntities ?? [] }).unresolved))]
          : []
        const notes = [...errors, ...qa.warnings, ...(unresolvedRefs.length ? [`unresolved bible refs: ${unresolvedRefs.join(', ')}`] : [])]

        if (!best || violations < best.violations) best = { output, violations, notes }
        if (violations === 0) break
        prev = output
        prevErrors = errors
      }

      const chosen = best!
      if (chosen.violations > 0) {
        console.warn(`[scene-qa] ${reelId.slice(0, 8)} kept best of ${MAX_ATTEMPTS} rolls (violations=${chosen.violations}):\n  - ${chosen.notes.join('\n  - ')}`)
      } else if (chosen.notes.length > 0) {
        console.warn(`[scene-qa] ${reelId.slice(0, 8)} ${chosen.notes.length} note(s):\n  - ${chosen.notes.join('\n  - ')}`)
      }

      return { output: chosen.output, costCents: cost }
    },
  )

  // Persist scenes (upsert by reel + idx). Renumber idx by array (= narration) order rather than trusting
  // the LLM's idx values: the upsert keys on [reelId, idx], so a duplicate idx from the model would
  // silently overwrite a scene. Post-tiling the array is already in narration order, so i+1 is canonical.
  for (let i = 0; i < result.output.scenes.length; i++) {
    const s = result.output.scenes[i]!
    // Video beats fold in the director's SUBJECT motion (scare/reveal = the threat moves) ahead of the
    // camera move; stills keep a bare camera phrase so render-time parseMotion() recovers their Ken Burns move.
    const motionPrompt = s.tier === 'video'
      ? animatorMotionPrompt(s.cameraMove, s.subjectMotion)
      : cameraMovePrompt(s.cameraMove)
    await db
      .insert(scenes)
      .values({
        reelId,
        idx: i + 1,
        narrationText: s.narrationText,
        visualPrompt: s.imagePrompt,   // content only; style + bible entities injected in generate_images
        visualPromptBase: s.imagePrompt,  // frozen original → "Fresh take" always re-rolls from this
        motionPrompt,
        tier: s.tier,
        isHero: s.tier === 'video', // durable hero designation = the LLM's video pick (tier may change later)
        mood: s.mood,
        location: s.location,
        primaryEntity: s.primaryEntity ?? null,        // bible refs → expanded by assembleImagePrompt (generate_images)
        supportingEntities: s.supportingEntities ?? [],
        sceneIntent: s.sceneIntent ?? null,
      })
      .onConflictDoUpdate({
        target: [scenes.reelId, scenes.idx],
        set: {
          narrationText: s.narrationText,
          visualPrompt: s.imagePrompt,
          visualPromptBase: s.imagePrompt,
          motionPrompt,
          tier: s.tier,
          isHero: s.tier === 'video',
          mood: s.mood,
          location: s.location,
          primaryEntity: s.primaryEntity ?? null,
          supportingEntities: s.supportingEntities ?? [],
          sceneIntent: s.sceneIntent ?? null,
        },
      })
  }
}
