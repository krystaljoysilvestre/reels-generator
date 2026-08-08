import { eq, and, gt, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { getDb, reels, stories, scenes, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { ScenesOutputSchema, WorldBibleSchema, StoryBibleSchema, EMPTY_STORY_BIBLE, resolveEntities, reviewSceneBreakdown, MOTION_BUDGET, motionBudgetForSeconds, estimateNarrationSec, retileToNarration, cameraMovePrompt, animatorMotionPrompt, slug, planChapters, legsForChapter, CHAPTER_THRESHOLD_SEC, channelPlatformPreset, type StoryChapter, type StoryBible, effectiveGenre,} from '@reels/core'
import { buildScenesPrompt, SCENES_V1_VERSION, buildPeakExtractPrompt, PEAK_EXTRACT_V1_VERSION, PeakExtractSchema, resolveMediaGenre, buildSceneDepictionCriticPrompt, SCENE_DEPICTION_CRITIC_V1_VERSION, SceneDepictionVerdictSchema, buildSceneDepictionDoctorPrompt, SCENE_DEPICTION_DOCTOR_V1_VERSION, SceneDepictionRepairSchema } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// ── DEPICTION GATE (judge → targeted repair → re-judge; see scene-depiction-critic.v1) ──────────────
// Default ON for informational media-genre boards (probe evidence: hypotheses/voiceover-perspective.md
// Phase 0 — wallpaper boards, 0/8 claims depicted); SCENE_DEPICTION_GATE=0 is the kill switch. The cap is
// a named const so repair depth is tunable later (cascade failures may warrant more rounds someday).
const SCENE_DEPICTION_GATE_ENABLED = process.env['SCENE_DEPICTION_GATE'] !== '0'
const SCENE_DEPICTION_MAX_REPAIRS = 2

// One scored judge round for the gate's audit trail — structured counts, not bare pass/fail, so
// "2/8 → 7/8 after doctor" is queryable per reel (which channels need the doctor, is it worth its cost).
interface DepictionRound {
  round: number
  sceneCount: number
  depictedCount: number
  interchangeableCount: number
  failedIdxs: number[]
  repairedIdxs: number[]
  revertedIdxs: number[]
  // What the doctor actually rewrote this round (applied repairs only) — production diagnostics: shows
  // the semantic-fidelity change per scene, and gives a true same-board before/after.
  repairs: { idx: number; before: string; after: string }[]
}
type DepictionAudit =
  | { chapter: number; status: 'ok'; criticVersion: string; doctorVersion: string; repairedRounds: number; rounds: DepictionRound[] }
  | { chapter: number; status: 'failed'; error: string }

// The breakdown LLM returns the schema's INPUT shape (defaulted fields are still optional pre-parse); this
// is what llmCall hands back as `.data`. Type the best-of-N plumbing against it so mutations line up.
type BreakdownData = z.input<typeof ScenesOutputSchema>
type BreakdownScenes = BreakdownData['scenes']

// breakdown_scenes — step 3 (docs/02 §4)
// Scenes emit full contiguous narration substrings [M9].
// Style suffix is NOT in the prompt — injected server-side in generate_images (the system owns the look).
//
// Long-form (see specs/long-form.md): a story past CHAPTER_THRESHOLD_SEC is storyboarded per CHAPTER —
// chapters are cut deterministically (planChapters, journey-leg-aligned offsets), each chapter runs the
// same prompt + best-of-N QA loop as a whole short reel, and the scenes are stitched back in narration
// order. Chapters tile the narration by construction, so the M9 tiling invariant survives the seams.

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

// Beat-driven scene-count range for a span of narration (~1 scene / 9-16s): the director picks WITHIN it
// by cutting on dramatic beats. Bounds stay inside the schema's hard 3-16 range; the prompt TARGET is
// capped at 14 (two below the max) so a rare overshoot still validates instead of crashing the reel.
function sceneCountRange(seconds: number): { minScenes: number; maxScenes: number } {
  const minScenes = Math.max(3, Math.floor(seconds / 16))
  const maxScenes = Math.min(14, Math.max(minScenes + 1, Math.ceil(seconds / 9)))
  return { minScenes, maxScenes }
}

// i2v allocation across chapters: 1 each as the floor, +1 to the opening chapter (the video's first
// impression) and +1 to the peak's chapter (the payoff), extras to the longest chapters, all trimmed to
// the duration-scaled global budget. Deterministic — this is a cost lever, not a taste decision.
function allocateVideoTiers(chapters: StoryChapter[], peakChapterIdx: number, globalBudget: number): number[] {
  const alloc = chapters.map(() => 1)
  if (alloc.length > 0) alloc[0]! += 1
  if (peakChapterIdx >= 0 && alloc[peakChapterIdx] !== undefined) alloc[peakChapterIdx]! += 1
  // Over budget → peel the bonuses first (opening before peak), then the floor from the tail.
  const sum = () => alloc.reduce((a, b) => a + b, 0)
  if (sum() > globalBudget && alloc.length > 0 && alloc[0]! > 1) alloc[0]! -= 1
  if (sum() > globalBudget && peakChapterIdx >= 0 && (alloc[peakChapterIdx] ?? 0) > 1) alloc[peakChapterIdx]! -= 1
  for (let i = alloc.length - 1; sum() > globalBudget && i >= 0; i--) {
    if (alloc[i]! > 0) alloc[i]! -= 1
  }
  // Under budget → spend the remainder on the longest chapters (most narration = most beats to animate).
  const byLength = chapters
    .map((c, i) => ({ i, sec: c.estSec }))
    .sort((a, b) => b.sec - a.sec || a.i - b.i)
  for (let k = 0; sum() < globalBudget && k < byLength.length * 4; k++) {
    alloc[byLength[k % byLength.length]!.i]! += 1
  }
  return alloc
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
  const platformPreset = channelPlatformPreset(channel)

  // Story Bible (from analyze_story). null = not analyzed → fail-soft: the director describes entities
  // inline (pre-bible behavior) and we skip the perspective override + unresolved-ref QA.
  const analyzed = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  const storyBible: StoryBible = analyzed ?? EMPTY_STORY_BIBLE

  // The RANGE must scale to how much narration is actually on screen, NOT the channel's nominal target:
  // derive from the estimated spoken length of THIS story (words ÷ 2.5/s, the shared rate), floored at
  // the target so a rare short story still gets enough. MAX_SCENE_SEC in scene-qa then hard-caps any
  // single shot's span (repairable) so a long story can't hide a 51s monologue in one frame.
  const seconds = Math.max(channel.targetSeconds ?? 75, estimateNarrationSec(story.body))

  // Past the single-call comfort zone the story is storyboarded per chapter; each chapter's scene range
  // comes from ITS OWN narration length. planChapters returns one whole-story chapter for short reels.
  const chaptered = estimateNarrationSec(story.body) > CHAPTER_THRESHOLD_SEC
  const chapters: StoryChapter[] = chaptered
    ? planChapters(story.body, storyBible.continuity.journey)
    : [{ idx: 1, text: story.body, startOffset: 0, endOffset: story.body.length, estSec: seconds }]

  // Peak line drives the climax scene (here) + the music swell/sting (compute_timings reads twist_anchor).
  // Generated stories carry it; BYO/legacy stories don't, so extract one and persist it so BOTH consumers
  // benefit.
  //
  // This runs BEFORE runStep because peakMoment feeds the step's inputHash — so it gets neither of the
  // harness's protections and has to provide them itself:
  //   · Idempotency, via twist_anchor as a three-state marker: null = never extracted, '' = extracted and
  //     the result was unusable, non-empty = the anchor. Persisting '' is what stops a retry re-paying —
  //     the old `!peakMoment` test re-ran the LLM on every attempt for any story whose candidate wasn't a
  //     verbatim substring, and runStep then reported the step skipped with costCents 0.
  //   · Cost capture, via an atomic increment the moment it's paid, so it lands exactly once whether the
  //     step below runs, skips, or throws (the old `cost.add(peakCost)` inside the step dropped it on skip).
  let peakMoment = story.twistAnchor?.trim() ?? ''
  if (story.twistAnchor === null) {
    const peak = buildPeakExtractPrompt(story.body)
    const peakLlm = await llmCall({
      templateVersion: PEAK_EXTRACT_V1_VERSION,
      schema: PeakExtractSchema,
      system: peak.system,
      messages: [{ role: 'user', content: peak.userMessage }],
    })
    if (peakLlm.costCents > 0) {
      await db
        .update(reels)
        .set({ costCents: sql`${reels.costCents} + ${peakLlm.costCents}`, updatedAt: new Date() })
        .where(eq(reels.id, reelId))
    }
    const candidate = peakLlm.data.peakMoment.trim()
    // Trust it only if it's a real verbatim substring (the schema can't enforce that); else store '' and
    // the climax/music fall back to their soft defaults rather than anchoring to a hallucinated line.
    const usable = candidate && story.body.includes(candidate) ? candidate : ''
    peakMoment = usable
    await db.update(stories).set({ twistAnchor: usable }).where(eq(stories.id, story.id))
  }

  const peakChapterIdx = peakMoment ? chapters.findIndex((c) => c.text.includes(peakMoment)) : -1
  const globalBudget = chaptered ? motionBudgetForSeconds(seconds) : MOTION_BUDGET
  const videoAlloc = chaptered ? allocateVideoTiers(chapters, peakChapterIdx, globalBudget) : [MOTION_BUDGET]

  // Media/register genre: EBN → informational (a documentary register), not the empty `general` bucket.
  // Hoisted (was inline in the prompt vars): also gates the depiction gate below.
  // Genre is per-REEL since series — read the frozen value (specs/channel-series.md).
  const mediaGenre = resolveMediaGenre({ storyMode: channel.storyMode, genreCategory: effectiveGenre(reel, channel), niche: channel.nicheDescription })
  const depictionGateApplies = SCENE_DEPICTION_GATE_ENABLED && mediaGenre === 'informational'

  // Bible folded into the hash: editing the bible (or re-analysis) re-triggers the breakdown. The chapter
  // plan + budget are part of the recipe — a re-cut story re-runs even at the same prompt version.
  const inputHash = buildInputHash(SCENES_V1_VERSION, {
    narration: story.body,
    channelId: channel.id,
    peakMoment,
    storyBible,
    chapters: chapters.map((c) => `${c.startOffset}-${c.endOffset}`).join('|'),
    videoAlloc: videoAlloc.join(','),
    // Only perturb the cache key when the depiction gate applies — non-informational genres keep their
    // existing hashes (no mass re-run); toggling the gate produces distinct keys. (Plan-gate pattern.)
    ...(depictionGateApplies
      ? { depictionCriticVersion: SCENE_DEPICTION_CRITIC_V1_VERSION, depictionDoctorVersion: SCENE_DEPICTION_DOCTOR_V1_VERSION }
      : {}),
  })

  const result = await runStep(
    { reelId, stepName: 'breakdown_scenes', inputHash },
    async (cost) => {
      // Depiction-gate audit trail, one entry per chapter — attached to the step output (planGate pattern).
      const depictionAudits: DepictionAudit[] = []

      // Character-consistency backstop: in a first-person reel the narrator's own body/reflection edges most
      // POV frames, and the LLM often forgets to reference the narrator entity, so they render as a different
      // person each scene. Attach the narrator entity to any shot whose prompt clearly shows their body.
      const narratorId = analyzed?.continuity.narratorEntityId
      const applyNarratorBackstop = (chapterScenes: BreakdownScenes): void => {
        if (!(narratorId && analyzed?.continuity.narratorPerspective === 'first_person')) return
        const BODY_CUE = /\b(hands?|arms?|forearms?|shoulders?|reflection|reflected|(?:her|his|their)\s+(?:face|body|head))\b/i
        const narratorSlug = slug(narratorId)
        for (const s of chapterScenes) {
          const refs = [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])].map(slug)
          if (refs.includes(narratorSlug)) continue
          if (BODY_CUE.test(s.imagePrompt)) s.supportingEntities = [...(s.supportingEntities ?? []), narratorId]
        }
      }

      // One chapter's breakdown: the same best-of-N roll → deterministic retile → structural QA loop a
      // whole short reel gets, scoped to the chapter's narration. Returns the best roll's scenes + notes.
      const rollChapter = async (chapter: StoryChapter, prevChapterScenes: BreakdownScenes | null): Promise<BreakdownScenes> => {
        const { minScenes, maxScenes } = sceneCountRange(chapter.estSec)
        const chapterPeak = peakMoment && chapter.text.includes(peakMoment) ? peakMoment : ''
        const maxVideoTiers = videoAlloc[chapter.idx - 1] ?? 1
        const prevScene = prevChapterScenes?.[prevChapterScenes.length - 1]

        const { system, userMessage } = buildScenesPrompt({
          bibleEntitiesJson: JSON.stringify(storyBible.entities, null, 2),
          // Authoritative perspective only when analysis actually ran; else let the director detect it.
          narratorPerspective: analyzed ? analyzed.continuity.narratorPerspective : undefined,
          directorNotes: storyBible.constraints.directorNotes,
          era: worldBible.era,
          regionDescriptor: worldBible.region,
          nicheDescription: channel.nicheDescription ?? '',
          // Media/register genre: EBN → informational (a documentary register), not the empty `general`
          // bucket. Identical to the old resolution for standard channels. (Hoisted: resolveMediaGenre.)
          genreCategory: mediaGenre,
          aspect: platformPreset.aspect,
          narration: chapter.text,
          minScenes,
          maxScenes,
          peakMoment: chapterPeak,
          maxVideoTiers,
          // World-state ground truth (where/who per leg), narrowed to the legs this chapter touches.
          journey: chaptered
            ? legsForChapter(story.body, storyBible.continuity.journey, chapter)
            : storyBible.continuity.journey,
          ...(chaptered
            ? {
                chapter: {
                  idx: chapter.idx,
                  count: chapters.length,
                  logline: story.logline ?? '',
                  prevLocation: prevScene?.location ?? '',
                  prevNarration: prevScene ? prevScene.narrationText.trim().slice(-160) : '',
                },
              }
            : {}),
        })

        const qaInput = (s: BreakdownScenes) => ({
          narration: chapter.text,
          fullNarration: story.body,
          peakMoment: chapterPeak,
          minScenes,
          maxScenes,
          maxVideoTiers,
          isOpening: chapter.idx === 1,
          scenes: s.map((x) => ({ narrationText: x.narrationText, imagePrompt: x.imagePrompt, tier: x.tier, location: x.location, primaryEntity: x.primaryEntity ?? null, supportingEntities: x.supportingEntities ?? [], subjectMotion: x.subjectMotion ?? '', sceneIntent: x.sceneIntent ?? null })),
          // Journey-grounded checks (location/cast vs the world-state) — fail-soft: empty journey → skipped.
          bibleEntities: storyBible.entities,
          narratorEntityId: analyzed?.continuity.narratorEntityId ?? null,
          journey: storyBible.continuity.journey,
          // Arms the voiceover no-host/no-POV check (errors → repair round). Absent when unanalyzed.
          narratorPerspective: analyzed?.continuity.narratorPerspective,
        })

        // Deterministic tiling guarantee (see retileToNarration): snap each scene to the exact narration
        // substring so the set tiles gaplessly + verbatim; a dropped span folds into the preceding scene.
        // Returns false only when the scenes can't be aligned at all → raw LLM text kept (likely a residual gap).
        const applyRetile = (chapterScenes: BreakdownScenes): boolean => {
          const retiled = retileToNarration(chapter.text, chapterScenes.map((s) => s.narrationText))
          if (!retiled) return false
          chapterScenes.forEach((s, i) => { s.narrationText = retiled[i]! })
          return true
        }

        // Best-of-N. The breakdown is only correct if it (a) tiles the WHOLE span — a gap is fatal, as
        // compute_timings throws on any uncovered span — AND (b) keeps every shot under the duration limit.
        // Roll up to N times, score each AFTER the deterministic retile, feed the failures back to the next
        // roll, and keep the BEST. Most chapters pass on the first roll and break out.
        const MAX_ATTEMPTS = 3
        let best: { scenes: BreakdownScenes; violations: number; notes: string[] } | null = null
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
          cost.add(llm.costCents)
          const output = llm.data

          applyNarratorBackstop(output.scenes)
          const tiled = applyRetile(output.scenes)

          const tilingError = validateSceneTiling(chapter.text, output.scenes.map((s) => s.narrationText))
          const qa = reviewSceneBreakdown(qaInput(output.scenes))
          const errors = [...(tilingError ? [tilingError] : []), ...qa.errors]
          // A bailed retile means a probable un-fixable gap → weight it heavily so a tiled roll always wins.
          const violations = errors.length + (tiled ? 0 : 3)
          const unresolvedRefs = analyzed
            ? [...new Set(output.scenes.flatMap((s) => resolveEntities(storyBible, { primaryEntity: s.primaryEntity ?? null, supportingEntities: s.supportingEntities ?? [] }).unresolved))]
            : []
          const notes = [...errors, ...qa.warnings, ...(unresolvedRefs.length ? [`unresolved bible refs: ${unresolvedRefs.join(', ')}`] : [])]

          if (!best || violations < best.violations) best = { scenes: output.scenes, violations, notes }
          if (violations === 0) break
          prev = output
          prevErrors = errors
        }

        const chosen = best!
        const tag = chaptered ? ` ch${chapter.idx}/${chapters.length}` : ''
        if (chosen.violations > 0) {
          console.warn(`[scene-qa] ${reelId.slice(0, 8)}${tag} kept best of ${MAX_ATTEMPTS} rolls (violations=${chosen.violations}):\n  - ${chosen.notes.join('\n  - ')}`)
        } else if (chosen.notes.length > 0) {
          console.warn(`[scene-qa] ${reelId.slice(0, 8)}${tag} ${chosen.notes.length} note(s):\n  - ${chosen.notes.join('\n  - ')}`)
        }

        // ── DEPICTION GATE: judge → targeted repair → re-judge (informational boards) ──────────────
        // Each shot must depict its span's load-bearing claim (not wallpaper). The doctor repairs ONLY
        // failing imagePrompts — tiling/entities/tier untouched — and a deterministic-QA guard reverts any
        // repair that introduces new scene-qa errors. Fail-safe: any error keeps the pre-gate board.
        if (depictionGateApplies) {
          try {
            const judge = async (sc: BreakdownScenes) => {
              const p = buildSceneDepictionCriticPrompt({
                nicheDescription: channel.nicheDescription ?? '',
                genreCategory: mediaGenre,
                narratorPerspective: analyzed?.continuity.narratorPerspective,
                scenes: sc.map((s, i) => ({ idx: i + 1, narrationText: s.narrationText, imagePrompt: s.imagePrompt, tier: s.tier })),
              })
              const res = await llmCall({
                templateVersion: SCENE_DEPICTION_CRITIC_V1_VERSION,
                schema: SceneDepictionVerdictSchema,
                system: p.system,
                messages: [{ role: 'user', content: p.userMessage }],
                provider: 'anthropic',
                maxTokens: 3000,
              })
              cost.add(res.costCents)
              return res.data.scenes
            }
            const rounds: DepictionRound[] = []
            const scoreRound = (verdicts: Awaited<ReturnType<typeof judge>>, repairedIdxs: number[], revertedIdxs: number[], repairs: { idx: number; before: string; after: string }[]) => {
              rounds.push({
                round: rounds.length + 1,
                sceneCount: chosen.scenes.length,
                depictedCount: verdicts.filter((x) => x.depicted).length,
                interchangeableCount: verdicts.filter((x) => x.interchangeable).length,
                failedIdxs: verdicts.filter((x) => !x.depicted).map((x) => x.idx),
                repairedIdxs,
                revertedIdxs,
                repairs,
              })
            }
            let verdicts = await judge(chosen.scenes)
            scoreRound(verdicts, [], [], [])
            let repairedRounds = 0
            while (verdicts.some((x) => !x.depicted) && repairedRounds < SCENE_DEPICTION_MAX_REPAIRS) {
              repairedRounds++
              const failing = verdicts
                .filter((x) => !x.depicted)
                .flatMap((x) => {
                  const s = chosen.scenes[x.idx - 1]
                  return s ? [{ idx: x.idx, narrationText: s.narrationText, imagePrompt: s.imagePrompt, reason: x.reason || `does not depict: ${x.claim}`, primaryEntity: s.primaryEntity ?? null }] : []
                })
              if (failing.length === 0) break
              const dp = buildSceneDepictionDoctorPrompt({
                nicheDescription: channel.nicheDescription ?? '',
                genreCategory: mediaGenre,
                narratorPerspective: analyzed?.continuity.narratorPerspective,
                scenes: failing,
              })
              const doc = await llmCall({
                templateVersion: SCENE_DEPICTION_DOCTOR_V1_VERSION,
                schema: SceneDepictionRepairSchema,
                system: dp.system,
                messages: [{ role: 'user', content: dp.userMessage }],
                provider: 'anthropic',
                maxTokens: 4096,
              })
              cost.add(doc.costCents)
              // Merge with the revert guard: a repair that introduces NEW deterministic errors (e.g. a
              // changed lead breaking the primary↔lead invariant) is rolled back, not shipped.
              const baselineErrors = reviewSceneBreakdown(qaInput(chosen.scenes)).errors.length
              const repairedIdxs: number[] = []
              const revertedIdxs: number[] = []
              const repairs: { idx: number; before: string; after: string }[] = []
              for (const r of doc.data.repairs) {
                const target = chosen.scenes[r.idx - 1]
                if (!target || !failing.some((f) => f.idx === r.idx)) continue // the doctor may only touch what it was handed
                const prevPrompt = target.imagePrompt
                target.imagePrompt = r.imagePrompt
                if (reviewSceneBreakdown(qaInput(chosen.scenes)).errors.length > baselineErrors) {
                  target.imagePrompt = prevPrompt
                  revertedIdxs.push(r.idx)
                } else {
                  repairedIdxs.push(r.idx)
                  repairs.push({ idx: r.idx, before: prevPrompt, after: r.imagePrompt })
                }
              }
              verdicts = await judge(chosen.scenes)
              scoreRound(verdicts, repairedIdxs, revertedIdxs, repairs)
            }
            depictionAudits.push({ chapter: chapter.idx, status: 'ok', criticVersion: SCENE_DEPICTION_CRITIC_V1_VERSION, doctorVersion: SCENE_DEPICTION_DOCTOR_V1_VERSION, repairedRounds, rounds })
            const first = rounds[0]!
            const last = rounds[rounds.length - 1]!
            console.log(`[depiction-gate] ${reelId.slice(0, 8)}${tag} depicted ${first.depictedCount}/${first.sceneCount} → ${last.depictedCount}/${last.sceneCount} (${repairedRounds} repair round${repairedRounds === 1 ? '' : 's'})`)
          } catch (err) {
            // Never fail the step over the gate — the pre-gate board ships, exactly as if this were off.
            console.warn(`[depiction-gate] ${reelId.slice(0, 8)}${tag} failed, keeping the pre-gate board: ${String(err)}`)
            depictionAudits.push({ chapter: chapter.idx, status: 'failed', error: String(err) })
          }
        }

        return chosen.scenes
      }

      // Chapters run SEQUENTIALLY (each seam needs the previous chapter's closing world-state), then the
      // scenes stitch in narration order. Chapter spans tile the narration, so the stitched set does too.
      const stitched: BreakdownScenes = []
      let prevChapterScenes: BreakdownScenes | null = null
      for (const chapter of chapters) {
        const chapterScenes = await rollChapter(chapter, prevChapterScenes)
        stitched.push(...chapterScenes)
        prevChapterScenes = chapterScenes
      }

      // Global backstops across the seams (single-call path: both no-op by construction).
      const globalTiling = validateSceneTiling(story.body, stitched.map((s) => s.narrationText))
      if (globalTiling) console.warn(`[scene-qa] ${reelId.slice(0, 8)} stitched tiling issue: ${globalTiling}`)
      // The per-chapter allocation already bounds each chapter; enforce the global i2v ceiling anyway —
      // demote from the END (the opening + peak chapters sit earliest/are protected by allocation), but
      // spare the FINAL scene until last: it holds the outro beat after the voice stops (compute-timings
      // §4.65), so it's the one shot most in need of motion. Demoting it first is how reels ended on a
      // dead still frame. Order: end→front skipping the last scene, then the last scene if still over.
      let videoCount = stitched.filter((s) => s.tier === 'video').length
      const lastIdx = stitched.length - 1
      const demote = (i: number): void => {
        const s = stitched[i]!
        if (s.tier === 'video' && !(peakMoment && s.narrationText.includes(peakMoment))) {
          s.tier = 'still'
          videoCount--
        }
      }
      for (let i = lastIdx - 1; videoCount > globalBudget && i >= 0; i--) demote(i)
      if (videoCount > globalBudget && lastIdx >= 0) demote(lastIdx)

      // The depiction-gate audit rides the step output (planGate pattern) — structured scores per round,
      // so gate cost-benefit is queryable later without re-running anything.
      const output: BreakdownData & { depictionGate?: DepictionAudit[] } = { scenes: stitched }
      if (depictionAudits.length > 0) output.depictionGate = depictionAudits
      return { output, costCents: cost.total }
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
          // A re-breakdown (regenerate) reuses the (reelId, idx) row; drop the render-derived state ONLY
          // when this scene's content actually changed, so generate_images/animate_scenes don't composite
          // the OLD story's image/clip under the NEW narration. `IS DISTINCT FROM` unchanged content →
          // keep the asset (no needless re-pay); changed → NULL it so the pending filter regenerates.
          imageAssetId: sql`CASE WHEN ${scenes.visualPrompt} IS DISTINCT FROM ${s.imagePrompt} OR ${scenes.narrationText} IS DISTINCT FROM ${s.narrationText} THEN NULL ELSE ${scenes.imageAssetId} END`,
          videoAssetId: sql`CASE WHEN ${scenes.visualPrompt} IS DISTINCT FROM ${s.imagePrompt} OR ${scenes.motionPrompt} IS DISTINCT FROM ${motionPrompt} THEN NULL ELSE ${scenes.videoAssetId} END`,
        },
      })
  }

  // Drop any trailing scenes a PRIOR, longer breakdown left behind: the loop only upserts idx 1..N, so a
  // shorter re-breakdown would otherwise leave stale high-idx rows that compute_timings folds into the
  // master clock (their narration is absent from the new story) — corrupting timings or rendering a ghost beat.
  const sceneCount = result.output.scenes.length
  await db.delete(scenes).where(and(eq(scenes.reelId, reelId), gt(scenes.idx, sceneCount)))
}
