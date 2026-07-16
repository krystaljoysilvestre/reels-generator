// Taglish writer A/B — resolves the parked model-ceiling question: is gpt-4o the ceiling on natural
// Taglish, or is the prompt the lever? Controlled pairwise test: for each round, run the Planner ONCE,
// then write that SAME plan twice — Arm A = gpt-4o (the standing prose writer), Arm B = Claude Sonnet.
// Only the model differs; identical plan, prompt, style, voice, few-shots.
//
// Output: a BLIND markdown sheet of story PAIRS (order randomized per round, models hidden) — the owner
// marks which reads as more natural Taglish — plus a sealed key. If Claude clearly wins, it's evidence
// to revisit the "OpenAI writes prose" decision (for Taglish, or the writer stage) WITH data.
//
// Usage: pnpm --filter worker exec tsx scripts/taglish-ab.ts <channelId> [rounds=8]
// Cost: ~1 planner + 2 full-length writers per round; ~10–20¢/round. 8 rounds ≈ $1.20.
import '../src/env.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

void (async () => {
  const [channelId, roundsArg] = process.argv.slice(2)
  if (!channelId) { console.error('usage: taglish-ab <channelId> [rounds=8]'); process.exit(1) }
  const rounds = Math.max(1, Number(roundsArg ?? 8))

  const { getDb, channels, stories } = await import('@reels/db')
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema, WorldBibleSchema, ToneConfigSchema } = await import('@reels/core')
  const { buildStoryPlannerPrompt, StoryPlanSchema, STORY_PLANNER_V1_VERSION } = await import('@reels/core/prompts/story-planner.v1')
  const { buildStoryWriterPrompt, STORY_V2_VERSION } = await import('@reels/core/prompts/story.v2')
  const { defaultAudienceDescriptor } = await import('@reels/core/prompts/story-craft.v1')
  const { selectFewShot, formatFewShot } = await import('@reels/core/assembly/fewshot')
  const { selectAngles } = await import('@reels/core/assembly/story-angles')
  const { eq, and, desc } = await import('drizzle-orm')
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) { console.error('channel not found'); process.exit(1) }
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  if (language !== 'taglish') console.warn(`⚠ channel language is "${language}", not taglish — running anyway`)
  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75
  const targetWords = Math.round(targetSeconds * 2.5)
  const storyMaxTokens = Math.min(16384, Math.max(4096, targetWords * 4))
  const styleInfluence = (['light', 'medium', 'full'] as const).includes(channel.styleInfluence as 'light' | 'medium' | 'full')
    ? (channel.styleInfluence as 'light' | 'medium' | 'full') : 'medium'

  const refStories = await db.query.stories.findMany({
    where: and(eq(stories.channelId, channelId), eq(stories.isReference, true)),
    orderBy: [desc(stories.performanceScore)], limit: 20,
  })
  const fewshotStories = formatFewShot(selectFewShot(
    refStories.map((s) => ({ title: s.title, narration: s.body, subgenreTags: s.subgenreTags, performanceScore: s.performanceScore, createdAt: s.createdAt })),
    [], 5,
  ))

  const writerBase = {
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    toneConfig: JSON.stringify(toneConfig),
    language,
    audienceDescriptor: defaultAudienceDescriptor(language),
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    fewshotStories,
    targetSeconds,
    targetWords,
    genreCategory: channel.genreCategory ?? undefined,
    narrativeStyle: channel.narrativeStyle || undefined,
    narrativeVoice: channel.narrativeVoice || undefined,
    styleInfluence,
  }

  let totalCents = 0
  const entries: Array<{ round: number; logline: string; gpt4o: string; claude: string }> = []

  for (let i = 0; i < rounds; i++) {
    try {
      // ONE plan per round (gpt-4o) — both arms write from the identical idea.
      const pp = buildStoryPlannerPrompt({
        channelName: channel.name, nicheDescription: channel.nicheDescription,
        toneConfig: writerBase.toneConfig, worldBibleJson: writerBase.worldBibleJson,
        genreCategory: writerBase.genreCategory, narrativeStyle: writerBase.narrativeStyle, styleInfluence,
        targetSeconds, angleDirective: selectAngles(1, i, undefined)[0]!.directive,
        avoidList: '', rejectionAvoidList: '', regenerationNonce: i,
      })
      const planRes = await llmCall({ templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema, system: pp.system, messages: [{ role: 'user', content: pp.userMessage }], temperature: 1.0, maxTokens: 1500 })
      totalCents += planRes.costCents
      const plan = { premise: planRes.data.premise, conflict: planRes.data.conflict, twist: planRes.data.twist, ending: planRes.data.ending, emotionalDestination: planRes.data.emotionalDestination }

      const { system, userMessage } = buildStoryWriterPrompt({ ...writerBase, plan })
      const msg = [{ role: 'user' as const, content: userMessage }]
      // Arm A: gpt-4o (default). Arm B: Claude Sonnet (provider anthropic).
      const [a, b] = await Promise.all([
        llmCall({ templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system, messages: msg, temperature: 1.0, maxTokens: storyMaxTokens }),
        llmCall({ templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system, messages: msg, temperature: 1.0, maxTokens: storyMaxTokens, provider: 'anthropic' }),
      ])
      totalCents += a.costCents + b.costCents
      entries.push({ round: i, logline: planRes.data.logline, gpt4o: a.data.narration, claude: b.data.narration })
    } catch (e) { console.warn(`round ${i} failed: ${String(e)}`) }
    console.log(`round ${i + 1}/${rounds} done — running cost $${(totalCents / 100).toFixed(2)}`)
  }

  // Blind sheet: per round, randomize which arm is "A" vs "B" (seeded, reproducible from the key).
  let seed = 987654
  const coin = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff < 0.5 }
  const key: Array<{ round: number; left: 'gpt4o' | 'claude'; right: 'gpt4o' | 'claude' }> = []
  const lines: string[] = [
    `# Blind Taglish writer A/B — ${channel.name} (${entries.length} pairs)`,
    '',
    'Each pair is the SAME story idea, written by two different models. For each, mark which reads as more',
    'natural, believable spoken Taglish (A, B, or "tie"). Do NOT open the key until every pair is marked.',
    '',
  ]
  entries.forEach((e, idx) => {
    const swap = coin()
    const left = swap ? 'claude' : 'gpt4o'
    const right = swap ? 'gpt4o' : 'claude'
    key.push({ round: e.round, left, right })
    lines.push(`## Pair ${idx + 1} — ${e.logline}`)
    lines.push('', '### A', '', e[left], '', '### B', '', e[right], '', 'More natural (A / B / tie): ____', '', '---', '')
  })

  const outDir = join(process.cwd(), 'scripts', 'ab-out')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const blindPath = join(outDir, `taglish-ab-${stamp}-blind.md`)
  writeFileSync(blindPath, lines.join('\n'))
  writeFileSync(join(outDir, `taglish-ab-${stamp}-key.json`), JSON.stringify(key.map((k, i) => ({ pair: i + 1, ...k })), null, 2))
  // Durable raw (both narrations + arm) so scoring never needs a re-run.
  writeFileSync(join(outDir, `taglish-ab-${stamp}-raw.json`), JSON.stringify(entries, null, 2))

  console.log(`\nDONE — total cost $${(totalCents / 100).toFixed(2)}`)
  console.log(`blind pairs: ${blindPath}`)
  console.log(`key (open AFTER marking): ${join(outDir, `taglish-ab-${stamp}-key.json`)}`)
  process.exit(0)
})()
