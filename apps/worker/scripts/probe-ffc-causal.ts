// Fact-Fidelity Checker probe — the CAUSAL-PARAPHRASE risk (2026-07-23).
//
// De-risks the single load-bearing assumption of the Evidence-Based Narrative RFC
// (specs/evidence-based-narrative.md) BEFORE building its 4-stage slice. Both the RFC and the Evidence
// Bible hypothesis flag the same sharpest risk in their own words:
//
//   "The motivating failure (Tacoma) was NOT a wrong scalar — it was a wrong causal MODEL (resonance vs.
//    aeroelastic flutter). Frozen-verbatim protection catches wrong scalars; it CANNOT cover causal
//    explanations, which must be paraphrased into prose — and checking that a paraphrase is faithful is
//    an LLM judgment call, the same class the gate just failed."
//
// THE QUESTION: does a Fact-Fidelity Checker WITH THE SOURCE IN HAND actually catch a faithful-sounding
// but WRONG causal paraphrase? If it can't, the architecture only catches wrong scalars and the
// motivating failure remains unsolved — a finding we want BEFORE building four pipeline stages.
//
// DESIGN — two cases, because the famous one has a confound:
//   TACOMA (real, famous): Claude likely KNOWS the resonance myth from training, so catching it does NOT
//     prove the SOURCE did the work. Included, but read with that caveat.
//   MERIDIAN (synthetic, obscure): a fictional failure whose true cause exists ONLY in the Evidence
//     Bible — nothing in training. This is the decisive test: catching its wrong-causal paraphrase can
//     ONLY come from the source. This isolates the architecture's value.
//
// Each narration is judged by the same inline checker under TWO conditions — WITH the Bible (the EBN
// design) and WITHOUT it (today's self-check gate, the control) — × TRIALS each, to measure reliability
// not a lucky catch. No prose is generated: the narrations are fixed, hand-authored test inputs (a
// faithful one, wrong-causal ones, a wrong-scalar one). No pipeline code, no DB writes.
//
// Usage: pnpm --filter worker exec tsx scripts/probe-ffc-causal.ts     (cwd apps/worker)
//   PROBE_TRIALS=3   → trials per (narration × condition); default 3
//
// PRE-REGISTERED SUCCESS CRITERIA (written before the run; do not move the goalposts after):
//   1. PRIMARY (catches wrong causal paraphrase): WITH-source checker FAILS the wrong-causal narrations
//      in ≥2/3 trials each. The MERIDIAN wrong-causal (no training prior) is decisive.
//   2. DISCRIMINATION (not a reject-everything checker): WITH-source checker PASSES both faithful
//      narrations in ≥2/3 trials each.
//   3. ARCHITECTURE VALUE (the source is what does it): for MERIDIAN wrong-causal, WITH-source catches it
//      but WITHOUT-source does NOT (the no-source checker cannot know the synthetic truth).
//   4. SCALAR SANITY: WITH-source catches the wrong-scalar narration (the "easy" case the RFC claims) ≥2/3.
//   FALSIFICATION: WITH-source MISSES the MERIDIAN wrong-causal in ≥2/3 ⇒ "source in hand" is NOT
//   sufficient to catch wrong causal paraphrases; the slice needs more than a free semantic check
//   (structured claim→fact citation, or the problem is genuinely open). Report BEFORE building.
//
// Cost: ~30 small checker calls ≈ $0.30–0.80. All via llmCall → exact usage cost, printed.
import '../src/env.js'
import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

void (async () => {
  const { llmCall } = await import('@reels/providers')

  const TRIALS = process.env.PROBE_TRIALS ? Math.max(1, Math.min(6, parseInt(process.env.PROBE_TRIALS, 10))) : 3
  let totalCost = 0

  // ── Evidence Bibles (the authoritative fact tables — the "source in hand") ──────────────────────────
  // TACOMA: real, hand-checked. Cause = aeroelastic (torsional) flutter, a self-exciting negatively-damped
  // oscillation — NOT simple resonance (an external periodic force matching a natural frequency). The
  // resonance account is the debunked textbook myth (Billah & Scanlan, 1991).
  const TACOMA_BIBLE = `EVIDENCE BIBLE — Tacoma Narrows Bridge collapse (authoritative; every fact below is frozen)
F001 [FACT]  Date of collapse: November 7, 1940.
F002 [FACT]  Location: the Tacoma Narrows, Washington State, USA.
F003 [FACT]  Nickname: "Galloping Gertie"; the deck had oscillated vertically since it opened (July 1, 1940).
F004 [FACT]  Wind speed at collapse: roughly 40 miles per hour (about 64 km/h) — a modest, steady wind.
F005 [FACT]  CAUSE: aeroelastic flutter — specifically a self-exciting, negatively-damped TORSIONAL (twisting)
            oscillation. The bridge deck's own twisting motion extracted energy from the steady wind and fed
            it back into an ever-growing twist. The driving energy came from the structure's own motion, not
            from an external force keeping time with the bridge.
F006 [FACT]  It was NOT simple mechanical resonance. The failure was NOT caused by a periodic external force
            whose frequency matched the bridge's natural frequency. That "resonance" explanation is a
            well-known but INCORRECT textbook account (Billah & Scanlan, 1991).
F007 [FACT]  Human casualties: none. (A dog, "Tubby", was the only fatality.)`

  // MERIDIAN: SYNTHETIC + obscure. Nothing here is in any training set — the true cause is defined ONLY
  // by this Bible, so a checker can only judge causal fidelity FROM THE SOURCE. (Deliberately fictional;
  // any resemblance to a real facility is coincidental.)
  const MERIDIAN_BIBLE = `EVIDENCE BIBLE — Meridian Flats tidal barrage generator failure (authoritative; every fact frozen)
F001 [FACT]  Date: 3 March 1987, 04:12 local time.
F002 [FACT]  Facility: the Meridian Flats tidal barrage, Caldon Estuary.
F003 [FACT]  What failed: the No. 4 bulb turbine's grid-synchronisation controller.
F004 [FACT]  CAUSE: a software race condition in the synchronisation controller. Two firmware tasks — phase
            sampling and breaker command — could execute out of order during a specific 90-millisecond window
            at slack tide. When they did, the controller closed the breaker onto the grid roughly 25 electrical
            degrees out of phase, and the resulting current surge destroyed the turbine coupling.
F005 [FACT]  It was NOT operator error and NOT mechanical wear. The two operators on duty followed the
            checklist exactly; the inquiry cleared them. The coupling itself was within service tolerances
            before the surge.
F006 [CLAIM] The manufacturer initially attributed the failure to "an operator closing the breaker manually
            too early" — an allegation the 1988 inquiry rejected. (Attributed to the manufacturer; not a fact.)
F007 [FACT]  Damage: the No. 4 coupling and stator; no injuries. Generation resumed 6 weeks later after a
            firmware fix serialised the two tasks.`

  // ── The narrations under test (fixed, hand-authored inputs) ─────────────────────────────────────────
  interface Narration { id: string; case: 'TACOMA' | 'MERIDIAN'; kind: 'faithful' | 'wrong-causal' | 'wrong-scalar'; text: string; note: string }
  const NARRATIONS: Narration[] = [
    {
      id: 'T-faithful', case: 'TACOMA', kind: 'faithful',
      note: 'Correct: aeroelastic flutter, self-exciting. Should PASS with source.',
      text: `On November 7, 1940, the Tacoma Narrows Bridge tore itself apart in a wind of only about forty miles an hour. They called it Galloping Gertie — it had rippled since the day it opened. That morning the deck began to twist, one edge lifting as the other dropped, and the twisting would not fade. It fed on itself: the bridge's own motion pulled energy out of the steady wind and pumped it back into a wider and wider twist. Engineers call it aeroelastic flutter — a self-exciting oscillation, not an outside force keeping time. The twisting grew until the deck ripped free and dropped into the water. No one died.`,
    },
    {
      id: 'T-myth-classic', case: 'TACOMA', kind: 'wrong-causal',
      note: 'The resonance MYTH, classic swing analogy. Should FAIL with source (contradicts F005/F006).',
      text: `On November 7, 1940, the Tacoma Narrows Bridge collapsed. The wind that day blew at a steady speed that happened to match the bridge's own natural frequency. Like pushing a child on a swing at exactly the right moment each time, the wind added a little more energy with every pass, and the bridge swung wider and wider. This is resonance: once the wind's rhythm locked onto the bridge's natural rhythm, the vibrations grew unstoppable until the structure shook itself to pieces.`,
    },
    {
      id: 'T-myth-technical', case: 'TACOMA', kind: 'wrong-causal',
      note: 'The resonance myth dressed in technical language (harder). Should FAIL with source.',
      text: `The Tacoma Narrows Bridge failed on November 7, 1940. A forty-mile-an-hour wind struck the deck in periodic gusts whose frequency coincided with the bridge's natural frequency of vibration. Because the driving force matched the structure's resonant frequency, each gust reinforced the last, and the amplitude of the oscillation climbed without limit until the deck failed.`,
    },
    {
      id: 'T-scalar', case: 'TACOMA', kind: 'wrong-scalar',
      note: 'Correct cause, WRONG year (1938) + state (Oregon). The easy case. Should FAIL with source.',
      text: `In 1938, the Tacoma Narrows Bridge in Oregon tore itself apart through aeroelastic flutter — a self-exciting torsional oscillation that fed on a steady wind until the deck ripped free and fell.`,
    },
    {
      id: 'M-faithful', case: 'MERIDIAN', kind: 'faithful',
      note: 'Correct: software race condition, operators cleared. Should PASS with source.',
      text: `At 4:12 in the morning on the third of March, 1987, the No. 4 turbine at the Meridian Flats tidal barrage destroyed itself. The operators had done everything right — the inquiry said so plainly. The fault was buried in the synchronisation controller's firmware: two tasks, one sampling the phase and one commanding the breaker, could run out of order in a narrow window at slack tide. That morning they did. The breaker closed onto the grid about twenty-five degrees out of phase, and the surge that followed tore the turbine coupling apart.`,
    },
    {
      id: 'M-wrong-causal', case: 'MERIDIAN', kind: 'wrong-causal',
      note: 'DECISIVE: blames operator error — the manufacturer CLAIM the inquiry rejected. No training prior; only the source (F005/F006) reveals it is wrong. Should FAIL with source; WITHOUT source cannot know.',
      text: `At 4:12 in the morning on the third of March, 1987, the No. 4 turbine at the Meridian Flats tidal barrage destroyed itself. In the dark, at slack tide, an operator closed the breaker onto the grid too early — before the phases had aligned. It was a small mistake, the kind exhaustion makes, but the current surge it let through was enough to tear the turbine coupling apart in seconds.`,
    },
  ]

  // ── The inline Fact-Fidelity Checker ('ffc.v0-probe') ───────────────────────────────────────────────
  // Mirrors the EBN RFC's Fact-Fidelity Checker intent: judge ONLY factual/causal fidelity, ignore craft.
  // Two conditions differ only by whether the Evidence Bible is supplied.
  const FfcSchema = z.object({
    faithful: z.boolean(),
    violations: z.array(z.object({
      claim: z.string(),          // the narration clause at fault
      issue: z.string(),          // added / contradicts-source / certainty-changed / wrong-scalar
      contradicts: z.string(),    // fact id if source given, else ''
    })),
    reasoning: z.string().min(1),
  })
  const checkerSystem = (bible: string | null) => `You are a FACT-FIDELITY CHECKER for evidence-based narration. You judge ONE thing: does every factual and CAUSAL claim in the narration faithfully reflect ${bible ? 'the Evidence Bible below' : 'the real world'}? You ignore prose quality, pacing, and style entirely.

Flag a violation when a claim:
- CONTRADICTS ${bible ? 'a Bible fact' : 'the established facts'} (including a wrong CAUSAL MODEL — the WRONG MECHANISM for why something happened is a violation even if it sounds plausible);
- ADDS a fact ${bible ? 'not in the Bible' : 'that is not established'};
- CHANGES CERTAINTY (states an allegation/claim as established fact, or upgrades "likely" to "certain");
- gets a scalar wrong (date, place, number, name).

The hardest and most important case: a WRONG CAUSAL EXPLANATION that is fluent and plausible. A story can get every date and name right and still be unfaithful because it explains WHY something happened using the wrong mechanism. Judge the mechanism, not just the nouns.
${bible ? `\n${bible}\n` : '\nUse your own knowledge of the real world to judge.\n'}
Set faithful=false if there is ANY factual or causal violation. Be strict about causal mechanism; be fair about paraphrase (a faithful restatement in different words is fine).`

  const runChecker = async (n: Narration, withSource: boolean): Promise<z.infer<typeof FfcSchema>> => {
    const bible = withSource ? (n.case === 'TACOMA' ? TACOMA_BIBLE : MERIDIAN_BIBLE) : null
    const res = await llmCall({
      templateVersion: 'ffc.v0-probe',
      schema: FfcSchema,
      system: checkerSystem(bible),
      messages: [{ role: 'user', content: `NARRATION:\n${n.text}\n\nReturn JSON: { "faithful": bool, "violations": [{ "claim": "", "issue": "", "contradicts": "" }], "reasoning": "one or two sentences" }` }],
      provider: 'anthropic',
      temperature: 0.3,
      maxTokens: 1024,
    })
    totalCost += res.costCents
    return res.data
  }

  // ── Run: each narration × {with-source, without-source} × TRIALS ───────────────────────────────────
  // "caught" = checker says faithful:false (correctly flags a bad narration). For faithful narrations the
  // desired outcome is faithful:true (a pass) — tracked separately as passRate.
  interface Cell { withSource: boolean; failVotes: number; sampleViolation: string; sampleReasoning: string }
  interface Row { n: Narration; cells: Cell[] }
  const rows: Row[] = []

  console.log(`⚗ FFC causal-paraphrase probe · ${NARRATIONS.length} narrations × 2 conditions × ${TRIALS} trials`)
  for (const n of NARRATIONS) {
    const cells: Cell[] = []
    for (const withSource of [true, false]) {
      let failVotes = 0
      let sampleViolation = ''
      let sampleReasoning = ''
      for (let t = 0; t < TRIALS; t++) {
        try {
          const v = await runChecker(n, withSource)
          if (!v.faithful) {
            failVotes++
            if (!sampleViolation && v.violations[0]) sampleViolation = `${v.violations[0].issue}${v.violations[0].contradicts ? ` [${v.violations[0].contradicts}]` : ''}: ${v.violations[0].claim}`.slice(0, 180)
          }
          if (!sampleReasoning) sampleReasoning = v.reasoning.slice(0, 200)
        } catch (err) {
          console.log(`  ! ${n.id} (${withSource ? 'src' : 'no-src'}) trial ${t + 1} error: ${String(err).slice(0, 80)}`)
        }
      }
      cells.push({ withSource, failVotes, sampleViolation, sampleReasoning })
    }
    rows.push({ n, cells })
    const src = cells.find((c) => c.withSource)!
    const nosrc = cells.find((c) => !c.withSource)!
    const want = n.kind === 'faithful' ? 'PASS (faithful:true)' : 'CATCH (faithful:false)'
    console.log(`\n${'─'.repeat(78)}`)
    console.log(`[${n.id}] ${n.case}/${n.kind} — want: ${want}`)
    console.log(`  ${n.note}`)
    console.log(`  WITH source:    flagged-unfaithful ${src.failVotes}/${TRIALS} trials`)
    if (src.sampleViolation) console.log(`     ↳ ${src.sampleViolation}`)
    console.log(`  WITHOUT source: flagged-unfaithful ${nosrc.failVotes}/${TRIALS} trials`)
    if (nosrc.sampleViolation) console.log(`     ↳ ${nosrc.sampleViolation}`)
  }

  // ── Pre-registered evaluation ───────────────────────────────────────────────────────────────────────
  const cell = (id: string, withSource: boolean) => rows.find((r) => r.n.id === id)!.cells.find((c) => c.withSource === withSource)!
  const maj = Math.ceil(TRIALS * 2 / 3) // ≥2/3
  const caught = (id: string, src: boolean) => cell(id, src).failVotes >= maj
  const passed = (id: string, src: boolean) => cell(id, src).failVotes <= TRIALS - maj // mostly faithful:true

  const wrongCausal = NARRATIONS.filter((n) => n.kind === 'wrong-causal').map((n) => n.id)
  const faithful = NARRATIONS.filter((n) => n.kind === 'faithful').map((n) => n.id)

  const c1 = wrongCausal.every((id) => caught(id, true))
  const c1meridian = caught('M-wrong-causal', true)
  const c2 = faithful.every((id) => passed(id, true))
  // Criterion 3 measures DISCRIMINATION, not a raw catch delta. The no-source checker blanket-rejects any
  // novel event it can't recognise ("fabricated facility") — so it "catches" the wrong-causal synthetic
  // narration for a reason unrelated to causality, and rejects the FAITHFUL one just the same. The real
  // architecture value: WITH source the checker separates faithful (pass) from wrong-causal (catch);
  // WITHOUT source it gives BOTH the same verdict — proving it isn't judging causal fidelity at all.
  const withSrcDiscriminates = passed('M-faithful', true) && caught('M-wrong-causal', true)
  const withoutSrcCannotDiscriminate = caught('M-faithful', false) === caught('M-wrong-causal', false)
  const c3 = withSrcDiscriminates && withoutSrcCannotDiscriminate
  const c4 = caught('T-scalar', true)

  console.log(`\n${'═'.repeat(78)}\nPRE-REGISTERED CRITERIA (trials=${TRIALS}, majority=${maj}):`)
  console.log(`  1. PRIMARY — WITH-source catches ALL wrong-causal (≥${maj}/${TRIALS} each): ${c1 ? 'MET' : 'NOT MET'}`)
  console.log(`       decisive MERIDIAN wrong-causal (no training prior): ${c1meridian ? 'CAUGHT' : 'MISSED'}`)
  console.log(`  2. DISCRIMINATION — WITH-source PASSES both faithful: ${c2 ? 'MET' : 'NOT MET'}`)
  console.log(`  3. ARCHITECTURE VALUE — WITH source DISCRIMINATES faithful↔wrong-causal; WITHOUT source cannot: ${c3 ? 'MET' : 'NOT MET'}`)
  console.log(`       WITH src:   M-faithful flagged ${cell('M-faithful', true).failVotes}/${TRIALS} (want low), M-wrong-causal flagged ${cell('M-wrong-causal', true).failVotes}/${TRIALS} (want high)`)
  console.log(`       WITHOUT src:M-faithful flagged ${cell('M-faithful', false).failVotes}/${TRIALS}, M-wrong-causal flagged ${cell('M-wrong-causal', false).failVotes}/${TRIALS} (same verdict = can't judge causality)`)
  console.log(`  4. SCALAR SANITY — WITH-source catches wrong-scalar: ${c4 ? 'MET' : 'NOT MET'}`)
  const verdict = c1meridian && c2 && c3
    ? '✅ SOURCE-IN-HAND CATCHES WRONG CAUSAL PARAPHRASE — the load-bearing assumption holds; the slice is worth building.'
    : !c1meridian
      ? '❌ FALSIFIED — source-in-hand MISSED the no-prior wrong-causal paraphrase. The free semantic FFC is not sufficient; report before building.'
      : '⚠ MIXED — read the per-narration detail before deciding.'
  console.log(`\nVERDICT: ${verdict}`)

  // ── Artifact ────────────────────────────────────────────────────────────────────────────────────────
  const outDir = join(process.cwd(), 'scripts', 'ab-out')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const rawPath = join(outDir, `ffc-causal-${stamp}-raw.json`)
  writeFileSync(rawPath, JSON.stringify({ trials: TRIALS, narrations: NARRATIONS, rows: rows.map((r) => ({ id: r.n.id, kind: r.n.kind, case: r.n.case, cells: r.cells })), criteria: { c1, c1meridian, c2, c3, c4 } }, null, 2))
  console.log(`\nraw: ${rawPath}`)
  console.log(`total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
