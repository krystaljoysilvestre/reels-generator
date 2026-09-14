// Actual production story-generation entrypoint, stopped before scenes/audio/publication.
// This creates a real, cost-accounted reel on an existing channel. Run deliberately, not in unit tests.
// Usage: pnpm --filter worker exec tsx scripts/story-studio-check.ts <channelId>
//   [--genre "cozy mystery"] [--seed "..."] [--series <id>] [--dossier /path/to/sources.txt]
//   [--out /path/to/new-result.json]
// Exit 0 means final readiness passed; 2 means hold/failure. JSON retains raw stage artifacts and cost.
import '../src/env.js'
import { open, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { z } from 'zod'

void (async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    genre: { type: 'string' }, seed: { type: 'string' }, series: { type: 'string' },
    dossier: { type: 'string' }, out: { type: 'string' },
  } })
  const channelId = z.string().uuid().parse(positionals[0])
  const { getDb, reels, channels, channelSeries, stories, pipelineSteps } = await import('@reels/db')
  const { GenreCategorySchema, resolveGenreForNewReel, resolveChannelPolicy, requiresEvidence } = await import('@reels/core')
  const { DEFAULT_LLM_MODELS } = await import('@reels/providers')
  const { generateStory } = await import('../src/pipeline/steps/generate-story.js')
  const { eq, and } = await import('drizzle-orm')
  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) throw new Error('Channel not found')
  const series = values.series
    ? await db.query.channelSeries.findFirst({ where: and(eq(channelSeries.id, z.string().uuid().parse(values.series)), eq(channelSeries.channelId, channelId)) })
    : undefined
  if (values.series && !series) throw new Error('Series not found on this channel')
  const sourcePolicy = resolveChannelPolicy(null, series, channel)
  const dossier = values.dossier ? (await readFile(values.dossier, 'utf8')).trim() : undefined
  if (dossier && dossier.length > 20000) throw new Error('Dossier exceeds the production 20,000-character limit')
  if ((requiresEvidence(sourcePolicy) || channel.storyMode === 'ebn') && !dossier) throw new Error('This channel/series requires --dossier; no reel or paid call was created')
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const genreCategory = values.genre ? GenreCategorySchema.parse(values.genre) : resolveGenreForNewReel(series, channel)
  const seedIdea = values.seed ? z.string().trim().min(1).max(500).parse(values.seed) : undefined
  const styleInfluence = ['light', 'medium', 'full'].includes(channel.styleInfluence ?? '') ? channel.styleInfluence : 'medium'
  const reelId = randomUUID()
  const outputPath = values.out || `story-studio-${reelId}.json`
  // Reserve the artifact before any mutation or paid generation; an existing/unwritable path
  // must fail while rerunning is still free. Keep the handle so final output cannot overwrite a rival file.
  const outputFile = await open(outputPath, 'wx')
  try {
    await db.insert(reels).values({
      id: reelId, channelId, status: 'drafting', language, genreCategory, sourcePolicy,
      ...(series ? { seriesId: series.id } : {}), ...(dossier ? { dossier } : {}), ...(seedIdea ? { seedIdea } : {}),
    })
    console.log(`Production story probe created reel ${reelId}; no downstream production will be queued.`)
    let failure: string | undefined
    try { await generateStory(reelId, channelId, language) } catch (error) { failure = String(error) }
    const savedReel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
    const story = savedReel?.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, savedReel.storyId) }) : null
    const step = await db.query.pipelineSteps.findFirst({ where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')) })
    const output = step?.output as { winnerStoryId?: string; gate?: { status?: string; verdicts?: { pass?: boolean }[] } } | null
    const verdicts = output?.gate?.verdicts ?? []
    const artifactIntegrity = !!story && story.id === output?.winnerStoryId && (!story.twistAnchor || story.body.includes(story.twistAnchor))
    const ready = !failure && artifactIntegrity && output?.gate?.status === 'ok' && verdicts.at(-1)?.pass === true
    const artifact = {
      manifest: {
        schemaVersion: 1, createdAt: new Date().toISOString(), route: 'generateStory-production-entrypoint',
        channelId, reelId, storyId: savedReel?.storyId, genre: genreCategory, language, sourcePolicy,
        niche: channel.nicheDescription, narrativeStyle: channel.narrativeStyle, narrativeVoice: channel.narrativeVoice,
        styleInfluence, tasteRubric: channel.tasteRubric,
        editorialPrinciples: channel.editorialPrinciples, targetSeconds: channel.targetSeconds, seedIdea,
        storyMode: channel.storyMode, evidenceRequired: requiresEvidence(sourcePolicy) || channel.storyMode === 'ebn',
        flags: { planGate: process.env.STORY_PLAN_GATE === '1', finishingQA: process.env.STORY_FINISHING_QA === '1', endingRepair: process.env.STORY_ENDING_REPAIR === '1' },
        models: DEFAULT_LLM_MODELS, inputHash: step?.inputHash,
      },
      ready, artifactIntegrity, failure, story, output: step?.output, evidenceBible: savedReel?.evidenceBible,
      costCents: savedReel?.costCents ?? 0,
    }
    await outputFile.writeFile(JSON.stringify(artifact, null, 2))
    console.log(JSON.stringify({ reelId, ready, failure, costCents: artifact.costCents, outputPath }, null, 2))
    process.exitCode = ready ? 0 : 2
  } finally {
    await outputFile.close()
  }
  // Provider/database clients can keep the process alive; exit after the artifact handle is closed.
  process.exit(process.exitCode ?? 1)
})().catch(error => { console.error(error); process.exit(1) })
