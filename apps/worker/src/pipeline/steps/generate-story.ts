import { randomUUID } from 'node:crypto'
import { eq, ne, and, gte, desc, count } from 'drizzle-orm'
import { getDb, channels, stories, reels, rejections, pipelineSteps } from '@reels/db'
import { llmCall, spendFromError } from '@reels/providers'
import {
  StoryOutputSchema,
  WorldBibleSchema,
  ToneConfigSchema,
  channelPlatformPreset,
  outroTailMs,
  effectiveGenre,
  requiresEvidence,
  resolveChannelPolicy,
  assertEvidenceBibleIntegrity,
  assertEbnClaimsIntegrity,
  assertEbnCitationIntegrity,
  ebnClaimBudget,
  ebnLengthCorrection,
  EVIDENCE_INTEGRITY_VERSION,
  type StoryCreativeContext,
  renderStoryCreativeContext,
  renderStorySourceGuards,
  type StoryOutput,
  type SourcePolicy,
} from '@reels/core'
import {
  buildInputHash,
} from '@reels/providers'
import { runEndingRepair, type EndingRepairAudit } from './ending-repair.js'
import {
  // Studio pipeline (story-writer-v2 pivot, 2026-07-15)
  buildStoryWriterPrompt,
  STORY_V2_VERSION,
  defaultAudienceDescriptor,
  buildStoryPlannerPrompt,
  STORY_PLANNER_V1_VERSION,
  StoryPlanSchema,
  type StoryPlan,
  type StoryElements,
  buildStoryEditorPrompt,
  STORY_EDITOR_V1_VERSION,
  StoryEditSchema,
  buildStoryNaturalizerPrompt,
  STORY_NATURALIZER_V1_VERSION,
  StoryNaturalizeSchema,
  buildStoryGatePrompt,
  STORY_CRITIC_V2_VERSION,
  StoryGateSchema,
  enforceStoryGateEssence,
  composeTasteRubric,
  type StoryGateVerdict,
  type StyleInfluence,
  buildStoryPlanCriticPrompt,
  STORY_PLAN_CRITIC_V1_VERSION,
  PlanCriticSchema,
  buildStoryPlanDoctorPrompt,
  STORY_PLAN_DOCTOR_V1_VERSION,
  PlanDoctorSchema,
  buildStoryFinishingJudgePrompt,
  STORY_FINISHING_JUDGE_V1_VERSION,
  FinishingJudgeSchema,
  type FinishingIssue,
  STORY_ENDING_CRITIC_V1_VERSION,
  STORY_ENDING_SURGEON_V1_VERSION,
  STORY_EDIT_VERIFIER_V1_VERSION,
  // Evidence-Based Narrative (EBN) — the factual path (specs/evidence-based-narrative.md).
  buildEbnExtractorPrompt,
  STORY_EBN_EXTRACTOR_V1_VERSION,
  EvidenceBibleSchema,
  type EbnFact,
  buildEbnPlannerPrompt,
  STORY_EBN_PLANNER_V1_VERSION,
  EbnClaimsSchema,
  buildEbnWriterPrompt,
  STORY_EBN_WRITER_V1_VERSION,
  EbnWriterSchema,
  TRUE_CRIME_PERMISSIONS,
  type EbnWriter,
  buildEbnFidelityPrompt,
  STORY_EBN_FIDELITY_V1_VERSION,
  EbnFidelitySchema,
  type EbnFidelityVerdict,
} from '../../prompts-bridge.js'
import {
  selectFewShot,
  formatFewShot,
  buildAvoidList,
  REJECTION_REASON_LABELS,
  selectAngles,
} from '../../assembly-bridge.js'
import { runStep } from '../harness.js'

// The story pipeline: Planner → Genre Writer ×1 → Editor → Naturalizer → binary Gate.
// ~5 LLM calls, ONE full-length prose generation. The Writer is the product.
// (The legacy best-of-6 path was retired 2026-07-16 after the blind premise A/B: the single
// Planner won on freshness/pull, so write-6-and-rank is gone. History is in git if ever needed.)
// Studio recipe version: keys the input hash alongside every stage/asset version.
// v2 (2026-07-17): Naturalizer routed to Claude — the polish probe (probe-taglish-polish.ts) showed
// the gpt-4o naturalizer inert on unnatural Taglish while Claude's gate critiques were native-sharp;
// owner decision. Also: formatting-collapse discard guard.
// v3 (2026-07-18): WRITER routed to Claude — owner decision after the Production Consequence
// Investigation (research/findings/production-consequence-investigation.md): gpt-4o 1/40 vs Claude
// 14/16 at the same gate, and gpt-4o re-suspended consequences even under an explicit DNA+plan+gate
// demand (steerability 0/8). Planner/editor stay on the default prose provider; the planner-failure
// fallback (story.v1) is untouched — rare, and pending the legacy-path decision.
// v4 (2026-09-13): the full creator contract survives every stage, planner failure uses the same
// current writer, and a completed winner carries its own recoverable story identity.
const GENERATE_STORY_STUDIO_VERSION = 'generate_story.studio.v4'
// How many recent stories feed the Planner's premise avoid-list (the mirror-×6 fix).
const RECENT_PREMISES_LIMIT = 15
const WRITER_TEMPERATURE = 1.0
const REWRITE_TEMPERATURE = 0.7 // editor + naturalizer: refinement, not invention

// PLAN-LEVEL JUDGE-AND-FORCE (OPT-IN, 2026-07-20). Between the planner and the writer, a plan gate
// (story-plan-critic.v1) checks the committed idea for structural agency; on a fail a plan doctor
// (story-plan-doctor.v1) REPAIRS the plan (up to PLAN_DOCTOR_MAX_REPAIRS) before the Writer sees it.
// OPT-IN by design: per the ratified universal-vs-cultural craft line, "agency vs. endurance" is a
// channel-DNA choice, never universal — so this runs ONLY when explicitly enabled and NEVER changes
// behavior for a channel that hasn't opted in. Fail-safe: any error keeps the original plan. Validated
// as a probe (apps/worker/scripts/probe-plan-force.ts); the plan doctor converges where a re-roll does
// not. NOTE: this improves the KIND of story (agency); it does not by itself guarantee the final gate —
// the writer can still collapse the turn (a separate landing pass is the follow-up).
// Enable via STORY_PLAN_GATE=1 (single-operator switch for now; a per-channel setting is the proper
// long-term home so channels whose form is endurance are never forced into agency).
const PLAN_DOCTOR_MAX_REPAIRS = 2

// FINISHING QA JUDGE (OPT-IN, 2026-07-20). A DETECTION-only layer: after the winner is settled, a judge
// reads it as a first-time listener and records a per-story punch-list (naturalness/orientation/turn/
// announced-theme/rhythm) that story_review surfaces, so human review is fast + targeted. It NEVER
// edits the story and NEVER gates — the probe showed the JUDGE is reliable but the auto-fixer isn't, so
// fixing stays human-in-the-loop. Fail-safe: any error just records nothing. Enable via STORY_FINISHING_QA=1.

// ENDING REPAIR — the first BOUNDED EDIT (OPT-IN, 2026-08-06). The endings lap shipped detection that
// works, and exposed that we own no way to ACT on it: the gate's rewrite re-rolls the whole chain, because
// regeneration is not revision. This is the answer — critic (locate) → surgeon (generate) → verifier
// (reject only) → splice → re-index, where no model ever returns the narration and the prefix is
// preserved by construction rather than by instruction. See packages/core/src/editing/bounded-edit.ts.
// Runs after the naturalizer and BEFORE the gate, so the gate simply reads the better version.
// Fail-closed everywhere: any invalid region, any verifier rejection, any guard, any error ⇒ the original
// ending ships unchanged. Repair is optional; an incorrect repair is expensive.

type RewriteStatus = 'ok' | 'failed' | 'discarded_wordcount' | 'discarded_peak' | 'discarded_formatting'

// Persisted as pipeline_steps.output (studio mode) — the full attribution trail. Any bad story
// decomposes into inspectable artifacts; this is also the evidence base for the 300-story read.
interface StudioOutput {
  v: 3
  mode: 'studio'
  angleId: string
  prose: { style: string; voice: string; influence: StyleInfluence } // resolved prose dimensions (attribution)
  plannerStatus: 'ok' | 'failed_direct_writer' | 'failed_fell_back_to_v1_draft' // final value is legacy output
  plan: StoryPlan | null // includes whyThisStory + mechanics (audit only — the Writer never saw them)
  // Plan-level judge-and-force audit (only present when STORY_PLAN_GATE is enabled). `verdicts` is the
  // plan gate's pass/reason at each step (original, then each repair); `repaired` = how many doctor
  // passes ran; `originalLogline` preserves what the planner first reached for (the doctored plan is in
  // `plan`). `status:'failed'` = the gate/doctor errored and the ORIGINAL plan shipped (fail-safe).
  planGate?:
    | { status: 'ok'; version: string; doctorVersion: string; verdicts: Array<{ pass: boolean; reason: string }>; repaired: number; originalLogline: string }
    | { status: 'failed'; error: string }
  winner: StoryOutput // FINAL story (post edit + naturalize + peak chain) — the one persisted
  // Identity allocated before the completed step is persisted. A retry can materialize this exact
  // artifact without mistaking the previous rejected story for the newly judged winner.
  winnerStoryId?: string // absent only on output written before studio.v4
  writerRaw: StoryOutput // pre-edit, for the raw-vs-final diff
  editor: { status: RewriteStatus; detail?: string }
  naturalizer: { status: RewriteStatus; detail?: string }
  gate:
    | { status: 'ok'; version: string; verdicts: StoryGateVerdict[]; retried: boolean }
    | { status: 'failed'; error: string }
  // Finishing QA punch-list (only present when STORY_FINISHING_QA is enabled). Detection-only — surfaced
  // to the human at story_review; never edits or gates. `issues` empty ⇒ read clean.
  finishingQA?:
    | { status: 'ok'; version: string; issues: FinishingIssue[]; summary: string }
    | { status: 'failed'; error: string }
  // Bounded-edit audit for the ending (only present when STORY_ENDING_REPAIR is enabled). Every attempt
  // is recorded whether or not it was applied, so "how often does the verifier reject" and "which guard
  // trips" are queryable without re-running anything. `status:'failed'` ⇒ the original ending shipped.
  endingRepair?: EndingRepairAudit
  // Evidence-Based Narrative audit (only present on the EBN factual path). The Evidence Bible itself is
  // persisted on the reel (reels.evidenceBible); this carries the per-story citation map + Fact-Fidelity
  // Checker verdict. `fidelity` is fail-safe like the fiction gate: 'failed' still ships the story to
  // review (the human sees the flags), never silently swallowed.
  ebn?: {
    version: string
    evidenceBibleVersion: number
    factCount: number
    citationMap: Array<{ text: string; claimId: string; factIds: string[] }>
    fidelity:
      | { status: 'ok'; version: string; issues: EbnFidelityVerdict['issues']; summary: string }
      | { status: 'failed'; error: string }
  }
  // FACT GATE (opt-in, STANDARD path — channels.factCheck + a reel dossier). The same Extractor +
  // Fact-Fidelity Checker the EBN path uses, run AFTER a freely-written story instead of before it, so any
  // channel can fact-check its scripts without inheriting EBN's rendering profile. ADVISORY: the verdict
  // rides this output to the story_review punch-list and never blocks. Fail-safe like `ebn.fidelity`.
  factCheck?: {
    fidelity:
      | { status: 'ok'; version: string; factCount: number; issues: EbnFidelityVerdict['issues']; summary: string }
      | { status: 'failed'; error: string }
  }
  peakResolution: 'stage' | 'writer_restored' | 'dropped'
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export function combineEbnStoryReadiness(
  editorialVerdict: StoryGateVerdict,
  checks: {
    fidelityPass: boolean
    fidelityReason: string
    lengthPass: boolean
    lengthReason: string
  },
): StoryGateVerdict {
  return {
    ...editorialVerdict,
    pass: editorialVerdict.pass && checks.fidelityPass && checks.lengthPass,
    reason: !checks.fidelityPass
      ? checks.fidelityReason
      : !checks.lengthPass
        ? checks.lengthReason
        : editorialVerdict.reason,
  }
}

// The peakMoment chain: first candidate that survives as a verbatim substring of the final text.
// Worst case '' → stories.twist_anchor NULL → breakdown-scenes re-extracts via peak-extract.v1
// (already shipped + validated). Never a hallucinated anchor. (Exported for tests.)
// Character-level normalization for peak matching. LLMs asked to echo a line "verbatim" routinely
// vary smart quotes, dash style, internal whitespace, and trailing punctuation; a raw-string match
// then fails and an otherwise-good pass gets discarded over a pointer typo. Normalize both sides.
function normalizeForMatch(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/, '')
    .trim()
    .toLowerCase()
}

export function resolvePeak(narration: string, candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const t = c?.trim()
    if (t && narration.includes(t)) return t
  }
  // Normalized line-level fallback: recover a peak whose only difference is quotes/dashes/spacing/
  // trailing punctuation. Return the ACTUAL narration line so the peak stays a verbatim substring
  // for downstream music timing. A genuinely cut peak differs by whole words → still returns ''.
  const lines = narration.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const c of candidates) {
    const nc = c ? normalizeForMatch(c) : ''
    if (!nc) continue
    const hit = lines.find((l) => normalizeForMatch(l).includes(nc))
    if (hit) return hit
  }
  return ''
}

/** Materialize the exact winner recorded by runStep, including after a commit/link crash. */
async function persistStudioWinner(reelId: string, channelId: string, language: string, output: StudioOutput) {
  const db = getDb()
  await db.transaction(async (tx) => {
    const reel = await tx.query.reels.findFirst({ where: eq(reels.id, reelId) })
    if (!reel || reel.channelId !== channelId) throw new Error('Story recovery could not resolve its owning reel.')
    const linked = reel.storyId
      ? await tx.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
      : null
    if (linked && linked.channelId !== channelId) throw new Error('Story recovery found a linked story owned by another channel.')
    let winnerStoryId = output.winnerStoryId
    if (!winnerStoryId) {
      // Legacy output did not record artifact identity. Adopt only an exact match; a different body
      // could be a human edit or the prior rejected draft, and recovery cannot safely guess which.
      if (linked && (linked.body !== output.winner.narration || linked.title !== output.winner.title || linked.logline !== output.winner.logline)) {
        throw new Error('Story recovery needs review: the linked story differs from the cached winner and this legacy generation did not record its story identity. Both drafts have been preserved.')
      }
      winnerStoryId = linked?.id ?? randomUUID()
      output = { ...output, winnerStoryId }
      await tx.update(pipelineSteps).set({ output }).where(and(
        eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story'),
      ))
    }

    if (linked?.id === winnerStoryId) {
      // Preserve any later creator edits and never regress an advanced reel on job redelivery.
      if (reel.status === 'drafting') {
        await tx.update(reels).set({ status: 'story_review', updatedAt: new Date() }).where(eq(reels.id, reelId))
      }
      return
    }
    if (reel.status !== 'drafting' && reel.status !== 'story_review') {
      throw new Error('Story recovery cannot replace a story after production has advanced. Review the cached winner before retrying.')
    }

    const winner = output.winner
    const existingWinner = await tx.query.stories.findFirst({
      where: eq(stories.id, winnerStoryId), columns: { id: true, channelId: true, title: true, body: true, logline: true },
    })
    if (existingWinner) {
      if (existingWinner.channelId !== channelId || existingWinner.body !== winner.narration || existingWinner.title !== winner.title || existingWinner.logline !== winner.logline) {
        throw new Error('Story recovery found a conflicting winner identity; no story was replaced.')
      }
      const otherReel = await tx.query.reels.findFirst({
        where: and(eq(reels.storyId, winnerStoryId), ne(reels.id, reelId)), columns: { id: true },
      })
      if (otherReel) throw new Error('Story recovery found a winner linked to another reel; no story was replaced.')
    }
    await tx.insert(stories).values({
      id: winnerStoryId,
      channelId,
      source: 'ai',
      origin: 'pipeline',
      language,
      title: winner.title,
      body: winner.narration,
      logline: winner.logline,
      twistAnchor: winner.peakMoment.trim() ? winner.peakMoment : null,
      subgenreTags: winner.subgenreTags,
      elements: { ...(output.plan?.elements ?? {}), narratorVoice: winner.narratorVoice },
    }).onConflictDoNothing({ target: stories.id })
    await tx.update(reels).set({ storyId: winnerStoryId, status: 'story_review', updatedAt: new Date() }).where(eq(reels.id, reelId))
  })
}

export async function generateStory(reelId: string, channelId: string, language: string = 'tagalog') {
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  // The operator's per-reel topic request ("make one about …"), set at reel creation. Optional.
  // dossier: the curated source material for every evidence-required reel; undefined otherwise.
  // genreCategory: the genre FROZEN onto this reel at creation (specs/channel-series.md) — a series
  // reel carries its own, a planner-invented one is null and falls back to the channel's.
  const reelRow = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    columns: { seedIdea: true, dossier: true, genreCategory: true, sourcePolicy: true },
  })
  const operatorSeed = reelRow?.seedIdea?.trim() || undefined
  const dossier = reelRow?.dossier?.trim() || undefined
  const sourcePolicy = resolveChannelPolicy(reelRow, null, channel)
  // Resolve ONCE. Everything below — the outro tail, the writer identity, the gate rubric, the studio
  // cache key — reads this, so a later channel edit can never re-judge a story already written.
  const genre = effectiveGenre(reelRow, channel)

  // ── Few-shot pool ────────────────────────────────────────────────────────
  const refStories = await db.query.stories.findMany({
    where: and(eq(stories.channelId, channelId), eq(stories.isReference, true)),
    orderBy: [desc(stories.performanceScore)],
    limit: 20,
  })

  const fewShot = selectFewShot(
    refStories.map((s) => ({
      title: s.title,
      narration: s.body,
      subgenreTags: s.subgenreTags,
      performanceScore: s.performanceScore,
      createdAt: s.createdAt,
    })),
    [],
    5,
  )

  // ── Avoid list from recent rejections ────────────────────────────────────
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  // Scoped to THIS channel, joining through reels because a rejection only carries a reelId. Unscoped, the
  // avoid-list was built from EVERY tenant's rejections: one channel's operator feedback steered another
  // channel's planner, and unrelated activity anywhere in the app churned this step's cache key. Reason
  // codes are per-channel taste, not a global signal.
  const recentRejections = await db
    .select({ reasonCode: rejections.reasonCode })
    .from(rejections)
    .innerJoin(reels, eq(rejections.reelId, reels.id))
    .where(and(gte(rejections.createdAt, fourteenDaysAgo), eq(reels.channelId, channelId)))

  const rejectionCounts = recentRejections.reduce<Record<string, number>>((acc, r) => {
    acc[r.reasonCode] = (acc[r.reasonCode] ?? 0) + 1
    return acc
  }, {})

  const avoidList = buildAvoidList(
    Object.entries(rejectionCounts).map(([reasonCode, count]) => ({ reasonCode, count })),
  )

  // ── Premise avoid-list: what this channel already told ───────────────────
  // The mirror-×6 fix: the Planner must not reuse recent premises. One cheap query — includes this
  // reel's own rejected drafts (each round inserts a stories row), which is exactly what we want.
  const recentStories = await db.query.stories.findMany({
    where: eq(stories.channelId, channelId),
    orderBy: [desc(stories.createdAt)],
    limit: RECENT_PREMISES_LIMIT,
    columns: { title: true, logline: true, subgenreTags: true, elements: true },
  })
  const recentPremises = recentStories
    .map((s) => `- "${s.title}"${s.logline ? ` — ${s.logline}` : ''}${s.subgenreTags?.length ? ` [${s.subgenreTags.join(', ')}]` : ''}`)
    .join('\n')
  // The story-shape avoid-list (studio): the element labels of recent stories (null for pre-elements
  // / BYO stories — those simply don't participate). Parsed loosely; malformed rows are skipped.
  const recentElements = recentStories
    .map((s) => s.elements)
    .filter((e): e is StoryElements => !!e && typeof e === 'object' && typeof (e as StoryElements).structure === 'string')

  // Total channel story count — the base for the per-reel structure rotation (advances monotonically,
  // so fresh reels don't freeze on angle #0 the way keying on regenerationNonce alone did).
  const [countRow] = await db
    .select({ value: count() })
    .from(stories)
    .where(eq(stories.channelId, channelId))
  const channelStoryCount = countRow?.value ?? 0

  // ── THIS reel's own rejections → per-reel regeneration feedback ───────────
  const reelRejections = await db.query.rejections.findMany({
    where: eq(rejections.reelId, reelId),
    orderBy: [desc(rejections.createdAt)],
  })
  const regenerationNonce = reelRejections.length
  // Structure-rotation offset: base count advances per reel, + nonce varies within a reel's retries.
  const rotationOffset = channelStoryCount + regenerationNonce
  const latestRejection = reelRejections[0]
  const operatorFeedback = latestRejection
    ? [REJECTION_REASON_LABELS[latestRejection.reasonCode] ?? latestRejection.reasonCode, latestRejection.note?.trim()]
        .filter(Boolean)
        .join(' — ')
    : undefined

  // ── Previous round's winning angle → exclude it from this round ───────────
  // runStep OVERWRITES the step row, so read the prior output before calling it.
  const prevStep = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
  })
  const prevOutput = prevStep?.output as Partial<StudioOutput> | null | undefined
  let prevWinnerAngleId: string | undefined
  if (regenerationNonce > 0) {
    if (prevOutput && prevOutput.v === 3 && typeof prevOutput.angleId === 'string') prevWinnerAngleId = prevOutput.angleId
    // (older reels may carry a legacy v:2 output; its angle isn't reused — a fresh angle is fine.)
  }

  // ── Re-entry guard: already generated, and nobody asked for another draft ─────────────────────────
  // The job can be redelivered AFTER this step succeeded (a crash or lost ack between the step finishing
  // and the dispatcher enqueuing the next one). runStep's own cache can't catch that case: the studio hash
  // embeds fast-moving inputs this step's OWN success mutates — persisting the story bumps the channel's
  // story count (rotationOffset → a different angle) and its recent-premise list — so the recomputed hash
  // misses, re-pays the whole ~5-call chain, and inserts a DUPLICATE story. Another draft is only ever
  // requested through the regenerate-story route, which records a rejection BEFORE re-enqueuing; so a
  // completed step with no rejection filed after it means the story on disk IS the story being asked for.
  const doneAt = prevStep?.status === 'done' ? prevStep.finishedAt : null
  const cachedWinner = prevOutput?.winner ?? null
  if (doneAt && cachedWinner && !(latestRejection && latestRejection.createdAt > doneAt)) {
    await persistStudioWinner(reelId, channelId, language, prevOutput as StudioOutput)
    console.log(`[generate_story] ${reelId.slice(0, 8)}: completed winner reconciled, no newer rejection — reusing (no re-pay)`)
    return cachedWinner
  }

  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75 // per-channel reel length (derived per niche)
  // ~2.5 words/sec narration pace, minus the outro beat the reel now holds after the last spoken word
  // (compute-timings §4.65) — so narration + held ending still lands on the channel's target length
  // instead of overrunning it by the tail.
  const spokenSeconds = Math.max(10, targetSeconds - outroTailMs(genre) / 1000)
  const targetWords = Math.round(spokenSeconds * 2.5)
  // A long-form draft (up to ~1500 words of narration + the JSON envelope) overruns the 4096 default
  // and truncates mid-story. ~4 tokens/word is generous headroom (Taglish tokenizes heavier than
  // English); 16384 is gpt-4o's output ceiling.
  const storyMaxTokens = Math.min(16384, Math.max(4096, targetWords * 4))

  const basePromptVars = {
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    toneConfig: JSON.stringify(toneConfig),
    language,
    audienceDescriptor: defaultAudienceDescriptor(language),
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    fewshotStories: formatFewShot(fewShot),
    targetSeconds,
    targetWords,
    rejectionAvoidList: avoidList,
    operatorFeedback,
    regenerationNonce,
  }
  const creativeContext: StoryCreativeContext = {
    genre: genre ?? 'general',
    niche: channel.nicheDescription,
    language,
    audienceDescriptor: basePromptVars.audienceDescriptor,
    targetSeconds,
    narrativeStyle: channel.narrativeStyle || undefined,
    styleInfluence: (['light', 'medium', 'full'] as const).includes(channel.styleInfluence as StyleInfluence)
      ? (channel.styleInfluence as StyleInfluence)
      : 'medium',
    narrativeVoice: channel.narrativeVoice || undefined,
    editorialPrinciples: channel.editorialPrinciples || undefined,
    sourcePolicy,
  }

  const result = await runStudio({
    reelId,
    channel: {
      name: channel.name,
      nicheDescription: channel.nicheDescription,
      tasteRubric: channel.tasteRubric,
      editorialPrinciples: channel.editorialPrinciples,
      genreCategory: genre, // the reel's frozen genre, not the channel column

      narrativeStyle: channel.narrativeStyle,
      narrativeVoice: channel.narrativeVoice,
      styleInfluence: channel.styleInfluence,
      storyMode: channel.storyMode,
      ebnSpecialization: channel.ebnSpecialization,
      factCheck: channel.factCheck ?? false,
      sourcePolicy,
    },
    dossier,
    basePromptVars,
    creativeContext,
    worldBible,
    targetSeconds,
    storyMaxTokens,
    regenerationNonce,
    operatorFeedback,
    operatorSeed,
    platformHookHint: channelPlatformPreset(channel).hookHint,
    prevWinnerAngleId,
    recentPremises,
    recentElements,
    rotationOffset,
    language,
  })

  await persistStudioWinner(reelId, channelId, language, result.output)

  return result.output.winner
}

// ────────────────────────────────────────────────────────────────────────────
// STUDIO MODE — Planner → Genre Writer ×1 → Editor → Naturalizer → binary Gate.
// Cost ~5 calls with ONE full-length prose generation (vs 6 in bestofn): net cheaper than legacy.
// Every stage's artifact persists in the step output (attribution + the 300-story evidence base).
// ────────────────────────────────────────────────────────────────────────────

interface StudioArgs {
  reelId: string
  creativeContext: StoryCreativeContext
  channel: {
    name: string
    nicheDescription: string
    tasteRubric: string | null
    // The channel's own compiled rules (channel.v1). COMPOSES onto the rubric — see composeTasteRubric.
    editorialPrinciples: string | null
    // The RESOLVED genre for THIS reel (effectiveGenre — series' genre if it had one, else the
    // channel's), already frozen before the studio runs. Not the raw channels.genre_category column.
    genreCategory: string | null
    narrativeStyle: string | null
    narrativeVoice: string | null
    styleInfluence: string | null
    // Story MODE is the rendering/specialization axis. Evidence-required standard channels also use
    // the factual narrative chain, but keep their own visual profile downstream.
    storyMode: string | null
    ebnSpecialization: string | null
    // Fact-gate opt-in: check the finished story against this reel's sources (advisory punch-list).
    factCheck: boolean
    // Frozen source policy for THIS reel. Evidence discipline is independent from rendering mode:
    // an evidence-required standard channel uses the source-constrained story chain without inheriting
    // EBN's illustrative visual profile.
    sourcePolicy: SourcePolicy
  }
  // The curated SOURCE material for THIS reel. Evidence-required reels freeze it into an Evidence Bible
  // BEFORE writing. On other standard reels it is optional and only powers the post-hoc fact gate.
  dossier: string | undefined
  basePromptVars: {
    channelName: string
    nicheDescription: string
    toneConfig: string
    language: string
    audienceDescriptor: string
    worldBibleJson: string
    fewshotStories: string
    targetSeconds: number
    targetWords: number
    rejectionAvoidList: string
    operatorFeedback: string | undefined
    regenerationNonce: number
  }
  worldBible: { canonLocations?: string[]; canonObjects?: string[] }
  targetSeconds: number
  storyMaxTokens: number
  regenerationNonce: number
  operatorFeedback: string | undefined
  operatorSeed: string | undefined // per-reel topic request; rides into the planner prompt (and its hash)
  platformHookHint: string | undefined // target platform's first-seconds grammar → the Writer's hook rule
  prevWinnerAngleId: string | undefined
  recentPremises: string
  recentElements: StoryElements[]
  rotationOffset: number // advances per reel → the structure archetype actually varies across reels
  language: string
}

async function runStudio(a: StudioArgs) {
  // Snapshot optional passes once per round, so their runtime behavior and cache version agree.
  const planGateEnabled = process.env.STORY_PLAN_GATE === '1'
  const finishingQaEnabled = process.env.STORY_FINISHING_QA === '1'
  const endingRepairEnabled = process.env.STORY_ENDING_REPAIR === '1'
  // Evidence discipline and rendering profile are separate axes. Any reel whose frozen Source Policy
  // requires evidence uses the dossier → Evidence Bible → cited-writer chain. `storyMode='ebn'` remains
  // a rendering/specialization choice; a standard channel keeps its own visual identity downstream.
  // Fictional and optional-fact-check channels fall through to the existing studio unchanged.
  if (a.channel.storyMode === 'ebn' || requiresEvidence(a.channel.sourcePolicy)) return runEbnStudio(a)

  const v = a.basePromptVars
  const genreCategory = a.channel.genreCategory ?? undefined
  // Base rubric (operator override or the genre default) PLUS the channel's own compiled principles.
  // Composition, not replacement: a channel's house rules add a bar, they never remove the craft one.
  const tasteRubric = composeTasteRubric({
    tasteRubric: a.channel.tasteRubric,
    editorialPrinciples: a.channel.editorialPrinciples,
    genreCategory,
    niche: a.channel.nicheDescription,
  })
  // PROSE dimensions (story-styles / story-voices). '' → pure genre / identity-default voice.
  const narrativeStyle = a.channel.narrativeStyle || undefined
  const narrativeVoice = a.channel.narrativeVoice || undefined
  const styleInfluence = a.creativeContext.styleInfluence ?? 'medium'
  // ONE structural seed per round, rotated by an offset that ADVANCES every reel (rotationOffset =
  // channel story count + nonce), and never the angle the operator just rejected. This is the fix
  // for the fresh-reel sameness: keying on regenerationNonce alone froze every fresh reel to angle #0.
  const angle = selectAngles(1, a.rotationOffset, a.prevWinnerAngleId)[0]!

  const plannerPrompt = buildStoryPlannerPrompt({
    channelName: v.channelName,
    nicheDescription: v.nicheDescription,
    toneConfig: v.toneConfig,
    worldBibleJson: v.worldBibleJson,
    genreCategory,
    narrativeStyle,
    styleInfluence,
    targetSeconds: a.targetSeconds,
    angleDirective: angle.directive,
    operatorSeed: a.operatorSeed,
    avoidList: a.recentPremises,
    rejectionAvoidList: v.rejectionAvoidList,
    operatorFeedback: a.operatorFeedback,
    regenerationNonce: a.regenerationNonce,
    recentElements: a.recentElements,
    sourcePolicy: a.channel.sourcePolicy,
    creativeContext: a.creativeContext,
  })

  // One hash for the whole studio round. Planner prompt text carries the nonce, feedback, and the
  // premise avoid-list; every stage/asset version is explicit so editing any of them re-runs.
  const inputHash = buildInputHash(GENERATE_STORY_STUDIO_VERSION, {
    plannerVersion: STORY_PLANNER_V1_VERSION,
    writerVersion: STORY_V2_VERSION,
    editorVersion: STORY_EDITOR_V1_VERSION,
    naturalizerVersion: STORY_NATURALIZER_V1_VERSION,
    gateVersion: STORY_CRITIC_V2_VERSION,
    plannerSystem: plannerPrompt.system,
    plannerUser: plannerPrompt.userMessage,
    fewshot: v.fewshotStories,
    rubric: tasteRubric,
    angleId: angle.id,
    creativeContext: a.creativeContext,
    // narrativeVoice only shapes the WRITER (not the planner prompt text), so hash it explicitly;
    // style/influence ride in via plannerSystem but are listed for a legible cache key.
    narrativeStyle: narrativeStyle ?? '',
    narrativeVoice: narrativeVoice ?? '',
    styleInfluence,
    // Only perturb the cache key when the plan gate is ON — a channel that hasn't opted in keeps its
    // existing hashes (no mass re-run). When on, the versions make enabling/disabling produce distinct keys.
    ...(planGateEnabled
      ? { planCriticVersion: STORY_PLAN_CRITIC_V1_VERSION, planDoctorVersion: STORY_PLAN_DOCTOR_V1_VERSION }
      : {}),
    ...(finishingQaEnabled ? { finishingJudgeVersion: STORY_FINISHING_JUDGE_V1_VERSION } : {}),
    ...(endingRepairEnabled ? {
      endingCriticVersion: STORY_ENDING_CRITIC_V1_VERSION,
      endingSurgeonVersion: STORY_ENDING_SURGEON_V1_VERSION,
      endingVerifierVersion: STORY_EDIT_VERIFIER_V1_VERSION,
    } : {}),
    // Same discipline for the opt-in fact gate: only channels using it get the extra key material, so
    // everyone else keeps their existing hashes. The dossier itself is hashed — editing the sources
    // re-runs the story round (and therefore the check) instead of serving a stale verdict.
    ...(a.channel.factCheck && a.dossier
      ? {
          evidenceIntegrityVersion: EVIDENCE_INTEGRITY_VERSION,
          factCheckExtractorVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
          factCheckFidelityVersion: STORY_EBN_FIDELITY_V1_VERSION,
          factCheckDossier: a.dossier,
        }
      : {}),
  })

  return runStep<StudioOutput>({ reelId: a.reelId, stepName: 'generate_story', inputHash }, async (cost) => {

    // ── 1. Planner: explore internally, commit to ONE idea ──────────────────
    let plan: StoryPlan | null = null
    let plannerStatus: StudioOutput['plannerStatus'] = 'ok'
    try {
      const planRes = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION,
        schema: StoryPlanSchema,
        system: plannerPrompt.system,
        messages: [{ role: 'user', content: plannerPrompt.userMessage }],
        temperature: 1.0,
        maxTokens: 1500,
      })
      cost.add(planRes.costCents)
      plan = { ...planRes.data, mechanics: planRes.data.mechanics ?? [] }
    } catch (err) {
      cost.add(spendFromError(err))
      // Keep the same writer and full creator brief when planning fails.
      console.warn(`[generate_story] planner failed, writing directly from the creator brief: ${String(err)}`)
      plannerStatus = 'failed_direct_writer'
    }

    // ── 1b. Plan gate + doctor (OPT-IN) — judge the idea for agency, repair on fail ──────────
    // Runs only when opted in and the planner produced a plan. Fail-safe: any error keeps the original
    // plan and records status:'failed'. The doctored plan (writer-visible fields) is merged over the
    // original so elements/mechanics/register carry through unchanged.
    let planGate: StudioOutput['planGate']
    if (planGateEnabled && plan) {
      const originalPlan = plan
      try {
        const judge = async (p: StoryPlan) => {
          const { system, userMessage } = buildStoryPlanCriticPrompt({
            channelName: v.channelName,
            nicheDescription: v.nicheDescription,
            plan: p,
            creativeContext: a.creativeContext,
            sourcePolicy: a.channel.sourcePolicy,
          })
          const res = await llmCall({
            templateVersion: STORY_PLAN_CRITIC_V1_VERSION,
            schema: PlanCriticSchema,
            system,
            messages: [{ role: 'user', content: userMessage }],
            provider: 'anthropic',
            maxTokens: 2048,
          })
          cost.add(res.costCents)
          const d = res.data
          // Effective pass is the conjunction — a top-level pass=true with a failed sub-check does not slip through.
          return { verdict: { pass: d.pass && d.decision.pass && d.chain.pass && d.causedEnding.pass, reason: d.reason } }
        }
        const originalLogline = plan.logline
        const verdicts: Array<{ pass: boolean; reason: string }> = []
        let { verdict } = await judge(plan)
        verdicts.push(verdict)
        let repaired = 0
        while (!verdict.pass && repaired < PLAN_DOCTOR_MAX_REPAIRS) {
          repaired++
          const { system, userMessage } = buildStoryPlanDoctorPrompt({
            channelName: v.channelName,
            nicheDescription: v.nicheDescription,
            targetSeconds: a.targetSeconds,
            plan,
            reason: verdict.reason,
            creativeContext: a.creativeContext,
            sourcePolicy: a.channel.sourcePolicy,
          })
          const docRes = await llmCall({
            templateVersion: STORY_PLAN_DOCTOR_V1_VERSION,
            schema: PlanDoctorSchema,
            system,
            messages: [{ role: 'user', content: userMessage }],
            provider: 'anthropic',
            temperature: REWRITE_TEMPERATURE,
            maxTokens: 1200,
          })
          cost.add(docRes.costCents)
          plan = { ...plan, ...docRes.data } // repair writer-visible fields; keep elements/mechanics/register
          ;({ verdict } = await judge(plan))
          verdicts.push(verdict)
        }
        planGate = {
          status: 'ok',
          version: STORY_PLAN_CRITIC_V1_VERSION,
          doctorVersion: STORY_PLAN_DOCTOR_V1_VERSION,
          verdicts,
          repaired,
          originalLogline,
        }
      } catch (err) {
        cost.add(spendFromError(err))
        plan = originalPlan
        // Never fail the step over the plan gate — the original plan ships, exactly as if this were off.
        console.warn(`[generate_story] plan gate/doctor failed, using the original plan: ${String(err)}`)
        planGate = { status: 'failed', error: String(err) }
      }
    }

    // ── 2. The Genre Writer: ONE excellent prose execution ──────────────────
    const writeOnce = async (qaFeedback?: string): Promise<StoryOutput> => {
      const { system, userMessage } = buildStoryWriterPrompt({
        channelName: v.channelName,
        nicheDescription: v.nicheDescription,
        toneConfig: v.toneConfig,
        language: v.language,
        audienceDescriptor: v.audienceDescriptor,
        worldBibleJson: v.worldBibleJson,
        fewshotStories: v.fewshotStories,
        targetSeconds: v.targetSeconds,
        targetWords: v.targetWords,
        genreCategory,
        narrativeStyle,
        narrativeVoice,
        styleInfluence,
        // Mechanics remain planner metadata; the Writer receives only the committed idea.
        ...(plan ? { plan: {
          premise: plan.premise,
          conflict: plan.conflict,
          escalation: plan.escalation,
          twist: plan.twist,
          ending: plan.ending,
          emotionalDestination: plan.emotionalDestination,
        } } : {}),
        register: plan?.elements.register,
        operatorSeed: a.operatorSeed,
        angleDirective: angle.directive,
        sourcePolicy: a.channel.sourcePolicy,
        creativeContext: a.creativeContext,
        platformHookHint: a.platformHookHint,
        operatorFeedback: a.operatorFeedback,
        regenerationNonce: a.regenerationNonce,
        qaFeedback,
      })
      const res = await llmCall({
        templateVersion: STORY_V2_VERSION,
        schema: StoryOutputSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
        provider: 'anthropic',
        temperature: WRITER_TEMPERATURE,
        maxTokens: a.storyMaxTokens,
      })
      cost.add(res.costCents)
      return { ...res.data, newCanon: res.data.newCanon ?? [] }
    }

    // ── 3+4. Editor (producer) then Naturalizer (finishing) ──────────────────
    // Both are never-fail refinement passes over {narration, peakMoment}: a throw or an
    // out-of-bounds rewrite discards that pass and the input text ships instead.
    const canonicalNames = [...(a.worldBible.canonLocations ?? []), ...(a.worldBible.canonObjects ?? [])]
    const emotionalDestination = plan?.emotionalDestination ?? 'the feeling the niche promises'

    const refine = async (
      stage: 'editor' | 'naturalizer',
      narration: string,
      peakMoment: string,
      tolerance: number,
    ): Promise<{ narration: string; peakMoment: string; status: RewriteStatus; detail?: string }> => {
      try {
        const prompt =
          stage === 'editor'
            ? buildStoryEditorPrompt({
                nicheDescription: v.nicheDescription,
                genreCategory,
                language: v.language,
                audienceDescriptor: v.audienceDescriptor,
                narration,
                peakMoment,
                emotionalDestination,
                canonicalNames,
                targetWords: v.targetWords,
                sourcePolicy: a.channel.sourcePolicy,
                creativeContext: a.creativeContext,
              })
            : buildStoryNaturalizerPrompt({
                language: v.language,
                audienceDescriptor: v.audienceDescriptor,
                narration,
                peakMoment,
                sourcePolicy: a.channel.sourcePolicy,
                creativeContext: a.creativeContext,
              })
        const res = await llmCall({
          templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION,
          schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.userMessage }],
          // NATURALIZER RUNS ON CLAUDE (owner decision 2026-07-17): the language-repair stage needs
          // the model that actually hears the register — the polish probe showed the default model
          // returning unnatural Taglish untouched. Editor stays on the default prose provider.
          ...(stage === 'naturalizer' ? { provider: 'anthropic' as const } : {}),
          temperature: REWRITE_TEMPERATURE,
          maxTokens: a.storyMaxTokens,
        })
        cost.add(res.costCents)
        const inWords = wordCount(narration)
        const outWords = wordCount(res.data.narration)
        if (inWords > 0 && Math.abs(outWords - inWords) / inWords > tolerance) {
          return {
            narration,
            peakMoment,
            status: 'discarded_wordcount',
            detail: `${inWords}→${outWords} words exceeds ±${Math.round(tolerance * 100)}%`,
          }
        }
        // The guard catches a pass that CUT the climax (seen live), not one that merely reworded the
        // peak line or returned a near-miss pointer (a quote/dash/spacing diff) — that false positive
        // discarded a good pass. Keep it if the stage's own peak OR the peak we gave it still resolves
        // (exact or normalized) in the returned narration; store that resolved line as the peak.
        const keptPeak = resolvePeak(res.data.narration, [res.data.peakMoment, peakMoment])
        if (!keptPeak) {
          return { narration, peakMoment, status: 'discarded_peak', detail: 'no peak survived in returned narration' }
        }
        // A pass that collapses the spoken line-per-beat formatting into a paragraph (seen in the
        // polish probe) breaks the read-aloud contract: discard it.
        const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length
        const inLines = beatLines(narration)
        const outLines = beatLines(res.data.narration)
        if (inLines >= 4 && outLines <= Math.ceil(inLines / 2)) {
          return { narration, peakMoment, status: 'discarded_formatting', detail: `${inLines}→${outLines} beat lines — collapsed the spoken formatting` }
        }
        return { narration: res.data.narration, peakMoment: keptPeak, status: 'ok' }
      } catch (err) {
        cost.add(spendFromError(err))
        console.warn(`[generate_story] ${stage} failed, passing text through: ${String(err)}`)
        return { narration, peakMoment, status: 'failed', detail: String(err) }
      }
    }

    // ── 5. Binary gate (Claude): should this ship? ───────────────────────────
    const gateOnce = async (story: { title: string; logline: string }, narration: string) => {
      const prompt = buildStoryGatePrompt({
        channelName: v.channelName,
        nicheDescription: v.nicheDescription,
        language: v.language,
        tasteRubric,
        narration,
        title: story.title,
        logline: story.logline,
        operatorFeedback: a.operatorFeedback,
        sourcePolicy: a.channel.sourcePolicy,
        creativeContext: a.creativeContext,
      })
      const res = await llmCall({
        templateVersion: STORY_CRITIC_V2_VERSION,
        schema: StoryGateSchema,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 768,
      })
      cost.add(res.costCents)
      return enforceStoryGateEssence(res.data)
    }

    // ── 4.5 ENDING REPAIR — the first bounded edit ───────────────────────────
    // critic (locate) → surgeon (generate) → verifier (reject only) → splice → re-index. The
    // orchestration lives in ./ending-repair.ts so the probe that validates it runs THE SAME CODE.
    const repairEnding = (story: { title: string }, narration: string, peakMoment: string) =>
      runEndingRepair({
        title: story.title,
        narration,
        peakMoment,
        genreCategory,
        nicheDescription: v.nicheDescription,
        language: v.language,
        audienceDescriptor: v.audienceDescriptor,
        hookPromise: plan?.hookPromise,
        viewerTransformation: plan?.viewerTransformation,
        creativeContext: a.creativeContext,
        sourcePolicy: a.channel.sourcePolicy,
        onCost: (cents) => cost.add(cents),
        resolvePeak,
      })


    // ── Run the chain (with at most ONE gate-steered rewrite) ────────────────
    let endingRepair: StudioOutput['endingRepair']
    const runChain = async (qaFeedback?: string) => {
      const raw = await writeOnce(qaFeedback)
      const edited = await refine('editor', raw.narration, raw.peakMoment, 0.25) // prompt asks ±15%; guard is looser so borderline passes aren't wasted
      const natural = await refine('naturalizer', edited.narration, edited.peakMoment, 0.15) // prompt asks ±10%
      if (!endingRepairEnabled) return { raw, edited, natural }
      // The bounded edit runs on the finished text, before the gate reads it. The naturalizer's own
      // audit status is left untouched — this is a separate stage with its own trail.
      // On a gate-steered retry this records the SECOND chain's repair, because that is the chain that
      // shipped — the same convention as raw/edited/natural, which also describe the winning chain only.
      const repaired = await repairEnding(raw, natural.narration, natural.peakMoment)
      endingRepair = repaired.audit
      return { raw, edited, natural: { ...natural, narration: repaired.narration } }
    }

    let { raw, edited, natural } = await runChain()

    let gate: StudioOutput['gate']
    let retried = false
    try {
      const verdicts: StoryGateVerdict[] = []
      let verdict = await gateOnce(raw, natural.narration)
      verdicts.push(verdict)
      if (!verdict.pass) {
        if (verdict.rewriteCanFix === false) {
          // Idea/premise-level failure: a Writer rewrite of the SAME plan re-runs the whole chain
          // (writer+editor+naturalizer+gate) and fails again — observed on plan-doomed stories the
          // gate can't be argued out of. Skip the wasted retry; the story_review human gate is the
          // backstop, exactly as it is after an exhausted retry.
          console.warn('[generate_story] gate fail is idea-level (rewriteCanFix=false) — skipping the retry')
        } else {
          // One rewrite, steered by the gate's reason. Then pass through regardless —
          // the story_review human gate is the backstop.
          retried = true
          ;({ raw, edited, natural } = await runChain(verdict.reason))
          verdict = await gateOnce(raw, natural.narration)
          verdicts.push(verdict)
        }
      }
      gate = { status: 'ok', version: STORY_CRITIC_V2_VERSION, verdicts, retried }
    } catch (err) {
      cost.add(spendFromError(err))
      // Never fail the step over the gate — the human gate still sees the story.
      console.warn(`[generate_story] gate failed, passing story through: ${String(err)}`)
      gate = { status: 'failed', error: String(err) }
    }

    // ── peakMoment chain: last stage's peak → writer's original → NULL ───────
    const peak = resolvePeak(natural.narration, [natural.peakMoment, edited.peakMoment, raw.peakMoment])
    const peakResolution: StudioOutput['peakResolution'] =
      peak === '' ? 'dropped' : peak === natural.peakMoment.trim() ? 'stage' : 'writer_restored'

    const winner: StoryOutput = { ...raw, narration: natural.narration, peakMoment: peak }

    // ── Finishing QA (OPT-IN, detection only) — record a punch-list for the human reviewer ──────────
    let finishingQA: StudioOutput['finishingQA']
    if (finishingQaEnabled) {
      try {
        const { system, userMessage } = buildStoryFinishingJudgePrompt({
          channelName: v.channelName,
          nicheDescription: v.nicheDescription,
          language: v.language,
          narration: winner.narration,
          title: winner.title,
          logline: winner.logline ?? '',
          creativeContext: a.creativeContext,
          sourcePolicy: a.channel.sourcePolicy,
        })
        const res = await llmCall({
          templateVersion: STORY_FINISHING_JUDGE_V1_VERSION,
          schema: FinishingJudgeSchema,
          system,
          messages: [{ role: 'user', content: userMessage }],
          provider: 'anthropic',
          maxTokens: 1500,
        })
        cost.add(res.costCents)
        finishingQA = { status: 'ok', version: STORY_FINISHING_JUDGE_V1_VERSION, issues: res.data.issues, summary: res.data.summary }
      } catch (err) {
        cost.add(spendFromError(err))
        // Never fail the step over QA — it's advisory. Record the failure and move on.
        console.warn(`[generate_story] finishing QA failed, skipping punch-list: ${String(err)}`)
        finishingQA = { status: 'failed', error: String(err) }
      }
    }

    // ── FACT GATE (OPT-IN, advisory) — check the finished story against this reel's sources ──────────
    // Runs INLINE here (not as its own pipeline step) for the same reason the plan gate and finishing QA
    // do: it's a judgment about the story this step just produced, so it belongs to this step's output and
    // its cost. Reuses the EBN Extractor + Fact-Fidelity Checker, but AFTER a freely-written story — so a
    // standard channel (any language, persona, or look) can fact-check its scripts without inheriting
    // EBN's illustrative rendering + formal-English writer. Detection only: the punch-list reaches the
    // human at story_review; nothing blocks or regenerates.
    let factCheck: StudioOutput['factCheck']
    if (a.channel.factCheck && a.dossier) {
      try {
        const ex = buildEbnExtractorPrompt({ dossier: a.dossier })
        const exRes = await llmCall({
          templateVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
          schema: EvidenceBibleSchema,
          system: ex.system,
          messages: [{ role: 'user', content: ex.userMessage }],
          provider: 'anthropic',
          maxTokens: 4096,
        })
        cost.add(exRes.costCents)
        const facts = EvidenceBibleSchema.parse(exRes.data).facts
        assertEvidenceBibleIntegrity(facts)

        const ff = buildEbnFidelityPrompt({
          facts: facts.map((f) => ({ id: f.id, stance: f.stance, weight: f.weight, value: f.value, attributed_to: f.attributed_to })),
          criticalIds: facts.filter((f) => f.weight === 'Critical').map((f) => f.id),
          narration: winner.narration,
          title: winner.title,
          logline: winner.logline,
        })
        const ffRes = await llmCall({
          templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
          schema: EbnFidelitySchema,
          system: ff.system,
          messages: [{ role: 'user', content: ff.userMessage }],
          provider: 'anthropic',
          maxTokens: 2048,
        })
        cost.add(ffRes.costCents)
        factCheck = {
          fidelity: { status: 'ok', version: STORY_EBN_FIDELITY_V1_VERSION, factCount: facts.length, issues: ffRes.data.issues, summary: ffRes.data.summary ?? '' },
        }
        console.log(`[generate_story] fact gate: ${ffRes.data.issues.length === 0 ? 'no fidelity issues' : `${ffRes.data.issues.length} fidelity issue(s) flagged (advisory)`} against ${facts.length} sourced fact(s)`)
      } catch (err) {
        cost.add(spendFromError(err))
        // Never fail the step over the fact gate — it's advisory, exactly like finishing QA above.
        console.warn(`[generate_story] fact gate failed, story proceeds to review unchecked: ${String(err)}`)
        factCheck = { fidelity: { status: 'failed', error: String(err) } }
      }
    }

    const output: StudioOutput = {
      v: 3,
      mode: 'studio',
      angleId: angle.id,
      prose: { style: narrativeStyle ?? '', voice: narrativeVoice ?? '', influence: styleInfluence },
      plannerStatus,
      plan,
      ...(planGate ? { planGate } : {}),
      winner,
      winnerStoryId: randomUUID(),
      writerRaw: raw,
      editor: { status: edited.status, ...(edited.detail ? { detail: edited.detail } : {}) },
      naturalizer: { status: natural.status, ...(natural.detail ? { detail: natural.detail } : {}) },
      gate,
      ...(finishingQA ? { finishingQA } : {}),
      ...(endingRepair ? { endingRepair } : {}),
      ...(factCheck ? { factCheck } : {}),
      peakResolution,
    }
    return { output, costCents: cost.total }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// EVIDENCE-CONSTRAINED NARRATIVE — dossier → Extractor → (frozen) Evidence Bible → Narrative Claims →
// cited Writer → Fact-Fidelity Checker. The story is generated STRICTLY from the curated dossier; no
// stage invents facts (specs/evidence-based-narrative.md). Returns the SAME StudioOutput contract as the
// fiction chain, so everything after generate_story (persistStory, story_review) is identical.
// Extraction is fail-CLOSED (no evidence ⇒ no story); the Fact-Fidelity Checker is fail-SAFE detection
// (its flags surface at story_review for the human — matching the advisory-gate philosophy).
// ────────────────────────────────────────────────────────────────────────────
const GENERATE_STORY_EBN_VERSION = 'generate-story-ebn.v2'

async function runEbnStudio(a: StudioArgs) {
  const db = getDb()
  const language = a.language
  const specialization = a.channel.ebnSpecialization?.trim() || 'historical_events'
  const dossier = a.dossier?.trim()
  const tasteRubric = composeTasteRubric({
    tasteRubric: a.channel.tasteRubric,
    editorialPrinciples: a.channel.editorialPrinciples,
    genreCategory: a.channel.genreCategory,
    niche: a.channel.nicheDescription,
  })

  // The dossier is the ONLY source of facts. No dossier ⇒ fail CLOSED (never fall through to fiction):
  // an evidence-based story with no evidence must not be produced. Thrown before any paid call.
  if (!dossier) {
    throw new Error('Evidence-required reel has no curated dossier (fail-closed: no evidence, no story).')
  }

  // Evidence controls WHAT may be said; the channel contract still controls HOW the story is told.
  // Keep the brief structurally separate from the Evidence Bible so the model is explicitly forbidden
  // from treating channel copy or operator feedback as a factual source.
  const editorialBrief = JSON.stringify({
    creativeContext: a.creativeContext,
    creatorContract: renderStoryCreativeContext(a.creativeContext),
    sourceConstraints: renderStorySourceGuards(a.channel.sourcePolicy),
    language,
    audienceDescriptor: a.basePromptVars.audienceDescriptor,
    sourcePolicy: a.channel.sourcePolicy,
    channel: a.channel.name,
    channelPromise: a.channel.nicheDescription,
    editorialPrinciples: a.channel.editorialPrinciples,
    tasteRubric,
    genre: a.channel.genreCategory,
    narrativeStyle: a.channel.narrativeStyle,
    narrativeVoice: a.channel.narrativeVoice,
    styleInfluence: a.creativeContext.styleInfluence,
    targetSeconds: a.targetSeconds,
    targetWords: a.basePromptVars.targetWords,
    platformHook: a.platformHookHint,
    operatorRequest: a.operatorSeed,
    latestRevisionFeedback: a.operatorFeedback,
  }, null, 2)

  // One hash for the whole evidence-constrained round. Regeneration nonce + editorial brief are
  // load-bearing: omitting them made "Write another" cache the prior factual take and ignored operator
  // feedback. A frozen round is still idempotent; an intentional rewrite is a distinct round.
  const inputHash = buildInputHash(GENERATE_STORY_EBN_VERSION, {
    extractorVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
    plannerVersion: STORY_EBN_PLANNER_V1_VERSION,
    writerVersion: STORY_EBN_WRITER_V1_VERSION,
    fidelityVersion: STORY_EBN_FIDELITY_V1_VERSION,
    narrativeQualityVersion: STORY_CRITIC_V2_VERSION,
    evidenceIntegrityVersion: EVIDENCE_INTEGRITY_VERSION,
    dossier,
    specialization,
    language,
    targetWords: a.basePromptVars.targetWords,
    regenerationNonce: a.regenerationNonce,
    editorialBrief,
    tasteRubric,
  })

  return runStep<StudioOutput>({ reelId: a.reelId, stepName: 'generate_story', inputHash }, async (cost) => {
    // ── 1. Extract → the frozen Evidence Bible (fail-CLOSED) ──────────────────
    const ex = buildEbnExtractorPrompt({ dossier, subject: a.channel.nicheDescription })
    const exRes = await llmCall({
      templateVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
      schema: EvidenceBibleSchema,
      system: ex.system,
      messages: [{ role: 'user', content: ex.userMessage }],
      provider: 'anthropic',
      maxTokens: Math.min(16384, Math.max(3000, a.basePromptVars.targetWords * 6)),
    })
    cost.add(exRes.costCents)
    const facts = EvidenceBibleSchema.parse(exRes.data).facts
    if (facts.length === 0) {
      throw new Error('EBN extractor produced an empty Evidence Bible from the dossier; blocking (fail-closed).')
    }
    assertEvidenceBibleIntegrity(facts)
    // Persist the frozen, versioned Bible on the reel BEFORE consuming it (the immutability contract:
    // nothing downstream acquires facts — the Planner/Writer only select from what is frozen here).
    const evidenceBibleVersion = 1
    await db.update(reels).set({ evidenceBible: { version: evidenceBibleVersion, facts }, updatedAt: new Date() }).where(eq(reels.id, a.reelId))

    const bibleForModel = facts.map((f) => ({
      id: f.id, stance: f.stance, weight: f.weight,
      ...(f.attributed_to ? { attributed_to: f.attributed_to } : {}), value: f.value,
    }))
    const criticalIds = facts.filter((f) => f.weight === 'Critical').map((f) => f.id)
    const factById = new Map(facts.map((f) => [f.id, f]))
    const targetWords = a.basePromptVars.targetWords
    const maxClaims = ebnClaimBudget(targetWords)

    // ── 2. Planner → Narrative Claims (ordering only; every claim cites fact ids) ──
    const targetNote = `a ~${targetWords}-word ${specialization.replace(/_/g, ' ')} story that fulfills the editorial brief`
    const pl = buildEbnPlannerPrompt({ facts: bibleForModel, criticalIds, targetNote, editorialBrief, maxClaims, language })
    const claimsRes = await llmCall({
      templateVersion: STORY_EBN_PLANNER_V1_VERSION,
      schema: EbnClaimsSchema,
      system: pl.system,
      messages: [{ role: 'user', content: pl.userMessage }],
      provider: 'anthropic',
      maxTokens: Math.min(16384, Math.max(2000, maxClaims * 180)),
    })
    cost.add(claimsRes.costCents)
    const rawClaims = claimsRes.data.claims.sort((left, right) => left.order - right.order)
    assertEbnClaimsIntegrity(facts, rawClaims)
    // Claim count is a structural duration lever. If the planner exceeds its budget, merge adjacent
    // claims deterministically rather than dropping evidence or asking another paid model to re-plan.
    // The merged claim keeps the union of fact ids, so citability and Critical-fact coverage survive.
    const claims = rawClaims.length <= maxClaims
      ? rawClaims
      : Array.from({ length: maxClaims }, (_, bucketIndex) => {
          const start = Math.floor((bucketIndex * rawClaims.length) / maxClaims)
          const end = Math.floor(((bucketIndex + 1) * rawClaims.length) / maxClaims)
          const bucket = rawClaims.slice(start, end)
          return {
            id: `C${bucketIndex + 1}`,
            order: bucketIndex + 1,
            purpose: bucket.map((claim) => claim.purpose).join('; '),
            evidence: [...new Set(bucket.flatMap((claim) => claim.evidence))],
          }
        })
    if (rawClaims.length > maxClaims) {
      console.log(`[generate_story:ebn] compacted ${rawClaims.length} claims → ${maxClaims} for ${targetWords}-word budget`)
    }

    // ── 3. Writer → cited prose (the citation map) + framing fields ──────────
    const claimsWithFacts = claims.map((c) => ({
      id: c.id,
      order: c.order,
      purpose: c.purpose,
      facts: c.evidence
        .map((id) => factById.get(id))
        .filter((f): f is EbnFact => !!f)
        .map((f) => ({ id: f.id, stance: f.stance, attributed_to: f.attributed_to, value: f.value })),
    }))
    const minWords = Math.round(targetWords * 0.9)
    const maxWords = Math.round(targetWords * 1.1)
    const write = async (brief: string, previousDraft?: EbnWriter, requestedWords: number = targetWords) => {
      const wr = buildEbnWriterPrompt({
        claims: claimsWithFacts,
        permissions: TRUE_CRIME_PERMISSIONS,
        editorialBrief: brief,
        targetWords: requestedWords,
        language,
        audienceDescriptor: a.basePromptVars.audienceDescriptor,
      })
      const res = await llmCall({
        templateVersion: STORY_EBN_WRITER_V1_VERSION,
        schema: EbnWriterSchema,
        system: wr.system,
        messages: [{
          role: 'user',
          content: previousDraft
            ? `${wr.userMessage}\n\nPREVIOUS CITED DRAFT TO REVISE:\n${JSON.stringify(previousDraft, null, 2)}\n\nReturn a complete replacement JSON object. Preserve its supported factual spine and citations while following the length correction in the brief. Count the narration words before answering.`
            : wr.userMessage,
        }],
        provider: 'anthropic',
        maxTokens: Math.min(16384, Math.max(a.storyMaxTokens, targetWords * 6)),
      })
      cost.add(res.costCents)
      assertEbnCitationIntegrity(facts, claims, res.data)
      return res.data
    }
    let writerData = await write(editorialBrief)
    const narrationFrom = (draft: typeof writerData) => draft.narrative
      .flatMap((g) => g.sentences)
      .map((s) => s.text)
      .join(' ')
    const countWords = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length

    const firstWordCount = countWords(narrationFrom(writerData))
    if (firstWordCount < minWords || firstWordCount > maxWords) {
      // One bounded correction, with the same real budget as the final gate. A short draft needs
      // expansion using supported evidence; a long one needs compression, never conflicting targets.
      const correction = ebnLengthCorrection(targetWords, firstWordCount)
      writerData = await write(
        `${editorialBrief}\n\nMANDATORY LENGTH CORRECTION: ${correction.instruction}`,
        writerData,
        correction.requestedWords,
      )
    }

    const citationMap = writerData.narrative.flatMap((g) =>
      g.sentences.map((s) => ({ text: s.text, claimId: g.claimId, factIds: s.factIds })),
    )
    const narration = citationMap.map((s) => s.text).join(' ')
    const narrationWordCount = countWords(narration)
    const lengthClean = narrationWordCount >= minWords && narrationWordCount <= maxWords

    // ── 4. Fact-Fidelity Checker (fail-SAFE — detection; the human approves at review) ──
    let fidelity: NonNullable<StudioOutput['ebn']>['fidelity']
    try {
      const fp = buildEbnFidelityPrompt({ facts: bibleForModel, criticalIds, narration, title: writerData.title, logline: writerData.logline, citations: citationMap })
      const fRes = await llmCall({
        templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
        schema: EbnFidelitySchema,
        system: fp.system,
        messages: [{ role: 'user', content: fp.userMessage }],
        provider: 'anthropic',
        maxTokens: 2000,
      })
      cost.add(fRes.costCents)
      fidelity = { status: 'ok', version: STORY_EBN_FIDELITY_V1_VERSION, issues: fRes.data.issues, summary: fRes.data.summary ?? '' }
    } catch (err) {
      cost.add(spendFromError(err))
      console.warn(`[generate_story:ebn] fact-fidelity check failed, surfacing story for human review anyway: ${String(err)}`)
      fidelity = { status: 'failed', error: String(err) }
    }

    // ── 5. Shape a StoryOutput winner (the downstream contract) ──────────────
    const peakMoment = resolvePeak(narration, [writerData.peakSentence])
    const winner: StoryOutput = {
      title: writerData.title,
      language,
      narration,
      logline: writerData.logline,
      subgenreTags: [specialization],
      peakMoment,
      newCanon: [], // EBN reconstructs real, sourced entities; it declares no invented canon.
    }

    // ── 6. Narrative-quality / essence gate ───────────────────────────────────────────────────────
    // EBN previously stopped after factual fidelity + length. That allowed a faithful list of events to
    // reach storyboarding even when a first-time listener could not grasp the story's central change or
    // consequence. Reuse the SAME final editorial gate as the standard Writer path: evidence governs
    // truth; this call judges whether the supported material became a story. It lives inside runStep and
    // reports exact token usage through llmCall, so the extra EBN check is charged exactly once.
    let editorialVerdict: StoryGateVerdict | null = null
    let editorialError: string | null = null
    try {
      const prompt = buildStoryGatePrompt({
        channelName: a.channel.name,
        nicheDescription: a.channel.nicheDescription,
        language,
        tasteRubric,
        narration: winner.narration,
        title: winner.title,
        logline: winner.logline ?? '',
        operatorFeedback: a.operatorFeedback,
        sourcePolicy: a.channel.sourcePolicy,
        creativeContext: a.creativeContext,
      })
      const res = await llmCall({
        templateVersion: STORY_CRITIC_V2_VERSION,
        schema: StoryGateSchema,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 768,
      })
      cost.add(res.costCents)
      editorialVerdict = enforceStoryGateEssence(res.data)
    } catch (err) {
      cost.add(spendFromError(err))
      editorialError = String(err)
      console.warn(`[generate_story:ebn] narrative-quality gate failed; holding auto advance for review: ${editorialError}`)
    }

    // The gate slot is the single pre-storyboard readiness verdict consumed by auto mode. Keep the full
    // fidelity detail in `ebn`, while deterministically conjoining factual fidelity, duration, and the
    // editorial/essence result here so none can be bypassed by a contradictory model-level `pass`.
    const ffcClean = fidelity.status === 'ok' && fidelity.issues.length === 0
    const gate: StudioOutput['gate'] =
      editorialVerdict
        ? {
            status: 'ok',
            version: STORY_CRITIC_V2_VERSION,
            verdicts: [combineEbnStoryReadiness(editorialVerdict, {
              fidelityPass: ffcClean,
              fidelityReason: fidelity.status !== 'ok'
                ? 'The factual-fidelity check did not complete; review the story before production.'
                : fidelity.summary || `${fidelity.issues.length} factual-fidelity issue(s) must be reviewed.`,
              lengthPass: lengthClean,
              lengthReason: `Narration is ${narrationWordCount} words; the ${targetWords}-word target allows ${minWords}–${maxWords}.`,
            })],
            retried: false,
          }
        : { status: 'failed', error: editorialError ?? 'Narrative-quality gate returned no verdict.' }

    const output: StudioOutput = {
      v: 3,
      mode: 'studio',
      angleId: `ebn:${specialization}`,
      prose: {
        style: a.creativeContext.narrativeStyle ?? '',
        voice: a.creativeContext.narrativeVoice ?? '',
        influence: a.creativeContext.styleInfluence ?? 'medium',
      },
      plannerStatus: 'ok',
      plan: null,
      winner,
      winnerStoryId: randomUUID(),
      writerRaw: winner,
      editor: { status: 'ok' },
      naturalizer: { status: 'ok' },
      gate,
      ebn: { version: GENERATE_STORY_EBN_VERSION, evidenceBibleVersion, factCount: facts.length, citationMap, fidelity },
      peakResolution: peakMoment === '' ? 'dropped' : 'stage',
    }
    return { output, costCents: cost.total }
  })
}
