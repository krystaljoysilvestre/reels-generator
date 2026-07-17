// Register probe (genre-flavor validation, 2026-07-17): run Planner → Writer on fake channels,
// no DB writes — 3 horror stories (do registers vary? does escalation carry choices-with-costs?)
// and 2 informational (does the question-arc translation hold — no fake protagonists?).
// Cost: ~5-10¢ total. Usage: tsx scripts/probe-registers.ts
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    buildStoryWriterPrompt,
    defaultAudienceDescriptor,
    STORY_PLANNER_V1_VERSION,
    STORY_V2_VERSION,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')

  const CHANNELS = [
    {
      name: 'Gabi ng Lagim',
      niche: 'Filipino horror — first-person kwentong nakakatakot from ordinary places: apartments, jeepneys, night shifts, the province',
      genre: 'horror',
      language: 'taglish',
      hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
      runs: 3,
    },
    {
      name: 'Money Unlocked',
      niche: 'personal finance explained simply — the mechanics behind money most people never learn',
      genre: 'informational',
      language: 'english',
      hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
      runs: 2,
    },
  ]

  const worldBible = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  let totalCost = 0

  for (const ch of CHANNELS) {
    for (let i = 0; i < ch.runs; i++) {
      const angle = selectAngles(1, i * 3 + 1)[0]!
      const plannerPrompt = buildStoryPlannerPrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        toneConfig: JSON.stringify({ intensity: 7, warmth: 4, energy: 5, pacing: 5, humor: 2 }),
        worldBibleJson: worldBible,
        genreCategory: ch.genre,
        targetSeconds: 75,
        angleDirective: angle.directive,
        avoidList: '',
        rejectionAvoidList: '',
        regenerationNonce: i, // varies the prompt so each run explores fresh
      })
      const plan = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION,
        schema: StoryPlanSchema,
        system: plannerPrompt.system,
        messages: [{ role: 'user', content: plannerPrompt.userMessage }],
        temperature: 1.0,
        maxTokens: 1500,
      })
      totalCost += plan.costCents

      const writerPrompt = buildStoryWriterPrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        toneConfig: JSON.stringify({ intensity: 7, warmth: 4, energy: 5, pacing: 5, humor: 2 }),
        language: ch.language,
        audienceDescriptor: defaultAudienceDescriptor(ch.language),
        worldBibleJson: worldBible,
        fewshotStories: '(no reference stories yet — write in the channel voice)',
        targetSeconds: 75,
        targetWords: 190,
        genreCategory: ch.genre,
        plan: {
          premise: plan.data.premise,
          conflict: plan.data.conflict,
          escalation: plan.data.escalation,
          twist: plan.data.twist,
          ending: plan.data.ending,
          emotionalDestination: plan.data.emotionalDestination,
        },
        register: plan.data.elements.register,
        platformHookHint: ch.hookHint,
      })
      const story = await llmCall({
        templateVersion: STORY_V2_VERSION,
        schema: StoryOutputSchema,
        system: writerPrompt.system,
        messages: [{ role: 'user', content: writerPrompt.userMessage }],
        temperature: 1.0,
        maxTokens: 4096,
      })
      totalCost += story.costCents

      console.log(`\n${'═'.repeat(70)}\n[${ch.genre.toUpperCase()} ${i + 1}/${ch.runs}] "${story.data.title}"`)
      console.log(`  REGISTER:   ${plan.data.elements.register ?? '(none committed)'}`)
      console.log(`  CONFLICT:   ${plan.data.conflict}`)
      console.log(`  ESCALATION: ${plan.data.escalation}`)
      console.log(`  TWIST:      ${plan.data.twist}`)
      console.log(`  ENDING:     ${plan.data.ending}`)
      console.log(`${'─'.repeat(70)}\n${story.data.narration}`)
    }
  }
  console.log(`\n${'═'.repeat(70)}\ntotal probe cost: ${totalCost}¢`)
  process.exit(0)
})()
