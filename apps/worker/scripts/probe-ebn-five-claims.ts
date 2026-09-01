// Crossroads EBN deterministic five-claim probe (2026-08-29).
//
// CONTROL: the nine production-prompt control drafts frozen in probe-ebn-ending-brief.json.
// TREATMENT: deterministically compact each control's first six setup claims into four adjacent
// evidence-preserving claims, retain its terminal claim separately as claim five, then reuse the
// spoken-writer guidance from the writer-only probe. No planner call, new stage, schema, ending enum,
// or production/database mutation.
//
// PRE-REGISTERED GRADUATION BAR (nine treatment drafts):
//  1. Blind preference: five-claim treatment wins >=6/9 pairs against production controls.
//  2. Endpoint integrity: <=1/9 double endings and <=5/9 report-like closes.
//  3. Fidelity veto: <=12 total FFC issues (the frozen production control).
//  4. Duration: >=6/9 drafts inside the frozen 176-216 word production window.
//  5. Diversity veto: >=3 ending kinds and no one kind in >2/3 of drafts.
// All five must pass. Read-only probe; every paid call is checkpointed and cost-accounted.
//
// Usage (cwd apps/worker): pnpm exec tsx scripts/probe-ebn-five-claims.ts
import '../src/env.js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const EndingJudgeSchema = z.object({
  openingDebt: z.string(),
  closingLines: z.string(),
  terminalBeat: z.string(),
  debtPaid: z.boolean(),
  laterReopensOrExplains: z.boolean(),
  doubleEnding: z.boolean(),
  reportLikeClose: z.boolean(),
  endingKind: z.enum(['consequence', 'verdict', 'image', 'irony', 'callback', 'uncertainty', 'human', 'summary', 'question', 'other']),
  finalEffect: z.string(),
  reasoning: z.string(),
})

const PairJudgeSchema = z.object({
  preferred: z.enum(['A', 'B', 'tie']),
  aTerminalBeat: z.string(),
  bTerminalBeat: z.string(),
  reason: z.string(),
})

const ENDING_JUDGE_SYSTEM = `You are a short-form documentary editor judging ENDPOINT INTEGRITY, not a preferred ending style.

Read the title and full narration. Identify the exact debt created by the opening, the beat that truly resolves or honestly bounds it, and whether anything after that beat reopens, restates, moralizes, or explains the ending.

A DOUBLE ENDING occurs when the story reaches a defensible terminal answer/consequence/contrast/callback, then adds another conclusion that dilutes or explains it. A final synthesis is NOT automatically a double ending when that synthesis is itself the first clear answer. A factual verdict, human consequence, image, irony, callback, question that completes an opening game, or honest uncertainty can all be valid. Do not reward a CTA, moral, concrete object, human coda, or any other surface form by default.

"reportLikeClose" means the close feels primarily like compressed report prose rather than a deliberately weighted spoken landing. This can be true even when the facts and answer are correct.

Return EXACTLY these keys:
{
  "openingDebt": "",
  "closingLines": "",
  "terminalBeat": "",
  "debtPaid": true,
  "laterReopensOrExplains": false,
  "doubleEnding": false,
  "reportLikeClose": false,
  "endingKind": "consequence" | "verdict" | "image" | "irony" | "callback" | "uncertainty" | "human" | "summary" | "question" | "other",
  "finalEffect": "",
  "reasoning": ""
}`

const PAIR_JUDGE_SYSTEM = `You are choosing which of two evidence-based short-documentary drafts has the stronger ENDPOINT INTEGRITY. The factual source is held fixed; do not prefer one because it sounds more emotional, cinematic, conclusive, human, or concrete.

Prefer the draft that most clearly pays the debt created by its own opening, gives pivotal material proportional space, reaches one earned terminal answer/consequence/contrast/callback/uncertainty, and stops without reopening or explaining it. A necessary causal synthesis is valid. A moral, CTA, object, human coda, or summary is neither inherently good nor bad. Return tie when the difference is not meaningful.

Return EXACTLY these keys:
{
  "preferred": "A" | "B" | "tie",
  "aTerminalBeat": "",
  "bTerminalBeat": "",
  "reason": ""
}`

type Spend = { writer: number; compression: number; fidelity: number; endingJudge: number; pairJudge: number }
type Arm = 'control' | 'fiveClaims'

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length
const treatmentFirst = (reelId: string, run: number) =>
  ((createHash('sha256').update(`${reelId}:${run}:five-claims`).digest()[0] ?? 0) % 2) === 0

void (async () => {
  const RUNS = Math.max(1, Number(process.env['PROBE_RUNS'] ?? 3))
  const BASELINE_PATH = process.env['PROBE_BASELINE'] ?? 'probe-ebn-ending-brief.json'
  const WRITER_DIAGNOSTIC_PATH = process.env['PROBE_WRITER_DIAGNOSTIC'] ?? 'probe-ebn-writer-landing.json'
  const OUT = process.env['PROBE_OUT'] ?? 'probe-ebn-five-claims.json'
  const PARTIAL_OUT = `${OUT}.partial.json`
  const PRIOR_FAILED_RUN_CENTS = Math.max(0, Number(process.env['PROBE_PRIOR_FAILED_CENTS'] ?? 0))
  const { llmCall } = await import('@reels/providers')
  const { getDb, channels, reels, stories } = await import('@reels/db')
  const { and, desc, eq } = await import('drizzle-orm')
  const {
    buildEbnWriterPrompt,
    STORY_EBN_WRITER_V1_VERSION,
    EbnWriterSchema,
    TRUE_CRIME_PERMISSIONS,
    buildEbnFidelityPrompt,
    STORY_EBN_FIDELITY_V1_VERSION,
    EbnFidelitySchema,
    EvidenceBibleSchema,
    EbnClaimsSchema,
    composeTasteRubric,
  } = await import('../src/prompts-bridge.js')

  const BaseResultSchema = z.object({
    caseTitle: z.string(),
    reelId: z.string(),
    run: z.number(),
    arm: z.string(),
    generatedTitle: z.string(),
    narration: z.string(),
    wordCount: z.number(),
    claims: EbnClaimsSchema.shape.claims,
    fidelity: EbnFidelitySchema,
    ending: EndingJudgeSchema,
  })
  const BaselineSchema = z.object({
    configuration: z.object({ targetSeconds: z.number(), targetWords: z.number() }),
    results: z.array(BaseResultSchema),
  })
  const baseline = BaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')))
  if (baseline.configuration.targetSeconds !== 80 || baseline.configuration.targetWords !== 196) {
    throw new Error(`Frozen baseline changed: expected 80 seconds/196 words, found ${baseline.configuration.targetSeconds}/${baseline.configuration.targetWords}`)
  }
  const controls = baseline.results.filter((row) => row.arm === 'control' && row.run <= RUNS)
  if (controls.length !== RUNS * 3) throw new Error(`Expected ${RUNS * 3} frozen controls; found ${controls.length}`)

  type Claims = z.infer<typeof EbnClaimsSchema>['claims']
  const compactClaims = (claims: Claims): Claims => {
    if (claims.length !== 7) throw new Error(`Expected exactly 7 frozen claims; found ${claims.length}`)
    const ordered = [...claims].sort((a, b) => a.order - b.order)
    const setup = ordered.slice(0, -1)
    const terminal = ordered.at(-1)
    if (!terminal) throw new Error('Terminal claim missing')
    const compactedSetup = Array.from({ length: 4 }, (_, index) => {
      const start = Math.floor(index * setup.length / 4)
      const end = Math.floor((index + 1) * setup.length / 4)
      const bucket = setup.slice(start, end)
      if (bucket.length === 0) throw new Error(`Empty deterministic claim bucket ${index + 1}`)
      return {
        id: `C${index + 1}`,
        order: index + 1,
        purpose: bucket.map((claim) => claim.purpose).join('; '),
        evidence: [...new Set(bucket.flatMap((claim) => claim.evidence))],
      }
    })
    const compacted = [
      ...compactedSetup,
      { id: 'C5', order: 5, purpose: terminal.purpose, evidence: [...terminal.evidence] },
    ]
    const before = [...new Set(ordered.flatMap((claim) => claim.evidence))].sort()
    const after = [...new Set(compacted.flatMap((claim) => claim.evidence))].sort()
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Claim compaction changed the evidence-id union')
    return EbnClaimsSchema.shape.claims.parse(compacted)
  }
  const compactedControls = new Map(controls.map((control) => [
    `${control.reelId}:${control.run}`,
    compactClaims(control.claims),
  ]))

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.name, 'Crossroads') })
  if (!channel) throw new Error('Crossroads channel not found')
  const sourceRows = await db
    .select({
      reelId: reels.id,
      language: reels.language,
      seedIdea: reels.seedIdea,
      evidenceBible: reels.evidenceBible,
      title: stories.title,
      createdAt: reels.createdAt,
    })
    .from(reels)
    .innerJoin(stories, eq(reels.storyId, stories.id))
    .where(and(eq(reels.channelId, channel.id), eq(reels.status, 'approved')))
    .orderBy(desc(reels.createdAt))
  const cases = sourceRows.filter((row) => row.evidenceBible).slice(0, 3)
  if (cases.length !== 3) throw new Error(`Expected 3 approved frozen Crossroads cases; found ${cases.length}`)

  const targetSeconds = channel.targetSeconds ?? 75
  const targetWords = Math.round(Math.max(10, targetSeconds - 1.8) * 2.5)
  const minWords = Math.round(targetWords * 0.9)
  const maxWords = Math.round(targetWords * 1.1)
  if (targetSeconds !== 80 || targetWords !== 196 || minWords !== 176 || maxWords !== 216) {
    throw new Error(`Live Crossroads target changed: expected 80s/196w/176-216, found ${targetSeconds}s/${targetWords}w/${minWords}-${maxWords}`)
  }
  const tasteRubric = composeTasteRubric({
    tasteRubric: channel.tasteRubric,
    editorialPrinciples: channel.editorialPrinciples,
    genreCategory: channel.genreCategory,
    niche: channel.nicheDescription,
  })
  const makeBrief = (row: (typeof cases)[number]) => JSON.stringify({
    channel: channel.name,
    channelPromise: channel.nicheDescription,
    editorialPrinciples: channel.editorialPrinciples,
    tasteRubric,
    genre: channel.genreCategory,
    narrativeStyle: channel.narrativeStyle,
    narrativeVoice: channel.narrativeVoice,
    styleInfluence: channel.styleInfluence,
    targetSeconds,
    targetWords,
    operatorRequest: row.seedIdea,
  }, null, 2)

  type CompactResult = {
    caseTitle: string
    reelId: string
    run: number
    arm: 'fiveClaims'
    generatedTitle: string
    narration: string
    wordCount: number
    sourceClaims: Claims
    claims: Claims
    citationMap: Array<{ text: string; claimId: string; factIds: string[] }>
    fidelity: z.infer<typeof EbnFidelitySchema>
    ending: z.infer<typeof EndingJudgeSchema>
  }
  type Working = {
    key: string
    written?: z.infer<typeof EbnWriterSchema>
    narration?: string
    citationMap?: CompactResult['citationMap']
    compressionChecked?: boolean
    fidelity?: z.infer<typeof EbnFidelitySchema>
    ending?: z.infer<typeof EndingJudgeSchema>
  }
  type Pair = { caseTitle: string; reelId: string; run: number; aArm: Arm; bArm: Arm; preferredArm: Arm | 'tie'; reason: string }

  const spend: Spend = { writer: 0, compression: 0, fidelity: 0, endingJudge: 0, pairJudge: 0 }
  const compactResults: CompactResult[] = []
  const pairs: Pair[] = []
  let working: Working | undefined
  let lastLabel = 'initialized'
  let lastError: string | undefined
  const persist = () => writeFileSync(PARTIAL_OUT, JSON.stringify({
    probe: 'ebn-five-claims.v0',
    updatedAt: new Date().toISOString(),
    label: lastLabel,
    ...(lastError ? { error: lastError } : {}),
    spendCents: spend,
    compactResults,
    pairs,
    ...(working ? { working } : {}),
  }, null, 2))
  if (existsSync(PARTIAL_OUT)) {
    const partial = JSON.parse(readFileSync(PARTIAL_OUT, 'utf8')) as {
      spendCents?: Partial<Spend>
      compactResults?: CompactResult[]
      pairs?: Pair[]
      working?: Working
      label?: string
      error?: string
    }
    for (const key of Object.keys(spend) as Array<keyof Spend>) spend[key] = Number(partial.spendCents?.[key] ?? 0)
    compactResults.push(...(partial.compactResults ?? []))
    pairs.push(...(partial.pairs ?? []))
    working = partial.working
    lastLabel = partial.label ?? 'resumed'
    lastError = partial.error
    console.log(`resuming ${compactResults.length}/${controls.length} drafts and ${pairs.length}/${controls.length} pairs from ${PARTIAL_OUT}`)
  } else {
    persist()
  }
  const accounted = async <T>(key: keyof Spend, label: string, call: () => Promise<{ data: T; costCents: number }>) => {
    lastLabel = label
    lastError = undefined
    persist()
    try {
      const result = await call()
      spend[key] += result.costCents
      persist()
      return result
    } catch (error) {
      const reported = typeof error === 'object' && error !== null && 'costCents' in error
        ? Number((error as { costCents?: unknown }).costCents ?? 0)
        : 0
      if (Number.isFinite(reported) && reported > 0) spend[key] += reported
      lastError = String(error)
      persist()
      throw error
    }
  }

  for (const control of controls) {
    const key = `${control.reelId}:${control.run}`
    if (compactResults.some((result) => result.reelId === control.reelId && result.run === control.run)) continue
    if (working && working.key !== key) throw new Error(`Partial work belongs to ${working.key}, expected ${key}`)
    working ??= { key }
    const row = cases.find((candidate) => candidate.reelId === control.reelId)
    if (!row) throw new Error(`No frozen Evidence Bible for ${control.caseTitle}`)
    const bible = EvidenceBibleSchema.parse(row.evidenceBible)
    const facts = bible.facts.map((fact) => ({
      id: fact.id,
      stance: fact.stance,
      weight: fact.weight,
      ...(fact.attributed_to ? { attributed_to: fact.attributed_to } : {}),
      value: fact.value,
    }))
    const criticalIds = bible.facts.filter((fact) => fact.weight === 'Critical').map((fact) => fact.id)
    const factById = new Map(bible.facts.map((fact) => [fact.id, fact]))
    const compactedClaims = compactedControls.get(key)
    if (!compactedClaims) throw new Error(`No compacted claims for ${control.caseTitle} ${control.run}`)
    const claimsWithFacts = compactedClaims.map((claim) => ({
      id: claim.id,
      order: claim.order,
      purpose: claim.purpose,
      facts: claim.evidence
        .map((id) => factById.get(id))
        .filter((fact) => fact !== undefined)
        .map((fact) => ({ id: fact.id, stance: fact.stance, attributed_to: fact.attributed_to, value: fact.value })),
    }))
    const brief = makeBrief(row)

    const write = async (requestedWords: number, previous?: z.infer<typeof EbnWriterSchema>) => {
      const base = buildEbnWriterPrompt({
        claims: claimsWithFacts,
        permissions: TRUE_CRIME_PERMISSIONS,
        editorialBrief: brief,
        targetWords: requestedWords,
      })
      const system = `${base.system.replace(
        '- For short-form budgets, write one efficient sentence per claim whenever possible. A claim may cite several facts; that is the intended compression mechanism. Keep each narration sentence at or below 30 words.',
        '- Narrative Claims are evidence units, not equal prose beats or sentence quotas. Compress routine context; let pivotal material use the space it earns. Keep each narration sentence at or below 30 words.',
      )}

SPOKEN SHORT-FORM CRAFT:
- Write the way a real narrator would naturally say this aloud in ${row.language}; never translation-shaped, source-note-shaped, or report-shaped prose.
- The hard total word budget wins. Cover the supported spine without giving every claim equal space or repeating a fact merely to sound conclusive.
- Infer the opening debt from the ordered claims and pay or honestly bound it by the end. The final claim may deliver a consequence, verdict, contrast, image, irony, callback, uncertainty, human result, or another function the story earns.
- Put necessary qualifications before the terminal passage when the evidence allows. Once the final supported beat has done unique closing work, stop. Do not append a moral, explanation, restatement, CTA, or second conclusion.
- These are goals and failure modes, not a required ending formula.`
      const previousBlock = previous
        ? `\n\nPREVIOUS CITED DRAFT TO COMPRESS:\n${JSON.stringify(previous, null, 2)}\n\nReturn a complete replacement JSON object. Preserve the supported factual spine and citations, but bring the narration inside the hard production word window. Remove repeated explanation before cutting unique evidence.`
        : ''
      return llmCall({
        templateVersion: 'story-ebn-writer.v1.6+spoken-landing+five-claims.v0-probe',
        schema: EbnWriterSchema,
        system,
        messages: [{ role: 'user', content: `${base.userMessage}${previousBlock}` }],
        provider: 'anthropic' as const,
        maxTokens: Math.min(16384, Math.max(4096, targetWords * 4)),
      })
    }

    if (!working.written) {
      const written = await accounted('writer', `${control.caseTitle}:${control.run}:writer`, () => write(targetWords))
      working.written = written.data
      working.narration = written.data.narrative.flatMap((group) => group.sentences).map((sentence) => sentence.text).join(' ')
      working.citationMap = written.data.narrative.flatMap((group) =>
        group.sentences.map((sentence) => ({ text: sentence.text, claimId: group.claimId, factIds: sentence.factIds })),
      )
      persist()
    }
    const firstCount = words(working.narration ?? '')
    if (firstCount === 0) throw new Error(`Writer returned empty narration for ${key}`)
    if ((firstCount < minWords || firstCount > maxWords) && !working.compressionChecked) {
      const correctionWords = Math.max(80, Math.round((targetWords * targetWords) / firstCount))
      const compressed = await accounted('compression', `${control.caseTitle}:${control.run}:compression`, () => write(correctionWords, working?.written))
      working.written = compressed.data
      working.narration = compressed.data.narrative.flatMap((group) => group.sentences).map((sentence) => sentence.text).join(' ')
      working.citationMap = compressed.data.narrative.flatMap((group) =>
        group.sentences.map((sentence) => ({ text: sentence.text, claimId: group.claimId, factIds: sentence.factIds })),
      )
    }
    working.compressionChecked = true
    lastLabel = `${control.caseTitle}:${control.run}:compression-checked`
    persist()
    if (!working.narration || !working.written || !working.citationMap) throw new Error(`Writer state incomplete for ${key}`)
    if (!working.fidelity) {
      const fidelityPrompt = buildEbnFidelityPrompt({ facts, criticalIds, narration: working.narration })
      const fidelity = await accounted('fidelity', `${control.caseTitle}:${control.run}:fidelity`, () => llmCall({
        templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
        schema: EbnFidelitySchema,
        system: fidelityPrompt.system,
        messages: [{ role: 'user', content: fidelityPrompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 2000,
      }))
      working.fidelity = fidelity.data
      persist()
    }
    if (!working.ending) {
      const ending = await accounted('endingJudge', `${control.caseTitle}:${control.run}:ending-judge`, () => llmCall({
        templateVersion: 'ebn-five-claims-ending-judge.v0-probe',
        schema: EndingJudgeSchema,
        system: ENDING_JUDGE_SYSTEM,
        messages: [{ role: 'user', content: `TITLE: ${working?.written?.title}\n\nNARRATION:\n${working?.narration}` }],
        provider: 'anthropic',
        temperature: 0.2,
        maxTokens: 1000,
      }))
      working.ending = ending.data
      persist()
    }
    const result: CompactResult = {
      caseTitle: control.caseTitle,
      reelId: control.reelId,
      run: control.run,
      arm: 'fiveClaims',
      generatedTitle: working.written.title,
      narration: working.narration,
      wordCount: words(working.narration),
      sourceClaims: control.claims,
      claims: compactedClaims,
      citationMap: working.citationMap,
      fidelity: working.fidelity,
      ending: working.ending,
    }
    compactResults.push(result)
    working = undefined
    lastLabel = `${control.caseTitle}:${control.run}:draft-complete`
    persist()
    console.log(`[${control.caseTitle}] ${control.run}/${RUNS}: ${result.wordCount}w · double=${result.ending.doubleEnding} · report=${result.ending.reportLikeClose} · fidelity=${result.fidelity.issues.length}`)
  }

  for (const treatment of compactResults) {
    if (pairs.some((pair) => pair.reelId === treatment.reelId && pair.run === treatment.run)) continue
    const control = controls.find((row) => row.reelId === treatment.reelId && row.run === treatment.run)
    if (!control) throw new Error(`Missing control for ${treatment.caseTitle} ${treatment.run}`)
    const isA = treatmentFirst(treatment.reelId, treatment.run)
    const a = isA ? treatment : control
    const b = isA ? control : treatment
    const judged = await accounted('pairJudge', `${treatment.caseTitle}:${treatment.run}:pair`, () => llmCall({
      templateVersion: 'ebn-five-claims-pair.v0-probe',
      schema: PairJudgeSchema,
      system: PAIR_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: `DRAFT A\nTITLE: ${a.generatedTitle}\n${a.narration}\n\nDRAFT B\nTITLE: ${b.generatedTitle}\n${b.narration}` }],
      provider: 'anthropic',
      temperature: 0.2,
      maxTokens: 800,
    }))
    const preferredArm = judged.data.preferred === 'tie'
      ? 'tie'
      : judged.data.preferred === 'A' ? a.arm as Arm : b.arm as Arm
    pairs.push({
      caseTitle: treatment.caseTitle,
      reelId: treatment.reelId,
      run: treatment.run,
      aArm: a.arm as Arm,
      bArm: b.arm as Arm,
      preferredArm,
      reason: judged.data.reason,
    })
    lastLabel = `${treatment.caseTitle}:${treatment.run}:pair-complete`
    persist()
    console.log(`[pair ${treatment.caseTitle} ${treatment.run}] preferred=${preferredArm}`)
  }

  const kinds = new Map<string, number>()
  for (const row of compactResults) kinds.set(row.ending.endingKind, (kinds.get(row.ending.endingKind) ?? 0) + 1)
  const summary = {
    control: {
      drafts: controls.length,
      doubleEndings: controls.filter((row) => row.ending.doubleEnding).length,
      reportLikeCloses: controls.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: controls.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: controls.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
    },
    fiveClaims: {
      drafts: compactResults.length,
      debtPaid: compactResults.filter((row) => row.ending.debtPaid).length,
      doubleEndings: compactResults.filter((row) => row.ending.doubleEnding).length,
      laterReopensOrExplains: compactResults.filter((row) => row.ending.laterReopensOrExplains).length,
      reportLikeCloses: compactResults.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: compactResults.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: compactResults.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
      endingKinds: Object.fromEntries(kinds),
      distinctEndingKinds: kinds.size,
      maxKindCount: Math.max(0, ...kinds.values()),
    },
    pairwise: {
      fiveClaimsWins: pairs.filter((pair) => pair.preferredArm === 'fiveClaims').length,
      controlWins: pairs.filter((pair) => pair.preferredArm === 'control').length,
      ties: pairs.filter((pair) => pair.preferredArm === 'tie').length,
      pairs: pairs.length,
    },
  }
  const checks = {
    preferencePass: summary.pairwise.fiveClaimsWins >= 6,
    endpointPass: summary.fiveClaims.doubleEndings <= 1 && summary.fiveClaims.reportLikeCloses <= 5,
    fidelityPass: summary.fiveClaims.fidelityIssues <= 12,
    durationPass: summary.fiveClaims.inWordBudget >= 6,
    diversityPass: summary.fiveClaims.distinctEndingKinds >= 3 && summary.fiveClaims.maxKindCount <= Math.floor(summary.fiveClaims.drafts * 2 / 3),
  }
  const graduated = Object.values(checks).every(Boolean)
  const successfulRunCostCents = Object.values(spend).reduce((sum, cents) => sum + cents, 0)
  const totalCostCents = successfulRunCostCents + PRIOR_FAILED_RUN_CENTS
  const writerDiagnostic = existsSync(WRITER_DIAGNOSTIC_PATH)
    ? (JSON.parse(readFileSync(WRITER_DIAGNOSTIC_PATH, 'utf8')) as { summary?: unknown }).summary
    : undefined
  const report = {
    probe: 'ebn-five-claims.v0',
    generatedAt: new Date().toISOString(),
    baselinePath: BASELINE_PATH,
    writerDiagnosticPath: WRITER_DIAGNOSTIC_PATH,
    configuration: {
      runsPerCase: RUNS,
      targetSeconds,
      targetWords,
      wordWindow: [minWords, maxWords],
      sourceClaimCount: 7,
      treatmentClaimCount: 5,
      setupPartition: [[1], [2, 3], [4], [5, 6]],
      terminalClaimPreservedSeparately: true,
      evidenceIdUnionPreserved: true,
      writerVersion: `${STORY_EBN_WRITER_V1_VERSION}+spoken-landing+five-claims.v0-probe`,
      fidelityVersion: STORY_EBN_FIDELITY_V1_VERSION,
    },
    graduationBar: {
      fiveClaimsPairWins: '>=6/9',
      doubleEndings: '<=1/9',
      reportLikeCloses: '<=5/9',
      fidelityIssues: '<=12 frozen control',
      inWordBudget: '>=6/9 frozen control',
      diversity: '>=3 kinds; no kind >2/3',
    },
    summary,
    writerOnlyDiagnostic: writerDiagnostic,
    checks,
    decision: graduated ? 'five_claim_package_graduates_to_proposed_spec' : 'five_claim_package_does_not_graduate',
    spendCents: {
      ...spend,
      successfulRunTotal: successfulRunCostCents,
      priorFailedRunExact: PRIOR_FAILED_RUN_CENTS,
      total: totalCostCents,
    },
    pairs,
    controls,
    compactResults,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  lastLabel = 'complete'
  lastError = undefined
  persist()
  console.log('\n' + '═'.repeat(78))
  console.log(JSON.stringify({ summary, checks, decision: report.decision }, null, 2))
  console.log(`spend: ${totalCostCents}¢ ($${(totalCostCents / 100).toFixed(2)})`)
  console.log(`report: ${OUT}`)
  process.exit(0)
})()
