// Taglish polish probe (2026-07-17): the parity probe showed garbled Taglish in RAW Writer output
// ("uma-apir", nonsense note lines) — but it skipped the three stages built to catch exactly that.
// This runs the FULL production chain (Planner → Writer → Editor → Naturalizer → Claude gate) on
// Taglish channels, no DB writes, printing every stage's text. Question it answers: does garbled
// Taglish survive to the gate, and does the gate catch what survives?
// Cost: ~25-35¢. Usage: tsx scripts/probe-taglish-polish.ts
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    buildStoryWriterPrompt,
    buildStoryEditorPrompt,
    StoryEditSchema,
    buildStoryNaturalizerPrompt,
    StoryNaturalizeSchema,
    buildStoryGatePrompt,
    StoryGateSchema,
    defaultTasteRubric,
    defaultAudienceDescriptor,
    STORY_PLANNER_V1_VERSION,
    STORY_V2_VERSION,
    STORY_EDITOR_V1_VERSION,
    STORY_NATURALIZER_V1_VERSION,
    STORY_CRITIC_V2_VERSION,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')

  const PH_BIBLE = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  const CHANNELS = [
    {
      name: 'Gabi ng Lagim',
      niche: 'Filipino horror — first-person kwentong nakakatakot from ordinary places: apartments, commutes, night shifts, the province',
      genre: 'horror',
      hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
      runs: 2,
    },
    {
      name: 'Hindi Ko Nasabi',
      niche: 'Filipino family drama — the things we never say to the people we love, told first-person',
      genre: 'drama',
      hookHint: 'an emotional hook in the first 2s — a line that makes you stay',
      runs: 1,
    },
  ]

  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  let totalCost = 0

  for (const ch of CHANNELS) {
    for (let i = 0; i < ch.runs; i++) {
      const angle = selectAngles(1, i * 5 + 2)[0]!
      const plannerPrompt = buildStoryPlannerPrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        toneConfig: JSON.stringify({ intensity: 7, warmth: 4, energy: 5, pacing: 5, humor: 2 }),
        worldBibleJson: PH_BIBLE,
        genreCategory: ch.genre,
        targetSeconds: 75,
        angleDirective: angle.directive,
        avoidList: '',
        rejectionAvoidList: '',
        regenerationNonce: i,
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
        language: 'taglish',
        audienceDescriptor: defaultAudienceDescriptor('taglish'),
        worldBibleJson: PH_BIBLE,
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

      // Editor pass (production tolerance ±25%)
      let narration = story.data.narration
      let peakMoment = story.data.peakMoment
      let editorStatus = 'ok'
      try {
        const ep = buildStoryEditorPrompt({
          nicheDescription: ch.niche,
          genreCategory: ch.genre,
          language: 'taglish',
          audienceDescriptor: defaultAudienceDescriptor('taglish'),
          narration,
          peakMoment,
          emotionalDestination: plan.data.emotionalDestination,
          canonicalNames: [],
          targetWords: 190,
        })
        const er = await llmCall({
          templateVersion: STORY_EDITOR_V1_VERSION,
          schema: StoryEditSchema,
          system: ep.system,
          messages: [{ role: 'user', content: ep.userMessage }],
          temperature: 0.4,
          maxTokens: 4096,
        })
        totalCost += er.costCents
        const dw = Math.abs(wordCount(er.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        if (dw > 0.25) editorStatus = `discarded_wordcount (${Math.round(dw * 100)}%)`
        else if (!er.data.narration.includes(er.data.peakMoment.trim())) editorStatus = 'discarded_peak'
        else ({ narration, peakMoment } = er.data)
      } catch (err) {
        editorStatus = `failed: ${String(err).slice(0, 80)}`
      }
      const editedNarration = narration

      // Naturalizer pass (production tolerance ±15%)
      let naturalizerStatus = 'ok'
      try {
        const np = buildStoryNaturalizerPrompt({
          language: 'taglish',
          audienceDescriptor: defaultAudienceDescriptor('taglish'),
          narration,
          peakMoment,
        })
        const nr = await llmCall({
          templateVersion: STORY_NATURALIZER_V1_VERSION,
          schema: StoryNaturalizeSchema,
          system: np.system,
          messages: [{ role: 'user', content: np.userMessage }],
          provider: 'anthropic', // mirrors production: the naturalizer runs on Claude (2026-07-17)
          temperature: 0.4,
          maxTokens: 4096,
        })
        totalCost += nr.costCents
        const dw = Math.abs(wordCount(nr.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        if (dw > 0.15) naturalizerStatus = `discarded_wordcount (${Math.round(dw * 100)}%)`
        else if (!nr.data.narration.includes(nr.data.peakMoment.trim())) naturalizerStatus = 'discarded_peak'
        else ({ narration, peakMoment } = nr.data)
      } catch (err) {
        naturalizerStatus = `failed: ${String(err).slice(0, 80)}`
      }

      // Gate (Claude) — verdict only; no rewrite loop in the probe.
      let gateLine = '(gate unavailable)'
      try {
        const gp = buildStoryGatePrompt({
          channelName: ch.name,
          nicheDescription: ch.niche,
          language: 'taglish',
          tasteRubric: defaultTasteRubric(ch.genre, ch.niche),
          narration,
          title: story.data.title,
          logline: story.data.logline,
        })
        const gr = await llmCall({
          templateVersion: STORY_CRITIC_V2_VERSION,
          schema: StoryGateSchema,
          system: gp.system,
          messages: [{ role: 'user', content: gp.userMessage }],
          provider: 'anthropic',
          maxTokens: 512,
        })
        totalCost += gr.costCents
        gateLine = `${gr.data.pass ? 'PASS' : 'FAIL'} — ${gr.data.reason}`
      } catch (err) {
        gateLine = `gate errored: ${String(err).slice(0, 120)}`
      }

      console.log(`\n${'═'.repeat(70)}\n[${ch.genre.toUpperCase()} ${i + 1}/${ch.runs} · ${ch.name}] "${story.data.title}"  register=${plan.data.elements.register ?? '-'}`)
      console.log(`\n── RAW (writer) ──────────────────────────────────────────\n${story.data.narration}`)
      console.log(`\n── EDITED (editor: ${editorStatus}) ──────────────────────\n${editedNarration === story.data.narration ? '(unchanged)' : editedNarration}`)
      console.log(`\n── FINAL (naturalizer: ${naturalizerStatus}) ─────────────\n${narration === editedNarration ? '(unchanged)' : narration}`)
      console.log(`\n── GATE ── ${gateLine}`)
    }
  }
  console.log(`\n${'═'.repeat(70)}\ntotal probe cost: ${totalCost}¢`)
  process.exit(0)
})()
