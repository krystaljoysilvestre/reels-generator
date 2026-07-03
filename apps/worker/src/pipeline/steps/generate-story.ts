import { eq, and, gte, desc } from 'drizzle-orm'
import { getDb, channels, stories, rejections, pipelineSteps } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  StoryOutputSchema,
  WorldBibleSchema,
  ToneConfigSchema,
  type StoryOutput,
} from '@reels/core'
import {
  buildInputHash,
} from '@reels/providers'
import {
  STORY_V1_VERSION,
  buildStoryPrompt,
  STORY_CRITIC_V1_VERSION,
  buildStoryCriticPrompt,
  StoryCriticSchema,
  DEFAULT_TASTE_RUBRIC,
} from '../../prompts-bridge.js'
import {
  selectFewShot,
  formatFewShot,
  buildAvoidList,
  REJECTION_REASON_LABELS,
  selectAngles,
} from '../../assembly-bridge.js'
import { runStep, setReelStatus } from '../harness.js'

// Best-of-N: draft N candidates on distinct angles, have the critic rank them against the
// channel's taste rubric, proceed with only the winner. ~12–15¢/reel vs ~2¢ single-shot.
const BEST_OF_N = 6
const CANDIDATE_TEMPERATURE = 1.0
// Step-level recipe version: keys the input hash alongside the prompt versions, so bumping the
// best-of-N mechanics (N, shuffle, fallback rules) busts the cache without touching the prompts.
const GENERATE_STORY_STEP_VERSION = 'generate_story.bestofn.v1'

interface CandidateEntry {
  angleId: string
  story: StoryOutput
}

type CriticRecord =
  | {
      status: 'ok'
      version: string
      rationale: string
      winnerLabel: string
      verdicts: Array<{
        label: string
        candidateIdx: number
        total: number
        note: string
        scores: { hook: number; build: number; payoff: number; voice: number; freshness: number }
      }>
    }
  | { status: 'skipped'; reason: 'single_survivor' }
  | { status: 'failed'; error: string }

// Persisted as pipeline_steps.output — the winner is duplicated into the stories row (which keeps
// the single reels.storyId FK invariant); losers + verdicts live here for the story-gate UI + audit.
interface BestOfNOutput {
  v: 2
  winner: StoryOutput
  winnerIdx: number
  candidates: CandidateEntry[]
  critic: CriticRecord
  generationFailures: number
}

// Deterministic shuffle for critic presentation order (position-bias defense): seeded on
// reelId+nonce so retries of the same round present candidates identically (stable step output).
function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 5381
  for (let i = 0; i < seedText.length; i++) seed = ((seed << 5) + seed + seedText.charCodeAt(i)) >>> 0
  const rand = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const CANDIDATE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export async function generateStory(reelId: string, channelId: string, language: string = 'tagalog') {
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

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

  // ── THIS reel's own rejections → per-reel regeneration feedback ───────────
  // The operator rejecting a draft for THIS reel records a reason+note; feed the latest one (and the
  // attempt count) into the prompt so the next draft is shaped by it AND the inputHash changes (forcing a
  // real re-run — repeating the same reason still yields a new story because the attempt # advances).
  const reelRejections = await db.query.rejections.findMany({
    where: eq(rejections.reelId, reelId),
    orderBy: [desc(rejections.createdAt)],
  })
  const regenerationNonce = reelRejections.length
  const latestRejection = reelRejections[0]
  const operatorFeedback = latestRejection
    ? [REJECTION_REASON_LABELS[latestRejection.reasonCode] ?? latestRejection.reasonCode, latestRejection.note?.trim()]
        .filter(Boolean)
        .join(' — ')
    : undefined

  // ── Previous round's winning angle → exclude it from this slate ───────────
  // On regeneration, the one guaranteed-wrong move is re-leading with the exact angle the operator
  // just rejected. runStep OVERWRITES the step row, so read the prior output before calling it.
  let prevWinnerAngleId: string | undefined
  if (regenerationNonce > 0) {
    const prevStep = await db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
    })
    const prev = prevStep?.output as Partial<BestOfNOutput> | null | undefined
    if (prev && prev.v === 2 && Array.isArray(prev.candidates) && typeof prev.winnerIdx === 'number') {
      prevWinnerAngleId = prev.candidates[prev.winnerIdx]?.angleId
    }
  }

  const angles = selectAngles(BEST_OF_N, regenerationNonce, prevWinnerAngleId)

  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75 // per-channel reel length (derived per niche)
  const targetWords = Math.round(targetSeconds * 2.5) // ~2.5 words/sec narration pace

  const basePromptVars = {
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    toneConfig: JSON.stringify(toneConfig),
    language,
    audienceDescriptor: 'young Filipino adult',
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    fewshotStories: formatFewShot(fewShot),
    targetSeconds,
    targetWords,
    rejectionAvoidList: avoidList,
    operatorFeedback,
    regenerationNonce,
  }

  const { system, userMessage } = buildStoryPrompt(basePromptVars)
  const tasteRubric = channel.tasteRubric?.trim() || DEFAULT_TASTE_RUBRIC

  // One hash for the whole best-of-N round. Prompt text carries nonce + operator feedback; the
  // angle slate, N, and rubric are part of the recipe, so editing any of them re-runs the step.
  const inputHash = buildInputHash(GENERATE_STORY_STEP_VERSION, {
    storyVersion: STORY_V1_VERSION,
    criticVersion: STORY_CRITIC_V1_VERSION,
    system,
    userMessage,
    angles: angles.map((a) => a.id),
    n: BEST_OF_N,
    rubric: tasteRubric,
  })

  const result = await runStep<BestOfNOutput>(
    { reelId, stepName: 'generate_story', inputHash },
    async () => {
      // ── Fan out: one draft per angle ─────────────────────────────────────
      // Promise.allSettled (not runPool): partial failure is tolerated — we rank the survivors.
      // The provider limiter (openai cap 8) is the concurrency throttle.
      const settled = await Promise.allSettled(
        angles.map((angle) =>
          llmCall({
            templateVersion: STORY_V1_VERSION,
            schema: StoryOutputSchema,
            system,
            messages: [{ role: 'user', content: buildStoryPrompt({ ...basePromptVars, angleDirective: angle.directive }).userMessage }],
            temperature: CANDIDATE_TEMPERATURE,
          }),
        ),
      )

      let costCents = 0
      const candidates: CandidateEntry[] = []
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') {
          costCents += s.value.costCents
          // zod applies the newCanon default at parse time; re-assert it for the output type
          candidates.push({ angleId: angles[i]!.id, story: { ...s.value.data, newCanon: s.value.data.newCanon ?? [] } })
        } else {
          console.warn(`[generate_story] candidate ${angles[i]!.id} failed: ${String(s.reason)}`)
        }
      })
      const generationFailures = angles.length - candidates.length

      if (candidates.length === 0) {
        const firstErr = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')
        throw new Error(`all ${angles.length} story candidates failed; first error: ${String(firstErr?.reason ?? 'unknown')}`)
      }

      // ── Rank survivors ───────────────────────────────────────────────────
      let winnerIdx = 0
      let critic: CriticRecord

      if (candidates.length === 1) {
        critic = { status: 'skipped', reason: 'single_survivor' }
      } else {
        try {
          // Deterministic shuffle → labels carry no position information for the critic.
          const order = seededShuffle(
            candidates.map((_, idx) => idx),
            `${reelId}:${regenerationNonce}`,
          )
          const labelToIdx = new Map<string, number>()
          const candidatesBlock = order
            .map((candidateIdx, pos) => {
              const label = CANDIDATE_LABELS[pos]!
              labelToIdx.set(label, candidateIdx)
              const c = candidates[candidateIdx]!
              return `--- CANDIDATE ${label} ---\nTitle: ${c.story.title}\nLogline: ${c.story.logline}\nNarration:\n${c.story.narration}`
            })
            .join('\n\n')

          const criticPrompt = buildStoryCriticPrompt({
            channelName: channel.name,
            nicheDescription: channel.nicheDescription,
            tasteRubric,
            targetSeconds,
            operatorFeedback,
            candidatesBlock,
          })

          const criticRes = await llmCall({
            templateVersion: STORY_CRITIC_V1_VERSION,
            schema: StoryCriticSchema,
            system: criticPrompt.system,
            messages: [{ role: 'user', content: criticPrompt.userMessage }],
            provider: 'anthropic',
            maxTokens: 2048,
          })
          costCents += criticRes.costCents

          const picked = labelToIdx.get(criticRes.data.winnerLabel.trim().toUpperCase())
          if (picked === undefined) {
            throw new Error(`critic picked unknown label "${criticRes.data.winnerLabel}"`)
          }
          winnerIdx = picked
          critic = {
            status: 'ok',
            version: STORY_CRITIC_V1_VERSION,
            rationale: criticRes.data.rationale,
            winnerLabel: criticRes.data.winnerLabel,
            verdicts: criticRes.data.verdicts.map((v) => ({
              label: v.label,
              candidateIdx: labelToIdx.get(v.label.trim().toUpperCase()) ?? -1,
              total: v.total,
              note: v.note,
              scores: v.scores,
            })),
          }
        } catch (err) {
          // Never fail the step over the critic — the candidates are already paid for and the
          // story gate (or auto-mode) still needs a story. Candidate 0 leads the slate.
          console.warn(`[generate_story] critic failed, falling back to candidate 0: ${String(err)}`)
          winnerIdx = 0
          critic = { status: 'failed', error: String(err) }
        }
      }

      const output: BestOfNOutput = {
        v: 2,
        winner: candidates[winnerIdx]!.story,
        winnerIdx,
        candidates,
        critic,
        generationFailures,
      }
      return { output, costCents }
    },
  )

  if (!result.skipped) {
    const winner = result.output.winner

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
        twistAnchor: winner.peakMoment, // stored in the internal music-timing anchor column
        subgenreTags: winner.subgenreTags,
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
