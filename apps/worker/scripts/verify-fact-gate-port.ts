// Fact-gate PORT verification (2026-08-04) — proves the code path ported from feat/standalone-fact-gate
// still catches injected errors when run against today's main. Exercises EXACTLY what the inline gate in
// generate-story.ts does (same bridge imports, same builders, same schemas, same order: extractor(dossier)
// → fidelity(narration)), on a SYNTHETIC case so training knowledge can't answer for the source.
//
// Injected into the "corrupted" narration (mirrors the shapes ffc-causal-probe validated):
//   E1 SCALAR — the span is 214 m in the dossier, narration says 500 m.
//   E2 CAUSAL — dossier: gusset plates failed from galvanic corrosion (dissimilar-metal retrofit);
//               narration claims metal fatigue from traffic vibration.
//   E3 STANCE — dossier marks sabotage strictly as an ALLEGATION a tabloid made (disputed);
//               narration states it as established fact.
//
// PASS BAR: faithful narration → 0 issues; corrupted narration → all three injected errors flagged.
// Cost: 4 calls ≈ $0.10–0.30 (extractor ×2 rounds is avoided: one extraction reused for both narrations).
//
// Usage: pnpm --filter worker exec tsx scripts/verify-fact-gate-port.ts
import '../src/env.js'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const {
    buildEbnExtractorPrompt,
    STORY_EBN_EXTRACTOR_V1_VERSION,
    EvidenceBibleSchema,
    buildEbnFidelityPrompt,
    STORY_EBN_FIDELITY_V1_VERSION,
    EbnFidelitySchema,
  } = await import('../src/prompts-bridge.js')

  let cost = 0

  const DOSSIER = `The Alderpoint Crossing footbridge (fictional case study, internal engineering review, 2019).
Built 1987 over the Marrow River gorge; main span 214 metres. In 2011 the original carbon-steel gusset
plates were retrofitted with stainless-steel fasteners as a cost-saving substitution. The 2019 review
concluded the plates failed by GALVANIC CORROSION at the dissimilar-metal joints — the stainless fasteners
and carbon-steel plates formed corrosion cells accelerated by road-salt runoff. The review EXPLICITLY RULED
OUT metal fatigue: strain-gauge records showed cyclic loads well under the fatigue threshold. A local
tabloid, the Marrow Valley Courier, ALLEGED the collapse was sabotage by a disgruntled former contractor;
the review found no physical evidence for this and the police closed the inquiry without charges — the
sabotage claim remains an unsubstantiated allegation the review lists only to dismiss.`

  const FAITHFUL = `The Alderpoint Crossing stretched two hundred and fourteen metres over the Marrow River gorge. For
twenty-four years it held. Then, in 2011, someone saved money: stainless fasteners bolted into
carbon-steel plates. Two metals, one joint, and every winter the road salt washed down into it. The 2019
review named the killer plainly — galvanic corrosion, eating the joints from inside. Not fatigue; the
strain gauges proved the loads never came close. A tabloid cried sabotage, but the review found nothing
behind it, and the police closed the file.`

  const CORRUPTED = `The Alderpoint Crossing stretched five hundred metres over the Marrow River gorge. For twenty-four
years it held — until the traffic itself shook it apart. The 2019 review traced the collapse to metal
fatigue: years of cyclic loads from heavy vehicles worked cracks through the gusset plates until they
gave way. And beneath the engineering there was a darker truth — the collapse was an act of sabotage by
a disgruntled former contractor, as the Marrow Valley Courier established.`

  // 1. Extract — exactly as the inline gate does.
  const ex = buildEbnExtractorPrompt({ dossier: DOSSIER })
  const exRes = await llmCall({
    templateVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
    schema: EvidenceBibleSchema,
    system: ex.system,
    messages: [{ role: 'user', content: ex.userMessage }],
    provider: 'anthropic',
    maxTokens: 4096,
  })
  cost += exRes.costCents
  const facts = exRes.data.facts
  console.log(`extracted ${facts.length} facts (${exRes.costCents}¢)`)

  // 2. Fidelity on both narrations — same call shape as the inline gate.
  const check = async (label: string, narration: string) => {
    const ff = buildEbnFidelityPrompt({
      facts: facts.map((f) => ({ id: f.id, stance: f.stance, weight: f.weight, value: f.value, attributed_to: f.attributed_to })),
      criticalIds: facts.filter((f) => f.weight === 'Critical').map((f) => f.id),
      narration,
    })
    const res = await llmCall({
      templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
      schema: EbnFidelitySchema,
      system: ff.system,
      messages: [{ role: 'user', content: ff.userMessage }],
      provider: 'anthropic',
      maxTokens: 2048,
    })
    cost += res.costCents
    console.log(`\n${label} → ${res.data.issues.length} issue(s) (${res.costCents}¢)`)
    for (const i of res.data.issues) console.log(`  [${i.axis}] ${i.detail} — “${i.offending}”`)
    return res.data.issues
  }

  const faithfulIssues = await check('FAITHFUL', FAITHFUL)
  const corruptedIssues = await check('CORRUPTED (E1 scalar 500m, E2 causal fatigue, E3 stance sabotage-as-fact)', CORRUPTED)

  const text = JSON.stringify(corruptedIssues).toLowerCase()
  const caught = {
    scalar: /500|five hundred|214|span|metre|length/.test(text),
    causal: /fatigue|corrosion|galvanic|cause/.test(text),
    stance: /sabotage|alleg|contractor|courier/.test(text),
  }
  console.log(`\n=== VERDICT (total ${cost}¢) ===`)
  console.log(`faithful clean: ${faithfulIssues.length === 0 ? 'PASS' : `FAIL — ${faithfulIssues.length} false flag(s)`}`)
  console.log(`E1 scalar caught: ${caught.scalar ? 'PASS' : 'FAIL'}`)
  console.log(`E2 causal caught: ${caught.causal ? 'PASS' : 'FAIL'}`)
  console.log(`E3 stance caught: ${caught.stance ? 'PASS' : 'FAIL'}`)
  const pass = faithfulIssues.length === 0 && caught.scalar && caught.causal && caught.stance
  console.log(pass ? '\nPORT VERIFIED — the inline gate path catches all injected errors.' : '\nPORT NOT VERIFIED — inspect above.')
  process.exit(pass ? 0 : 1)
})()
