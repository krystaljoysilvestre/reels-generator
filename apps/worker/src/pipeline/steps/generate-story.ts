import { eq, and, gte, desc } from 'drizzle-orm'
import { getDb, channels, stories, rejections } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  StoryOutputSchema,
  WorldBibleSchema,
  ToneConfigSchema,
} from '@reels/core'
import {
  buildInputHash,
} from '@reels/providers'
import {
  STORY_V1_VERSION,
  buildStoryPrompt,
} from '../../prompts-bridge.js'
import {
  selectFewShot,
  formatFewShot,
  buildAvoidList,
  REJECTION_REASON_LABELS,
} from '../../assembly-bridge.js'
import { runStep, setReelStatus } from '../harness.js'

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

  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75 // per-channel reel length (derived per niche)
  const targetWords = Math.round(targetSeconds * 2.5) // ~2.5 words/sec narration pace

  const { system, userMessage } = buildStoryPrompt({
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
  })

  const inputHash = buildInputHash(STORY_V1_VERSION, { system, userMessage })

  const result = await runStep(
    { reelId, stepName: 'generate_story', inputHash },
    async () => {
      const llm = await llmCall({
        templateVersion: STORY_V1_VERSION,
        schema: StoryOutputSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })
      return { output: llm.data, costCents: llm.costCents }
    },
  )

  if (!result.skipped) {
    // Persist story to stories table
    const [story] = await db
      .insert(stories)
      .values({
        channelId,
        source: 'ai',
        language,
        title: result.output.title,
        body: result.output.narration,
        logline: result.output.logline,
        twistAnchor: result.output.peakMoment, // stored in the internal music-timing anchor column
        subgenreTags: result.output.subgenreTags,
      })
      .returning()

    // Link reel to the story and advance to story_review gate
    const { reels } = await import('@reels/db')
    await db.update(reels).set({ storyId: story!.id, status: 'story_review', updatedAt: new Date() }).where(eq(reels.id, reelId))
  } else {
    // Even on skip, ensure status is story_review
    await setReelStatus(reelId, 'story_review')
  }

  return result.output
}
