// Bounded-edit probe (2026-08-06) — the first test of the pipeline's first EDITOR.
//
// THE RESEARCH QUESTION IS NOT "can we fix endings?" It is: **can bounded edits outperform
// regeneration?** Endings are simply the first region whose boundary is crisp enough to try.
//
// Both arms share the SAME base narration (planner → plan gate → writer → editor → naturalizer, run
// once). The only difference is whether the bounded-edit pass runs on it:
//   BEFORE = the base narration (what production ships today).
//   AFTER  = base → critic (locate) → surgeon (generate) → verifier (reject) → splice → re-index.
// The pass is imported from src/pipeline/steps/ending-repair.ts — THE SAME CODE THAT SHIPS, not a copy.
//
// PRE-REGISTERED SUCCESS CRITERIA (fixed before the first run; see the plan file):
//   1. The independent scorer is endings-audit.ts, NOT the repair's own critic. The pass must not grade
//      its own homework. Weak = deletionLoss:'nothing' OR terminalExposition:true.
//   2. SHIP IF: >=50% of independently-weak endings flip to not-weak; the prefix guard holds 100%; and
//      landingKind diversity across repaired endings stays >=3 kinds (the monoculture tripwire).
//   3. FALSE POSITIVES: the critic must not fire on the hand-authored reference exemplars that pass.
//   4. REPORT AS A FINDING, DON'T SHIP, IF the surgeon's replacements are generic/worse or guards trip
//      routinely — that would mean revision needs a different mechanism than prompting, learned for ~$3.
//   5. Full before/after narrations paired per run (standing owner directive).
//   6. The verifier's rejection rate is reported SEPARATELY — a high rate proves it is load-bearing.
//
// No DB writes. Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-ending-repair.ts               # PROBE_RUNS=2 per genre → n=8
//   PROBE_GENRES=informational PROBE_RUNS=1 pnpm exec tsx scripts/probe-ending-repair.ts
//   PROBE_CONTROL_ONLY=1 pnpm exec tsx scripts/probe-ending-repair.ts   # criterion 3 only (cheap)
// Then score independently:
//   ENDINGS_AUDIT_OUT=after.json pnpm exec tsx scripts/endings-audit.ts probe-after.json
import '../src/env.js'
import { writeFileSync } from 'node:fs'
import { z } from 'zod'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    STORY_PLANNER_V1_VERSION,
    buildStoryWriterPrompt,
    STORY_V2_VERSION,
    buildStoryEditorPrompt,
    StoryEditSchema,
    STORY_EDITOR_V1_VERSION,
    buildStoryNaturalizerPrompt,
    StoryNaturalizeSchema,
    STORY_NATURALIZER_V1_VERSION,
    defaultAudienceDescriptor,
    buildStoryPlanCriticPrompt,
    PlanCriticSchema,
    STORY_PLAN_CRITIC_V1_VERSION,
    buildStoryPlanDoctorPrompt,
    PlanDoctorSchema,
    STORY_PLAN_DOCTOR_V1_VERSION,
    buildStoryEndingCriticPrompt,
    EndingCriticSchema,
    STORY_ENDING_CRITIC_V1_VERSION,
    resolvePlannerGenre,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')
  const { resolvePeak } = await import('../src/pipeline/steps/generate-story.js')
  const { runEndingRepair } = await import('../src/pipeline/steps/ending-repair.js')
  const { splitNumberedSentences, asModelText } = await import('@reels/core')
  const { WRITER_IDENTITIES } = await import('@reels/core/prompts/writer-identities.v1')
  type StoryPlan = z.infer<typeof StoryPlanSchema>

  let totalCost = 0
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length

  // ── Channel configs. SOURCE OF TRUTH: probe-genre-lab.ts LAB. Keep in sync. ────────────────────────
  // These four genres are deliberate: informational, comedy, lifestyle and general are exactly the
  // genres whose ending criteria were BARE until the 2026-08-06 lap (lifestyle had none at all), so they
  // are where a dead close is most likely and where a repair has the most to prove.
  const LAB: Record<string, { name: string; niche: string; hookHint: string; language: string }> = {
    informational: {
      name: 'Alam Mo Ba?',
      niche: 'surprising everyday facts and how-things-really-work explainers for Filipino viewers — money, food, city life, history',
      hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
      language: 'taglish',
    },
    comedy: {
      name: 'Buking',
      niche: 'everyday Filipino disaster comedy — true-feeling stories of small plans going catastrophically, hilariously wrong',
      hookHint: 'a deadpan or absurd first line that promises chaos',
      language: 'taglish',
    },
    lifestyle: {
      name: 'Sarap ng Buhay',
      niche: 'Filipino food and small-joys lifestyle — where to eat, what to cook, tiny routines that make the week better',
      hookHint: 'lead with the most wantable moment in the first 2s',
      language: 'taglish',
    },
    general: {
      name: 'Kwentuhan Tayo',
      niche: 'true-feeling everyday Filipino stories — whatever the barangay would actually retell',
      hookHint: 'earn the next ten seconds with the first line',
      language: 'taglish',
    },
  }

  const GENRES = (process.env.PROBE_GENRES ?? 'informational,comedy,lifestyle,general')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g in LAB)
  const N = process.env.PROBE_RUNS ? Math.max(1, Math.min(8, parseInt(process.env.PROBE_RUNS, 10))) : 2
  // Run index offset, so a second batch is POOLABLE with the first instead of re-drawing the same
  // angle directives and planner nonces (both are derived from `i`). Batch 1 used i=0..1; batch 2 with
  // PROBE_SEED_OFFSET=2 uses i=2..7. Pooling is only legitimate while the pass and prompts are unchanged.
  const SEED_OFFSET = process.env.PROBE_SEED_OFFSET ? parseInt(process.env.PROBE_SEED_OFFSET, 10) : 0
  const RUN = { targetSeconds: 60, targetWords: 150, writerTokens: 4096 }
  const PH_BIBLE = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  const tone = JSON.stringify({ intensity: 6, warmth: 5, energy: 5, pacing: 5, humor: 4 })

  // ── The base chain, mirroring production tolerances ────────────────────────────────────────────────
  const makePlan = async (genre: string, i: number): Promise<StoryPlan> => {
    const ch = LAB[genre]!
    const angle = selectAngles(1, i * 3 + 1)[0]!
    const p = buildStoryPlannerPrompt({
      channelName: ch.name, nicheDescription: ch.niche, toneConfig: tone, worldBibleJson: PH_BIBLE,
      genreCategory: genre, targetSeconds: RUN.targetSeconds, angleDirective: angle.directive,
      avoidList: '', rejectionAvoidList: '', regenerationNonce: i,
    })
    const res = await llmCall({ templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema, system: p.system, messages: [{ role: 'user', content: p.userMessage }], temperature: 1.0, maxTokens: 1500 })
    totalCost += res.costCents
    return res.data
  }
  const judgePlan = async (genre: string, plan: StoryPlan) => {
    const ch = LAB[genre]!
    const { system, userMessage } = buildStoryPlanCriticPrompt({ channelName: ch.name, nicheDescription: ch.niche, plan })
    const res = await llmCall({ templateVersion: STORY_PLAN_CRITIC_V1_VERSION, schema: PlanCriticSchema, system, messages: [{ role: 'user', content: userMessage }], provider: 'anthropic', maxTokens: 2048 })
    totalCost += res.costCents
    const d = res.data
    return { pass: d.pass && d.decision.pass && d.chain.pass && d.causedEnding.pass, reason: d.reason }
  }
  const agenticPlan = async (genre: string, i: number): Promise<StoryPlan> => {
    const ch = LAB[genre]!
    let plan = await makePlan(genre, i)
    let v = await judgePlan(genre, plan)
    let n = 0
    while (!v.pass && n < 2) {
      n++
      const { system, userMessage } = buildStoryPlanDoctorPrompt({ channelName: ch.name, nicheDescription: ch.niche, targetSeconds: RUN.targetSeconds, plan, reason: v.reason })
      const res = await llmCall({ templateVersion: STORY_PLAN_DOCTOR_V1_VERSION, schema: PlanDoctorSchema, system, messages: [{ role: 'user', content: userMessage }], provider: 'anthropic', temperature: 0.7, maxTokens: 1200 })
      totalCost += res.costCents
      plan = { ...plan, ...res.data }
      v = await judgePlan(genre, plan)
    }
    return plan
  }
  const runChain = async (genre: string, plan: StoryPlan) => {
    const ch = LAB[genre]!
    const aud = defaultAudienceDescriptor(ch.language)
    const wp = buildStoryWriterPrompt({
      channelName: ch.name, nicheDescription: ch.niche, toneConfig: tone, language: ch.language, audienceDescriptor: aud,
      worldBibleJson: PH_BIBLE, fewshotStories: '', targetSeconds: RUN.targetSeconds, targetWords: RUN.targetWords,
      genreCategory: genre,
      plan: { premise: plan.premise, conflict: plan.conflict, escalation: plan.escalation, twist: plan.twist, ending: plan.ending, emotionalDestination: plan.emotionalDestination },
      register: plan.elements.register, platformHookHint: ch.hookHint,
    })
    const story = await llmCall({ templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system: wp.system, messages: [{ role: 'user', content: wp.userMessage }], provider: 'anthropic', temperature: 1.0, maxTokens: RUN.writerTokens })
    totalCost += story.costCents
    let narration = story.data.narration
    let peakMoment = story.data.peakMoment
    for (const stage of ['editor', 'naturalizer'] as const) {
      try {
        const prompt = stage === 'editor'
          ? buildStoryEditorPrompt({ nicheDescription: ch.niche, genreCategory: genre, language: ch.language, audienceDescriptor: aud, narration, peakMoment, emotionalDestination: plan.emotionalDestination, canonicalNames: [], targetWords: RUN.targetWords })
          : buildStoryNaturalizerPrompt({ language: ch.language, audienceDescriptor: aud, narration, peakMoment })
        const res = await llmCall({ templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION, schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema, system: prompt.system, messages: [{ role: 'user', content: prompt.userMessage }], ...(stage === 'naturalizer' ? { provider: 'anthropic' as const } : {}), temperature: 0.7, maxTokens: RUN.writerTokens })
        totalCost += res.costCents
        const tol = stage === 'editor' ? 0.25 : 0.15
        const dw = Math.abs(wordCount(res.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        const keptPeak = resolvePeak(res.data.narration, [res.data.peakMoment, peakMoment])
        const inL = beatLines(narration), outL = beatLines(res.data.narration)
        if (dw <= tol && keptPeak && !(inL >= 4 && outL <= Math.ceil(inL / 2))) { narration = res.data.narration; peakMoment = keptPeak }
      } catch { /* pass text through, exactly as production does */ }
    }
    return { title: story.data.title, logline: story.data.logline, narration, peakMoment }
  }

  // ── CRITERION 3 — the false-positive control ──────────────────────────────────────────────────────
  // Hand-authored exemplars (verbatim from probe-genre-lab REDDIT_FEWSHOT — "the real thing"). If the
  // ending critic fires on human-authored closes, it is too eager and nothing ships until it isn't.
  const EXEMPLARS: Array<{ tag: string; title: string; narration: string }> = [
    {
      tag: 'confession · unresolved (ends on a question)',
      title: 'Hindi ako pumunta sa libing ng tatay ko. Wala pang nakakaalam kung bakit.',
      narration: `Alam kong parang halimaw ako. Hayaan niyo lang muna akong mag-paliwanag.
Namatay yung tatay ko last month. Hindi ako pumunta sa libing. Sabi ko sa pamilya, may sakit ako. Nagsinungaling ako.
Yung totoo: siya yung dahilan kung bakit umalis ako ng bahay nung 17 ako. Hindi ko na uungkatin lahat dito — pero may mga bagay na hindi mo basta napapatawad kahit patay na sila.
Nung tumawag si Mama na wala na siya, hinintay kong dumating yung lungkot. Hindi dumating. Yun mismo yung kinatatakutan ko.
Ngayon iniisip ng mga kapatid ko na wala akong puso. Iniisip ni Mama na binigo ko siya sa huling araw.
Hindi ko pa rin alam kung tama ako. Baka hindi. Pero hindi ko rin alam kung kaya kong gawin ulit nang iba.
Masama ba ako?`,
    },
    {
      tag: 'drama · quiet close on a consequence',
      title: '"Ate ka, ikaw na bahala."',
      narration: `Alas-dose na, gising pa rin ako. Bukas ang enrollment ng bunso.
Nasa lamesa 'yung naka-tape na brown envelope. Tatlong taon ko nang dinadagdagan — review fee, para makapag-board exam na rin ako balang-araw.
Kanina, tinapik lang ako ni Mama. "Ate ka. Ikaw na bahala sa tuition." Ngiting-ngiti.
Kaya heto ako, tinititigan 'yung pera na kapag inabot ko, wala nang matitira sa akin.
Pero ngayong gabi — ayaw kong galawin.
Kinatok ko 'yung pinto ni Mama. "Ma. Ngayong taon, hindi ko kaya."
Hindi siya nagalit. "Sige," sabi niya. Tapos sinara 'yung pinto.
Kinabukasan, nakahanap din sila ng pang-enroll. Hindi na sa akin. Wala nang tumapik sa balikat ko.
Iba pala 'yung katahimikan kapag hindi ka na kailangan.`,
    },
    {
      tag: 'informational · closes on a count-it-yourself action',
      title: 'Bakit nasa pinakadulo lagi ng grocery ang gatas at itlog.',
      narration: `Hindi 'yan tamad na disenyo. Sinadya 'yan.
Yung gatas, itlog, tinapay — 'yan yung pinakamadalas bilhin ng tao. Kung nasa harap lang 'yan, papasok ka, kukunin, aalis. Tapos.
Kaya nilalagay sa pinakadulo. Para mapilitan kang dumaan sa lahat ng iba pang produkto papunta doon.
Yung mga snack, yung mga naka-sale sa gitna, yung mga bagay na hindi mo naman balak bilhin — nakikita mo lahat habang naglalakad papunta sa gatas.
May tawag pa sila dito: "the milk run."
Kaya sa susunod na pupunta ka ng grocery para lang sa gatas — bilangin mo kung ilang bagay ang naisama mo pauwi. Malamang, hindi lang gatas.`,
    },
    {
      tag: 'informational · closes on a plain instruction',
      title: 'Bakit dinisenyo ang "minimum payment" para HINDI mo mabayaran ang utang mo.',
      narration: `Akala mo responsable ka kasi binabayaran mo yung minimum sa credit card. Yun mismo yung gusto nila.
Sabihin nating may utang kang 20,000, tapos 3% ang minimum. Ang babayaran mo? 600 lang. Pero ang interes bawat buwan? Mga 500 na agad.
So sa 600 na binayad mo, 100 lang ang bumawas sa utang mo. Yung 500, interes lang na bumalik.
Ganun kabagal. Kung minimum lang lagi, yung 20,000 na 'yon — pwedeng umabot ng pito hanggang walong taon bago mabayaran. At mababayaran mo ng halos doble.
Hindi 'yan aksidente. Ang minimum payment, dinisenyo para tumagal ka — kasi habang tumatagal ka, mas kumikita sila.
Kaya kahit konti, sobrahan mo lagi sa minimum. Yun lang yung paraan para hindi ka lamunin ng interes.`,
    },
  ]

  const criticOnly = async (genre: string, title: string, narration: string) => {
    const ch = LAB[genre] ?? LAB.general!
    const split = splitNumberedSentences(narration)
    const identity = WRITER_IDENTITIES[resolvePlannerGenre(genre, ch.niche)]
    const p = buildStoryEndingCriticPrompt({
      genreCategory: genre,
      language: ch.language,
      closingCraft: identity?.closingCraft,
      title,
      numberedNarration: split.numbered,
      sentenceCount: split.raw.length,
    })
    const res = await llmCall({ templateVersion: STORY_ENDING_CRITIC_V1_VERSION, schema: EndingCriticSchema, system: p.system, messages: [{ role: 'user', content: p.userMessage }], provider: 'anthropic', maxTokens: 700 })
    totalCost += res.costCents
    return res.data
  }

  console.log('⚗ BOUNDED-EDIT PROBE — can bounded edits outperform regeneration?\n')

  // ── Control first: it is cheap, and a critic that over-fires invalidates everything after it ───────
  console.log('═'.repeat(78))
  console.log('CRITERION 3 — FALSE-POSITIVE CONTROL (hand-authored closes must survive)')
  console.log('═'.repeat(78))
  let controlFired = 0
  for (const ex of EXEMPLARS) {
    try {
      const genre = ex.tag.startsWith('informational') ? 'informational' : 'general'
      const v = await criticOnly(genre, ex.title, ex.narration)
      if (!v.landed) controlFired++
      console.log(`${v.landed ? '✓ survived' : '✗ FIRED   '}  [${ex.tag}]`)
      console.log(`             kind=${v.landingKind}${v.landed ? '' : ` — "${v.problem}"`}`)
      console.log(`             close: "${asModelText(v.closingLines).slice(0, 100)}"`)
    } catch (e) {
      console.log(`!  control failed [${ex.tag}]: ${String(e).slice(0, 200)}`)
    }
  }
  // The control set gets a SECOND, independent opinion by design. When the critic fires on a
  // hand-authored close, "the critic is too eager" and "that exemplar's close is genuinely weak" are
  // both live explanations, and the endings-audit judge — which knows nothing about this pass — is the
  // arbiter. Score it with:
  //   pnpm exec tsx scripts/endings-audit.ts probe-control.json
  writeFileSync(
    'probe-control.json',
    JSON.stringify(EXEMPLARS.map((e) => ({ genre: e.tag.split(' ·')[0], title: e.title, body: e.narration })), null, 2),
  )
  console.log(`\nCONTROL RESULT: the critic fired on ${controlFired}/${EXEMPLARS.length} hand-authored endings.`)
  console.log('wrote probe-control.json — score it with endings-audit.ts for an independent second opinion')
  console.log(controlFired === 0
    ? '→ no false positives on human-authored closes.'
    : '→ ⚠ the critic fires on human-authored closes. Criterion 3 is the gate: tune before shipping.')

  // ── The OTHER error rate — a critic tuned until it fires on nothing would pass the control above and
  // be worthless. The true-positive set is built independently: stories the endings-audit judge (which
  // knows nothing about this pass) graded deletionLoss:'nothing' or terminalExposition:true.
  //   ENDINGS_AUDIT_OUT=a.json pnpm exec tsx scripts/endings-audit.ts   # then filter the weak ones
  const trueposFile = process.env.PROBE_TRUEPOS
  if (trueposFile) {
    const { readFileSync } = await import('node:fs')
    const items = JSON.parse(readFileSync(trueposFile, 'utf8')) as Array<{ genre: string; title: string; body: string }>
    console.log(`\n${'═'.repeat(78)}`)
    console.log('TRUE-POSITIVE CHECK (independently-weak endings the critic SHOULD catch)')
    console.log('═'.repeat(78))
    let caught = 0
    for (const it of items) {
      try {
        const v = await criticOnly(it.genre, it.title, it.body)
        if (!v.landed) caught++
        console.log(`${v.landed ? '✗ MISSED  ' : '✓ caught  '}  [${it.genre}] "${it.title}"`)
        console.log(`             kind=${v.landingKind}${v.landed ? '' : ` — "${v.problem.slice(0, 160)}"`}`)
      } catch (e) {
        console.log(`!  truepos failed "${it.title}": ${String(e).slice(0, 200)}`)
      }
    }
    console.log(`\nTRUE-POSITIVE RESULT: caught ${caught}/${items.length} independently-weak endings.`)
  }

  if (process.env.PROBE_CONTROL_ONLY === '1') {
    console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
    process.exit(0)
  }

  // ── The paired arms ───────────────────────────────────────────────────────────────────────────────
  type Row = {
    genre: string
    title: string
    before: string
    after: string
    applied: boolean
    verifierRejected: boolean
    guardTripped: string | null
    removed: string | null
    replacement: string | null
    prefixHeld: boolean
  }
  const rows: Row[] = []

  for (const genre of GENRES) {
    for (let k = 0; k < N; k++) {
      const i = k + SEED_OFFSET
      try {
        const plan = await agenticPlan(genre, i)
        const base = await runChain(genre, plan)
        const ch = LAB[genre]!
        const repaired = await runEndingRepair({
          title: base.title,
          narration: base.narration,
          peakMoment: base.peakMoment,
          genreCategory: genre,
          nicheDescription: ch.niche,
          language: ch.language,
          audienceDescriptor: defaultAudienceDescriptor(ch.language),
          hookPromise: plan.hookPromise,
          viewerTransformation: plan.viewerTransformation,
          onCost: (c) => { totalCost += c },
          resolvePeak,
        })
        const audit = repaired.audit
        const attempts = audit.status === 'ok' ? audit.attempts : []
        const applied = audit.status === 'ok' && audit.applied
        const appliedAttempt = attempts.find((a) => a.applied)
        const skipped = attempts.find((a) => a.skipped)?.skipped ?? null

        // THE PREFIX GUARANTEE, checked independently of the primitive's own assertion.
        const prefixHeld = !applied || (() => {
          const region = appliedAttempt?.region
          if (!region) return false
          const prefix = splitNumberedSentences(base.narration).raw.slice(0, region.start).join('')
          return repaired.narration.startsWith(prefix.trimEnd())
        })()

        rows.push({
          genre, title: base.title, before: base.narration, after: repaired.narration, applied,
          verifierRejected: (skipped ?? '').startsWith('verifier rejected'),
          guardTripped: skipped && !skipped.startsWith('verifier rejected') ? skipped : null,
          removed: appliedAttempt?.removed ?? null,
          replacement: appliedAttempt?.replacement ?? null,
          prefixHeld,
        })

        console.log(`\n${'═'.repeat(78)}`)
        console.log(`[${genre} ${k + 1}/${N} seed=${i}] "${base.title}"`)
        const first = attempts[0]
        console.log(`  CRITIC: ${first ? (first.landed ? 'ending LANDED (no edit)' : `dead — ${first.problem}`) : 'n/a'}`)
        if (first && !first.landed) console.log(`          region=[${first.region?.start},${first.region?.end}] kind=${first.landingKind}`)
        if (skipped) console.log(`  SKIPPED: ${skipped}`)
        console.log(`  APPLIED: ${applied ? 'YES' : 'no'}   prefix held: ${prefixHeld ? 'YES' : '*** NO ***'}`)
        if (applied) {
          console.log(`${'─'.repeat(78)}`)
          console.log(`  REMOVED:     "${appliedAttempt?.removed}"`)
          console.log(`  REPLACEMENT: "${appliedAttempt?.replacement}"`)
        }
        // Standing owner directive: the FULL before and after narrations, paired.
        console.log(`${'─'.repeat(78)}\n[BEFORE]\n${base.narration}`)
        console.log(`${'─'.repeat(78)}\n[AFTER]${applied ? '' : ' — identical (no edit applied)'}\n${repaired.narration}`)
      } catch (err) {
        console.log(`\n[${genre} ${k + 1}/${N} seed=${i}] FAILED: ${String(err).slice(0, 300)}`)
      }
    }
  }

  // ── Hand the arms to the INDEPENDENT scorer (criterion 1) ──────────────────────────────────────────
  const toBatch = (which: 'before' | 'after') =>
    rows.map((r) => ({ genre: r.genre, title: r.title, body: which === 'before' ? r.before : r.after }))
  const tag = process.env.PROBE_TAG ?? 'batch'
  writeFileSync(`probe-before-${tag}.json`, JSON.stringify(toBatch('before'), null, 2))
  writeFileSync(`probe-after-${tag}.json`, JSON.stringify(toBatch('after'), null, 2))

  const applied = rows.filter((r) => r.applied)
  const rejected = rows.filter((r) => r.verifierRejected)
  const guarded = rows.filter((r) => r.guardTripped)
  console.log(`\n${'═'.repeat(78)}`)
  console.log('MECHANISM REPORT (independent quality scoring comes from endings-audit.ts)')
  console.log('═'.repeat(78))
  console.log(`stories:            ${rows.length}`)
  console.log(`edits applied:      ${applied.length}`)
  console.log(`verifier rejected:  ${rejected.length}   ← criterion 6: reported separately on purpose`)
  console.log(`other guards:       ${guarded.length}`)
  for (const g of guarded) console.log(`   · ${g.guardTripped}`)
  console.log(`prefix guard held:  ${rows.filter((r) => r.prefixHeld).length}/${rows.length}   ← must be 100%`)
  console.log(`\nwrote probe-before-${tag}.json + probe-after-${tag}.json`)
  console.log(`NEXT (criterion 1 — the pass does not grade its own homework):`)
  console.log(`  ENDINGS_AUDIT_OUT=audit-before-${tag}.json pnpm exec tsx scripts/endings-audit.ts probe-before-${tag}.json`)
  console.log(`  ENDINGS_AUDIT_OUT=audit-after-${tag}.json  pnpm exec tsx scripts/endings-audit.ts probe-after-${tag}.json`)
  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
