// Drama-attractor experiment (2026-07-18) — falsify: "the drama monoculture is planner selection,
// not channel DNA." PLANNER-ONLY (the hypothesis is about selection, so we don't need the writer /
// editor / gate — and running the gate would MASK the planner via its rewrite loop). Confound fix:
// the structural angle is drawn from a NEUTRAL pool that EXCLUDES `artifact` and `retold_legend`
// (those are discovery engines, already half the emotional equation), so the angle no longer imposes
// object/legend shapes. No planner or prompt changes — only the experiment changed.
//
// Usage: PROBE_NICHE="..." PROBE_NAME="..." tsx scripts/probe-drama-attractor.ts [genre] [N]
//   positional args: genre = argv[2] (default 'drama'), N = argv[3] (default 16).
// Prints N plans (premise/conflict/twist/ending + turn) so distinct EMOTIONAL EQUATIONS can be counted.
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildStoryPlannerPrompt, StoryPlanSchema, STORY_PLANNER_V1_VERSION } = await import('../src/prompts-bridge.js')
  const { STORY_ANGLES } = await import('../src/assembly-bridge.js')
  type StoryElements = Awaited<ReturnType<typeof StoryPlanSchema.parseAsync>>['elements']

  const genre = process.argv[2] ?? 'drama'
  const N = Number(process.argv[3] ?? 16)
  const name = process.env.PROBE_NAME ?? `${genre} channel`
  const niche = process.env.PROBE_NICHE ?? 'Filipino family drama — the things we never say to the people we love, told first-person'
  // Neutral structural angles only — drop the two discovery engines that pre-bias the equation.
  const NEUTRAL = STORY_ANGLES.filter((a) => a.id !== 'artifact' && a.id !== 'retold_legend')

  console.log(`⚗ PLANNER-ONLY PROBE — genre=${genre}, neutral angles, N=${N}\n   channel: "${name}"\n   DNA: ${niche}\n`)

  const recentEls: StoryElements[] = []
  const recentLoglines: string[] = []
  let totalCost = 0

  for (let i = 0; i < N; i++) {
    // Rotate through neutral angles (deterministic spread, no artifact/legend bias).
    const angle = NEUTRAL[i % NEUTRAL.length]!
    const { system, userMessage } = buildStoryPlannerPrompt({
      channelName: name,
      nicheDescription: niche,
      toneConfig: JSON.stringify({ intensity: 7, warmth: 5, energy: 5, pacing: 5, humor: 3 }),
      worldBibleJson: JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} }),
      genreCategory: genre,
      targetSeconds: 75,
      angleDirective: angle.directive,
      avoidList: recentLoglines.join('\n'),
      rejectionAvoidList: '',
      regenerationNonce: i,
      recentElements: recentEls,
    })
    try {
      const res = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION,
        schema: StoryPlanSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 1.0,
        maxTokens: 1500,
      })
      totalCost += res.costCents
      const p = res.data
      recentEls.push(p.elements)
      if (p.logline) recentLoglines.push(p.logline)
      console.log(`${'─'.repeat(72)}`)
      console.log(`[${String(i + 1).padStart(2)}] angle=${angle.id} · register=${p.elements.register ?? '-'}`)
      console.log(`  premise:   ${p.premise}`)
      console.log(`  conflict:  ${p.conflict}`)
      console.log(`  twist:     ${p.twist}`)
      console.log(`  ending:    ${p.ending}`)
      console.log(`  turn=${p.elements.turn} | anchor=${p.elements.anchor ?? '-'} | role=${p.elements.role}`)
    } catch (err) {
      console.log(`[${i + 1}] PLAN FAILED: ${String(err).slice(0, 120)}`)
    }
  }
  console.log(`\n${'═'.repeat(72)}\nplans: ${recentEls.length}/${N} · cost: ${totalCost}¢`)
  process.exit(0)
})()
