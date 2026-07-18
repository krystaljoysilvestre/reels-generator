// Genre-parity probe (culture-neutral assets validation, 2026-07-17): run Planner → Writer on fake
// channels, no DB writes. What it checks after elements.v1.3/identities.v4/mechanics.v1.2:
//  - horror (Taglish, 3): registers vary beyond quiet dread; Filipino texture still emerges from
//    niche/language/world-bible even though the shared palettes are now culture-neutral
//  - drama (Taglish, 2): the new confrontation/bittersweet mechanics get used; wounds are reel-sized
//  - comedy (English/US, 1): new comedy structures; NO Filipino texture leaks into a non-Filipino channel
//  - informational (English, 1): truth stance holds, no fake protagonist
// Cost: ~15-20¢ total. Usage: tsx scripts/probe-parity.ts
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

  const PH_BIBLE = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  const US_BIBLE = JSON.stringify({ region: 'a mid-size American city', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })

  const CHANNELS = [
    {
      name: 'Gabi ng Lagim',
      niche: 'Filipino horror — first-person kwentong nakakatakot from ordinary places: apartments, commutes, night shifts, the province',
      genre: 'horror',
      language: 'taglish',
      worldBible: PH_BIBLE,
      hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
      runs: 3,
    },
    {
      name: 'Hindi Ko Nasabi',
      niche: 'Filipino family drama — the things we never say to the people we love, told first-person',
      genre: 'drama',
      language: 'taglish',
      worldBible: PH_BIBLE,
      hookHint: 'an emotional hook in the first 2s — a line that makes you stay',
      runs: 2,
    },
    {
      name: 'It Got Worse',
      niche: 'everyday disaster comedy — true-feeling stories of small plans going catastrophically, hilariously wrong',
      genre: 'comedy',
      language: 'english',
      worldBible: US_BIBLE,
      hookHint: 'a deadpan or absurd first line that promises chaos',
      runs: 1,
    },
    {
      name: 'Money Unlocked',
      niche: 'personal finance explained simply — the mechanics behind money most people never learn',
      genre: 'informational',
      language: 'english',
      worldBible: US_BIBLE,
      hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
      runs: 1,
    },
  ]

  let totalCost = 0
  for (const ch of CHANNELS) {
    for (let i = 0; i < ch.runs; i++) {
      const angle = selectAngles(1, i * 3 + 1)[0]!
      const plannerPrompt = buildStoryPlannerPrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        toneConfig: JSON.stringify({ intensity: 7, warmth: 4, energy: 5, pacing: 5, humor: 2 }),
        worldBibleJson: ch.worldBible,
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
        worldBibleJson: ch.worldBible,
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

      const el = plan.data.elements
      console.log(`\n${'═'.repeat(70)}\n[${ch.genre.toUpperCase()} ${i + 1}/${ch.runs} · ${ch.name}] "${story.data.title}"`)
      console.log(`  REGISTER:   ${el.register ?? '(none committed)'}`)
      console.log(`  ELEMENTS:   structure=${el.structure} | setting=${el.setting} | role=${el.role} | trigger=${el.trigger}`)
      console.log(`  MECHANICS:  ${plan.data.mechanics.join(', ') || '(none)'}`)
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
