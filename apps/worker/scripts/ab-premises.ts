// Blind premise A/B — resolves the studio pivot's biggest open hypothesis (2026-07-15 plan):
// does the Planner's INTERNAL idea exploration match legacy best-of-6 prose sampling on premise
// quality? Arm A = story-planner.v1 (one committed idea per round). Arm B = legacy: 6 story.v1
// drafts + ranking critic, premise = the winner's logline (exactly the production legacy path).
//
// Output: a BLIND markdown sheet (shuffled, unlabeled) for the owner to score, plus a key file to
// open only AFTER scoring. Planner wins or ties → delete the legacy path; loses → premise sampling
// returns WITH evidence.
//
// Usage: pnpm --filter worker exec tsx scripts/ab-premises.ts <channelId> [rounds=25]
// Cost: ~13–15¢ per round (arm B dominates: 6 full drafts + critic). 25 rounds ≈ $3.50.
import '../src/env.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

void (async () => {
  const [channelId, roundsArg] = process.argv.slice(2)
  if (!channelId) { console.error('usage: ab-premises <channelId> [rounds=25]'); process.exit(1) }
  const rounds = Math.max(1, Number(roundsArg ?? 25))

  const { getDb, channels, stories } = await import('@reels/db')
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema, WorldBibleSchema, ToneConfigSchema } = await import('@reels/core')
  const { buildStoryPrompt, STORY_V1_VERSION } = await import('@reels/core/prompts/story.v1')
  const { buildStoryCriticPrompt, StoryCriticSchema, STORY_CRITIC_V1_VERSION, DEFAULT_TASTE_RUBRIC } = await import('@reels/core/prompts/story-critic.v1')
  const { buildStoryPlannerPrompt, StoryPlanSchema, STORY_PLANNER_V1_VERSION } = await import('@reels/core/prompts/story-planner.v1')
  const { selectAngles } = await import('@reels/core/assembly/story-angles')
  const { selectFewShot, formatFewShot } = await import('@reels/core/assembly/fewshot')
  const { eq, and, desc } = await import('drizzle-orm')
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) { console.error('channel not found'); process.exit(1) }
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const toneConfig = ToneConfigSchema.parse(channel.toneConfig)
  const targetSeconds = channel.targetSeconds ?? 75
  const targetWords = Math.round(targetSeconds * 2.5)
  const storyMaxTokens = Math.min(16384, Math.max(4096, targetWords * 4))

  // Same inputs both arms see in production: few-shots + the recent-premises avoid-list.
  const refStories = await db.query.stories.findMany({
    where: and(eq(stories.channelId, channelId), eq(stories.isReference, true)),
    orderBy: [desc(stories.performanceScore)], limit: 20,
  })
  const fewshotStories = formatFewShot(selectFewShot(
    refStories.map((s) => ({ title: s.title, narration: s.body, subgenreTags: s.subgenreTags, performanceScore: s.performanceScore, createdAt: s.createdAt })),
    [], 5,
  ))
  const recent = await db.query.stories.findMany({
    where: eq(stories.channelId, channelId), orderBy: [desc(stories.createdAt)], limit: 15,
    columns: { title: true, logline: true, subgenreTags: true },
  })
  const avoidList = recent
    .map((s) => `- "${s.title}"${s.logline ? ` — ${s.logline}` : ''}${s.subgenreTags?.length ? ` [${s.subgenreTags.join(', ')}]` : ''}`)
    .join('\n')
  const tasteRubric = channel.tasteRubric?.trim() || DEFAULT_TASTE_RUBRIC

  const base = {
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    toneConfig: JSON.stringify(toneConfig),
    language,
    audienceDescriptor: 'young Filipino adult',
    worldBibleJson: JSON.stringify(worldBible, null, 2),
    fewshotStories,
    targetSeconds,
    targetWords,
    rejectionAvoidList: '',
    operatorFeedback: undefined,
  }

  let totalCents = 0
  const entries: Array<{ arm: 'planner' | 'bestofn'; round: number; premise: string; logline: string }> = []

  for (let i = 0; i < rounds; i++) {
    // ── Arm A: planner (nonce = round → the angle seed rotates like regenerations do) ──
    try {
      const p = buildStoryPlannerPrompt({
        channelName: channel.name, nicheDescription: channel.nicheDescription,
        toneConfig: base.toneConfig, worldBibleJson: base.worldBibleJson,
        genreCategory: channel.genreCategory ?? undefined, targetSeconds,
        angleDirective: selectAngles(1, i, undefined)[0]!.directive,
        avoidList, rejectionAvoidList: '', regenerationNonce: i,
      })
      const res = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema,
        system: p.system, messages: [{ role: 'user', content: p.userMessage }],
        temperature: 1.0, maxTokens: 1500,
      })
      totalCents += res.costCents
      entries.push({ arm: 'planner', round: i, premise: res.data.premise, logline: res.data.logline })
    } catch (e) { console.warn(`round ${i} planner failed: ${String(e)}`) }

    // ── Arm B: legacy best-of-6 + ranking critic → winner's logline ──
    try {
      const angles = selectAngles(6, i, undefined)
      const { system } = buildStoryPrompt({ ...base, regenerationNonce: i })
      const settled = await Promise.allSettled(angles.map((angle) =>
        llmCall({
          templateVersion: STORY_V1_VERSION, schema: StoryOutputSchema, system,
          messages: [{ role: 'user', content: buildStoryPrompt({ ...base, regenerationNonce: i, angleDirective: angle.directive }).userMessage }],
          temperature: 1.0, maxTokens: storyMaxTokens,
        }),
      ))
      const cands = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
      for (const c of cands) totalCents += c.costCents
      if (cands.length === 0) throw new Error('all drafts failed')
      let winner = cands[0]!.data
      if (cands.length > 1) {
        const labels = ['A', 'B', 'C', 'D', 'E', 'F']
        const block = cands.map((c, j) => `--- CANDIDATE ${labels[j]} ---\nTitle: ${c.data.title}\nLogline: ${c.data.logline}\nNarration:\n${c.data.narration}`).join('\n\n')
        const cp = buildStoryCriticPrompt({
          channelName: channel.name, nicheDescription: channel.nicheDescription,
          tasteRubric, targetSeconds, candidatesBlock: block,
        })
        const cr = await llmCall({
          templateVersion: STORY_CRITIC_V1_VERSION, schema: StoryCriticSchema,
          system: cp.system, messages: [{ role: 'user', content: cp.userMessage }],
          provider: 'anthropic', maxTokens: 2048,
        })
        totalCents += cr.costCents
        const idx = labels.indexOf(cr.data.winnerLabel.trim().toUpperCase())
        if (idx >= 0 && idx < cands.length) winner = cands[idx]!.data
      }
      entries.push({ arm: 'bestofn', round: i, premise: winner.logline, logline: winner.logline })
    } catch (e) { console.warn(`round ${i} bestofn failed: ${String(e)}`) }

    console.log(`round ${i + 1}/${rounds} done — running cost $${(totalCents / 100).toFixed(2)}`)
  }

  // ── Blind sheet: seeded shuffle so the sheet is reproducible from the key ──
  let seed = 1234567
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const shuffled = [...entries]
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!] }

  const outDir = join(process.cwd(), 'scripts', 'ab-out')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const blindPath = join(outDir, `ab-premises-${stamp}-blind.md`)
  const keyPath = join(outDir, `ab-premises-${stamp}-key.json`)

  writeFileSync(blindPath, [
    `# Blind premise review — ${channel.name} (${entries.length} premises, ${rounds} rounds/arm)`,
    '',
    'Score each premise 1–5 on: would you greenlight this story for the channel? (freshness + pull).',
    'Do NOT open the key file until every premise is scored.',
    '',
    ...shuffled.map((e, i) => `${i + 1}. ${e.premise}\n   Score: __`),
  ].join('\n'))
  writeFileSync(keyPath, JSON.stringify(shuffled.map((e, i) => ({ n: i + 1, arm: e.arm, round: e.round })), null, 2))

  console.log(`\nDONE — total cost $${(totalCents / 100).toFixed(2)}`)
  console.log(`blind sheet: ${blindPath}`)
  console.log(`key (open AFTER scoring): ${keyPath}`)
  process.exit(0)
})()
