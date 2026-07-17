// Mixed-genre probe: comedy-DOMINANT channel with a horror subject in the niche text.
// Question: does single-dominant genre + niche context carry the blend, or does the secondary flavor die?
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const { buildStoryPlannerPrompt, StoryPlanSchema, buildStoryWriterPrompt, defaultAudienceDescriptor, STORY_PLANNER_V1_VERSION, STORY_V2_VERSION } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')
  const niche = 'Funny ghost stories — paranormal encounters played for laughs: hauntings gone wrong, unimpressed narrators, spirits with petty grudges. The scare is real for a beat, then the punchline lands.'
  let total = 0
  for (let i = 0; i < 2; i++) {
    const angle = selectAngles(1, i * 5 + 2)[0]!
    const p = buildStoryPlannerPrompt({
      channelName: 'Multo Moments', nicheDescription: niche,
      toneConfig: JSON.stringify({ intensity: 6, warmth: 6, energy: 7, pacing: 6, humor: 9 }),
      worldBibleJson: JSON.stringify({ region: 'Philippines', era: 'present day' }),
      genreCategory: 'comedy', targetSeconds: 75, angleDirective: angle.directive,
      avoidList: '', rejectionAvoidList: '', regenerationNonce: i,
    })
    const plan = await llmCall({ templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema, system: p.system, messages: [{ role: 'user', content: p.userMessage }], temperature: 1.0, maxTokens: 1500 })
    total += plan.costCents
    const w = buildStoryWriterPrompt({
      channelName: 'Multo Moments', nicheDescription: niche,
      toneConfig: JSON.stringify({ intensity: 6, warmth: 6, energy: 7, pacing: 6, humor: 9 }),
      language: 'taglish', audienceDescriptor: defaultAudienceDescriptor('taglish'),
      worldBibleJson: JSON.stringify({ region: 'Philippines', era: 'present day' }),
      fewshotStories: '(no reference stories yet — write in the channel voice)',
      targetSeconds: 75, targetWords: 190, genreCategory: 'comedy',
      plan: { premise: plan.data.premise, conflict: plan.data.conflict, escalation: plan.data.escalation, twist: plan.data.twist, ending: plan.data.ending, emotionalDestination: plan.data.emotionalDestination },
      register: plan.data.elements.register,
    })
    const story = await llmCall({ templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system: w.system, messages: [{ role: 'user', content: w.userMessage }], temperature: 1.0, maxTokens: 4096 })
    total += story.costCents
    console.log(`\n═══ [MIXED ${i + 1}/2] "${story.data.title}" · register: ${plan.data.elements.register ?? '—'}`)
    console.log(story.data.narration)
  }
  console.log(`\ncost: ${total}¢`)
  process.exit(0)
})()
