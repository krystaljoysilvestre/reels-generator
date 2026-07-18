import { eq, and, gte, desc, count } from 'drizzle-orm'
import { getDb, channels, stories, reels, rejections, pipelineSteps } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  StoryOutputSchema,
  WorldBibleSchema,
  ToneConfigSchema,
  PLATFORM_PRESETS,
  type StoryOutput,
} from '@reels/core'
import {
  buildInputHash,
} from '@reels/providers'
import {
  // story.v1 kept only as the planner-failure fallback draft (a single direct draft on the angle).
  STORY_V1_VERSION,
  buildStoryPrompt,
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
  defaultTasteRubric,
  type StyleInfluence,
} from '../../prompts-bridge.js'
import {
  selectFewShot,
  formatFewShot,
  buildAvoidList,
  REJECTION_REASON_LABELS,
  selectAngles,
} from '../../assembly-bridge.js'
import { runStep, setReelStatus } from '../harness.js'

// The story pipeline: Planner → Genre Writer ×1 → Editor → Naturalizer → binary Gate.
// ~5 LLM calls, ONE full-length prose generation. The Writer is the product.
// (The legacy best-of-6 path was retired 2026-07-16 after the blind premise A/B: the single
// Planner won on freshness/pull, so write-6-and-rank is gone. History is in git if ever needed.)
const CANDIDATE_TEMPERATURE = 1.0 // temperature for the planner-failure fallback draft (story.v1)
// Studio recipe version: keys the input hash alongside every stage/asset version.
// v2 (2026-07-17): Naturalizer routed to Claude — the polish probe (probe-taglish-polish.ts) showed
// the gpt-4o naturalizer inert on unnatural Taglish while Claude's gate critiques were native-sharp;
// owner decision. Also: formatting-collapse discard guard.
const GENERATE_STORY_STUDIO_VERSION = 'generate_story.studio.v2'
// How many recent stories feed the Planner's premise avoid-list (the mirror-×6 fix).
const RECENT_PREMISES_LIMIT = 15
const WRITER_TEMPERATURE = 1.0
const REWRITE_TEMPERATURE = 0.7 // editor + naturalizer: refinement, not invention

type RewriteStatus = 'ok' | 'failed' | 'discarded_wordcount' | 'discarded_peak' | 'discarded_formatting'

// Persisted as pipeline_steps.output (studio mode) — the full attribution trail. Any bad story
// decomposes into inspectable artifacts; this is also the evidence base for the 300-story read.
interface StudioOutput {
  v: 3
  mode: 'studio'
  angleId: string
  prose: { style: string; voice: string; influence: StyleInfluence } // resolved prose dimensions (attribution)
  plannerStatus: 'ok' | 'failed_fell_back_to_v1_draft'
  plan: StoryPlan | null // includes whyThisStory + mechanics (audit only — the Writer never saw them)
  winner: StoryOutput // FINAL story (post edit + naturalize + peak chain) — the one persisted
  writerRaw: StoryOutput // pre-edit, for the raw-vs-final diff
  editor: { status: RewriteStatus; detail?: string }
  naturalizer: { status: RewriteStatus; detail?: string }
  gate:
    | { status: 'ok'; version: string; verdicts: Array<{ pass: boolean; reason: string }>; retried: boolean }
    | { status: 'failed'; error: string }
  peakResolution: 'stage' | 'writer_restored' | 'dropped'
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

// The peakMoment chain: first candidate that survives as a verbatim substring of the final text.
// Worst case '' → stories.twist_anchor NULL → breakdown-scenes re-extracts via peak-extract.v1
// (already shipped + validated). Never a hallucinated anchor. (Exported for tests.)
export function resolvePeak(narration: string, candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const t = c?.trim()
    if (t && narration.includes(t)) return t
  }
  return ''
}

export async function generateStory(reelId: string, channelId: string, language: string = 'tagalog') {
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  // The operator's per-reel topic request ("make one about …"), set at reel creation. Optional.
  const reelRow = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { seedIdea: true } })
  const operatorSeed = reelRow?.seedIdea?.trim() || undefined

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
  const recentRejections = await db.query.rejections.findMany({
    where: gte(rejections.createdAt, fourteenDaysAgo),
  })

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
  let prevWinnerAngleId: string | undefined
  if (regenerationNonce > 0) {
    const prevStep = await db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
    })
    const prev = prevStep?.output as Partial<StudioOutput> | null | undefined
    if (prev && prev.v === 3 && typeof prev.angleId === 'string') prevWinnerAngleId = prev.angleId
    // (older reels may carry a legacy v:2 output; its angle isn't reused — a fresh angle is fine.)
  }

  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75 // per-channel reel length (derived per niche)
  const targetWords = Math.round(targetSeconds * 2.5) // ~2.5 words/sec narration pace
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

  const result = await runStudio({
    reelId,
    channel: {
      name: channel.name,
      nicheDescription: channel.nicheDescription,
      tasteRubric: channel.tasteRubric,
      genreCategory: channel.genreCategory,
      narrativeStyle: channel.narrativeStyle,
      narrativeVoice: channel.narrativeVoice,
      styleInfluence: channel.styleInfluence,
    },
    basePromptVars,
    worldBible,
    targetSeconds,
    storyMaxTokens,
    regenerationNonce,
    operatorFeedback,
    operatorSeed,
    platformHookHint: PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS]?.hookHint,
    prevWinnerAngleId,
    recentPremises,
    recentElements,
    rotationOffset,
    language,
  })

  if (!result.skipped) {
    const winner = result.output.winner
    // Story-elements labels → persisted for the cross-reel shape avoid-list + analytics.
    // Planner metadata, NOT a Writer instruction (invariant 1). null for BYO.
    const elements = result.output.plan?.elements ?? null

    // Persist the winning story to the stories table
    const [story] = await db
      .insert(stories)
      .values({
        channelId,
        source: 'ai',
        language,
        title: winner.title,
        body: winner.narration,
        logline: winner.logline,
        // Music-timing anchor. Studio mode may resolve to '' (all peak candidates edited away) —
        // persist NULL so breakdown-scenes re-extracts via peak-extract.v1 instead of anchoring
        // on a line that no longer exists in the narration.
        twistAnchor: winner.peakMoment.trim() ? winner.peakMoment : null,
        subgenreTags: winner.subgenreTags,
        elements,
      })
      .returning()

    // Link reel to the story and advance to story_review gate
    const { reels } = await import('@reels/db')
    await db.update(reels).set({ storyId: story!.id, status: 'story_review', updatedAt: new Date() }).where(eq(reels.id, reelId))
  } else {
    // Even on skip, ensure status is story_review
    await setReelStatus(reelId, 'story_review')
  }

  return result.output.winner
}

// ────────────────────────────────────────────────────────────────────────────
// STUDIO MODE — Planner → Genre Writer ×1 → Editor → Naturalizer → binary Gate.
// Cost ~5 calls with ONE full-length prose generation (vs 6 in bestofn): net cheaper than legacy.
// Every stage's artifact persists in the step output (attribution + the 300-story evidence base).
// ────────────────────────────────────────────────────────────────────────────

interface StudioArgs {
  reelId: string
  channel: {
    name: string
    nicheDescription: string
    tasteRubric: string | null
    genreCategory: string | null
    narrativeStyle: string | null
    narrativeVoice: string | null
    styleInfluence: string | null
  }
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
  const v = a.basePromptVars
  const genreCategory = a.channel.genreCategory ?? undefined
  const tasteRubric = a.channel.tasteRubric?.trim() || defaultTasteRubric(genreCategory, a.channel.nicheDescription)
  // PROSE dimensions (story-styles / story-voices). '' → pure genre / identity-default voice.
  const narrativeStyle = a.channel.narrativeStyle || undefined
  const narrativeVoice = a.channel.narrativeVoice || undefined
  const styleInfluence = (['light', 'medium', 'full'] as const).includes(a.channel.styleInfluence as StyleInfluence)
    ? (a.channel.styleInfluence as StyleInfluence)
    : 'medium'
  // WRITER MODEL: gpt-4o (the standing "OpenAI writes prose" decision). A 2026-07-16 blind writer
  // A/B found Claude's Taglish arguably more natural, but the owner kept OpenAI for Taglish on a
  // second read. The gpt-4o-vs-Claude writer A/B harness (scripts/taglish-ab.ts) remains for other
  // languages/channels (e.g. an English channel) if we revisit the model choice there.
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
    // narrativeVoice only shapes the WRITER (not the planner prompt text), so hash it explicitly;
    // style/influence ride in via plannerSystem but are listed for a legible cache key.
    narrativeStyle: narrativeStyle ?? '',
    narrativeVoice: narrativeVoice ?? '',
    styleInfluence,
  })

  return runStep<StudioOutput>({ reelId: a.reelId, stepName: 'generate_story', inputHash }, async () => {
    let costCents = 0

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
      costCents += planRes.costCents
      plan = { ...planRes.data, mechanics: planRes.data.mechanics ?? [] }
    } catch (err) {
      // Never fail the step over the planner: fall back to ONE story.v1 draft on the angle
      // (the pre-pivot behavior, minus best-of-N). Editor/Naturalizer/Gate still run on it.
      console.warn(`[generate_story] planner failed, falling back to a direct v1 draft: ${String(err)}`)
      plannerStatus = 'failed_fell_back_to_v1_draft'
    }

    // ── 2. The Genre Writer: ONE excellent prose execution ──────────────────
    const writeOnce = async (qaFeedback?: string): Promise<StoryOutput> => {
      if (plan) {
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
          // Mechanics deliberately stripped: the Writer writes someone who lived this — it never
          // "executes false_safety + delayed_realization" (see writer-identities.v1 header).
          plan: {
            premise: plan.premise,
            conflict: plan.conflict,
            escalation: plan.escalation,
            twist: plan.twist,
            ending: plan.ending,
            emotionalDestination: plan.emotionalDestination,
          },
          register: plan.elements.register, // the committed temperature — flows on to voice delivery too
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
          temperature: WRITER_TEMPERATURE,
          maxTokens: a.storyMaxTokens,
        })
        costCents += res.costCents
        return { ...res.data, newCanon: res.data.newCanon ?? [] }
      }
      // Planner-failure fallback: a single legacy draft pinned to the angle.
      const { system, userMessage } = buildStoryPrompt({ ...v, angleDirective: angle.directive })
      const res = await llmCall({
        templateVersion: STORY_V1_VERSION,
        schema: StoryOutputSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
        temperature: CANDIDATE_TEMPERATURE,
        maxTokens: a.storyMaxTokens,
      })
      costCents += res.costCents
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
              })
            : buildStoryNaturalizerPrompt({
                language: v.language,
                audienceDescriptor: v.audienceDescriptor,
                narration,
                peakMoment,
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
        costCents += res.costCents
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
        // A pass that orphans its own peak (returned peakMoment not verbatim in its narration —
        // seen live: an editor cutting the climax) is a destructive rewrite: discard it.
        if (!res.data.narration.includes(res.data.peakMoment.trim())) {
          return { narration, peakMoment, status: 'discarded_peak', detail: 'returned peakMoment not in returned narration' }
        }
        // A pass that collapses the spoken line-per-beat formatting into a paragraph (seen in the
        // polish probe) breaks the read-aloud contract: discard it.
        const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length
        const inLines = beatLines(narration)
        const outLines = beatLines(res.data.narration)
        if (inLines >= 4 && outLines <= Math.ceil(inLines / 2)) {
          return { narration, peakMoment, status: 'discarded_formatting', detail: `${inLines}→${outLines} beat lines — collapsed the spoken formatting` }
        }
        return { narration: res.data.narration, peakMoment: res.data.peakMoment, status: 'ok' }
      } catch (err) {
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
      })
      const res = await llmCall({
        templateVersion: STORY_CRITIC_V2_VERSION,
        schema: StoryGateSchema,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 512,
      })
      costCents += res.costCents
      return res.data
    }

    // ── Run the chain (with at most ONE gate-steered rewrite) ────────────────
    const runChain = async (qaFeedback?: string) => {
      const raw = await writeOnce(qaFeedback)
      const edited = await refine('editor', raw.narration, raw.peakMoment, 0.25) // prompt asks ±15%; guard is looser so borderline passes aren't wasted
      const natural = await refine('naturalizer', edited.narration, edited.peakMoment, 0.15) // prompt asks ±10%
      return { raw, edited, natural }
    }

    let { raw, edited, natural } = await runChain()

    let gate: StudioOutput['gate']
    let retried = false
    try {
      const verdicts: Array<{ pass: boolean; reason: string }> = []
      let verdict = await gateOnce(raw, natural.narration)
      verdicts.push(verdict)
      if (!verdict.pass) {
        // One rewrite, steered by the gate's reason. Then pass through regardless —
        // the story_review human gate is the backstop.
        retried = true
        ;({ raw, edited, natural } = await runChain(verdict.reason))
        verdict = await gateOnce(raw, natural.narration)
        verdicts.push(verdict)
      }
      gate = { status: 'ok', version: STORY_CRITIC_V2_VERSION, verdicts, retried }
    } catch (err) {
      // Never fail the step over the gate — the human gate still sees the story.
      console.warn(`[generate_story] gate failed, passing story through: ${String(err)}`)
      gate = { status: 'failed', error: String(err) }
    }

    // ── peakMoment chain: last stage's peak → writer's original → NULL ───────
    const peak = resolvePeak(natural.narration, [natural.peakMoment, edited.peakMoment, raw.peakMoment])
    const peakResolution: StudioOutput['peakResolution'] =
      peak === '' ? 'dropped' : peak === natural.peakMoment.trim() ? 'stage' : 'writer_restored'

    const winner: StoryOutput = { ...raw, narration: natural.narration, peakMoment: peak }

    const output: StudioOutput = {
      v: 3,
      mode: 'studio',
      angleId: angle.id,
      prose: { style: narrativeStyle ?? '', voice: narrativeVoice ?? '', influence: styleInfluence },
      plannerStatus,
      plan,
      winner,
      writerRaw: raw,
      editor: { status: edited.status, ...(edited.detail ? { detail: edited.detail } : {}) },
      naturalizer: { status: natural.status, ...(natural.detail ? { detail: natural.detail } : {}) },
      gate,
      peakResolution,
    }
    return { output, costCents }
  })
}
