// W4 verification — the precedence stack, asserted rather than assumed.
//
// Source Policy is NARRATIVE permission. The depictive-ethics floor is DEPICTION law and sits above it.
// The failure this guards against is someone six months from now reading `sourcePolicy` as the
// authoritative permission layer and adding increasingly permissive values to it. So: set the MOST
// permissive policy the type allows and prove the floor still holds at that setting.
//
// Deliberately checks the prompts themselves, not a rendered image: the floor is enforced by what the
// scene director is ALLOWED TO WRITE (scenes.v1 core rules) and by the image-QA checklist. If the floor
// text disappears from the brief, no amount of downstream QA can put it back.
import '../src/env.js'
void (async () => {
  const { SourcePolicySchema, requiresRealSubjects } = await import('@reels/core')
  const { buildStoryPlannerPrompt } = await import('../src/prompts-bridge.js')
  const { buildScenesPrompt } = await import('@reels/core/prompts/scenes.v1')

  const MAX = SourcePolicySchema.parse({
    realPlaces: true, realEvents: true, realPeople: 'public_figures', evidenceRequired: true, invention: 'none',
  })
  const MIN = SourcePolicySchema.parse({})
  let fail = 0
  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ← ${detail}`}`)
    if (!ok) fail++
  }

  console.log('\nPRECEDENCE: the floor outranks the policy')
  const planner = (p: unknown) => buildStoryPlannerPrompt({
    channelName: 'T', nicheDescription: 'tech news about real companies', toneConfig: '{}',
    worldBibleJson: '{}', genreCategory: 'informational', targetSeconds: 75,
    angleDirective: 'x', avoidList: '', rejectionAvoidList: '', sourcePolicy: p as never,
  } as never).system

  const maxG = planner(MAX)
  const minG = planner(MIN)
  // The policy MUST move the guard (else the dimension does nothing)…
  check('permissive policy actually relaxes the places guard', maxG.includes('real places may be named accurately'))
  check('default policy still fictionalizes places', minG.includes('fictionalize specific real places'))
  check('permissive policy allows naming public figures', maxG.includes('may be NAMED'))
  // …but must NEVER remove the invariants.
  for (const [label, clause] of [
    ['no invented wrongdoing attributed to real parties', 'never placed in invented scenes'],
    ['no graphic content', 'no graphic gore or sexual content'],
    ['no harm to minors', 'never harm to minors'],
    ['original work only', 'original work only'],
  ] as const) {
    check(`MOST PERMISSIVE policy still carries: ${label}`, maxG.includes(clause), `missing "${clause}"`)
  }

  console.log('\nDEPICTION FLOOR: unreachable from policy')
  const scenes: { system: string; userMessage: string } = buildScenesPrompt({
    bibleEntitiesJson: '[]',
    era: 'present day',
    regionDescriptor: 'global',
    nicheDescription: 'tech news about real companies and their executives',
    genreCategory: 'informational',
    narration: 'A named real executive announced the deal on stage that morning.',
    minScenes: 3,
    maxScenes: 5,
    peakMoment: '',
  } as never)
  // Check the WHOLE brief, not just `system`: the core-rules block lives in the user message, and a
  // check that only read `system` reported the floor missing when it was there all along.
  const sceneBrief = `${scenes.system}\n${scenes.userMessage}`
  check('scene brief carries REAL PARTIES ARE NEVER STAGED', sceneBrief.includes('REAL PARTIES ARE NEVER STAGED'))
  check('scene brief keeps the identity-not-people trigger', sceneBrief.includes('triggers on IDENTITY, not on people'))
  check('floor is unconditional (no policy input to buildScenesPrompt)', !/sourcePolicy/.test(buildScenesPrompt.toString()))

  // The pixel side of the same floor. Built, not stringified from the module object — a JSON.stringify
  // of the exports would have inspected function *names*, not the prompt text, and quietly passed.
  const { buildImageQAPrompt } = await import('@reels/core/prompts/image-qa.v1')
  const qaPrompt = buildImageQAPrompt({
    brief: 'A named real executive on stage announcing a deal', aspect: '9:16',
  } as never) as { system: string; userMessage: string }
  const qaText = `${qaPrompt.system}\n${qaPrompt.userMessage}`
  check('image-QA still carries the pixel-side REAL-PARTY check', qaText.includes('REAL-PARTY FABRICATION'))

  console.log('\nrequiresRealSubjects')
  check('permissive → real subjects required', requiresRealSubjects(MAX))
  check('pure fiction → not required', !requiresRealSubjects(MIN))

  console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
  process.exit(fail === 0 ? 0 : 1)
})()
