// Crossroads EBN writer-only landing probe (2026-08-29).
//
// CONTROL: the nine production-prompt control drafts frozen in probe-ebn-ending-brief.json.
// TREATMENT: reuse each control's exact Narrative Claims and frozen Evidence Bible. Change only the
// existing EBN Writer guidance: claims are evidence units rather than equal prose beats; the hard word
// budget wins; write in the requested language's spoken register; let the final supported beat do one
// unique job and stop. No planner change, ending schema, ending enum, editor, or new production stage.
//
// PRE-REGISTERED GRADUATION BAR (nine treatment drafts):
//  1. Blind preference: writer treatment wins >=6/9 pairs.
//  2. Endpoint integrity: <=1/9 double endings and <=5/9 report-like closes.
//  3. Fidelity veto: no more FFC issues than frozen control (12).
//  4. Duration: at least frozen control's 6/9 drafts inside 176–216 words.
//  5. Diversity veto: >=3 ending kinds and no one kind in >2/3 of drafts.
// All five must pass. Read-only data probe; every paid call is checkpointed and cost-accounted.
//
// Usage (cwd apps/worker): pnpm exec tsx scripts/probe-ebn-writer-landing.ts
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
type Arm = 'control' | 'writer'

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length
const writerFirst = (reelId: string, run: number) =>
  ((createHash('sha256').update(`${reelId}:${run}:writer-landing`).digest()[0] ?? 0) % 2) === 0

void (async () => {
  const RUNS = Math.max(1, Number(process.env['PROBE_RUNS'] ?? 3))
  const BASELINE_PATH = process.env['PROBE_BASELINE'] ?? 'probe-ebn-ending-brief.json'
  const OUT = process.env['PROBE_OUT'] ?? 'probe-ebn-writer-landing.json'
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
  const baseline = z.object({ results: z.array(BaseResultSchema) })
    .parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')))
  const controls = baseline.results.filter((row) => row.arm === 'control' && row.run <= RUNS)
  if (controls.length !== RUNS * 3) throw new Error(`Expected ${RUNS * 3} frozen controls; found ${controls.length}`)

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

  const spend: Spend = { writer: 0, compression: 0, fidelity: 0, endingJudge: 0, pairJudge: 0 }
  const checkpoint = (label: string, error?: string) => writeFileSync(`${OUT}.checkpoint.json`, JSON.stringify({
    probe: 'ebn-writer-landing.v0', updatedAt: new Date().toISOString(), label, spendCents: spend,
    ...(error ? { error } : {}),
  }, null, 2))
  const accounted = async <T>(key: keyof Spend, label: string, call: () => Promise<{ data: T; costCents: number }>) => {
    try {
      const result = await call()
      spend[key] += result.costCents
      checkpoint(label)
      return result
    } catch (error) {
      const reported = typeof error === 'object' && error !== null && 'costCents' in error
        ? Number((error as { costCents?: unknown }).costCents ?? 0)
        : 0
      if (Number.isFinite(reported) && reported > 0) spend[key] += reported
      checkpoint(label, String(error))
      throw error
    }
  }

  const writerResults: Array<{
    caseTitle: string
    reelId: string
    run: number
    arm: 'writer'
    generatedTitle: string
    narration: string
    wordCount: number
    claims: z.infer<typeof EbnClaimsSchema>['claims']
    citationMap: Array<{ text: string; claimId: string; factIds: string[] }>
    fidelity: z.infer<typeof EbnFidelitySchema>
    ending: z.infer<typeof EndingJudgeSchema>
  }> = []
  if (existsSync(PARTIAL_OUT)) {
    const partial = JSON.parse(readFileSync(PARTIAL_OUT, 'utf8')) as {
      spendCents?: Partial<Spend>
      writerResults?: typeof writerResults
    }
    for (const key of Object.keys(spend) as Array<keyof Spend>) spend[key] = Number(partial.spendCents?.[key] ?? 0)
    writerResults.push(...(partial.writerResults ?? []))
    console.log(`resuming ${writerResults.length}/${controls.length} completed writer drafts from ${PARTIAL_OUT}`)
  }
  const persistWriterProgress = () => writeFileSync(PARTIAL_OUT, JSON.stringify({
    probe: 'ebn-writer-landing.v0',
    updatedAt: new Date().toISOString(),
    spendCents: spend,
    writerResults,
  }, null, 2))

  for (const control of controls) {
    if (writerResults.some((result) => result.reelId === control.reelId && result.run === control.run)) continue
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
    const claimsWithFacts = control.claims.map((claim) => ({
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
        templateVersion: 'story-ebn-writer.v1.6+spoken-landing.v0-probe',
        schema: EbnWriterSchema,
        system,
        messages: [{ role: 'user', content: `${base.userMessage}${previousBlock}` }],
        provider: 'anthropic' as const,
        maxTokens: Math.min(16384, Math.max(4096, targetWords * 4)),
      })
    }

    let written = await accounted('writer', `${control.caseTitle}:${control.run}:writer`, () => write(targetWords))
    const narrate = (draft: z.infer<typeof EbnWriterSchema>) => draft.narrative
      .flatMap((group) => group.sentences)
      .map((sentence) => sentence.text)
      .join(' ')
    let narration = narrate(written.data)
    const firstCount = words(narration)
    if (firstCount < minWords || firstCount > maxWords) {
      const correctionWords = Math.max(80, Math.round((targetWords * targetWords) / firstCount))
      written = await accounted('compression', `${control.caseTitle}:${control.run}:compression`, () => write(correctionWords, written.data))
      narration = narrate(written.data)
    }
    const citationMap = written.data.narrative.flatMap((group) =>
      group.sentences.map((sentence) => ({ text: sentence.text, claimId: group.claimId, factIds: sentence.factIds })),
    )
    const fidelityPrompt = buildEbnFidelityPrompt({ facts, criticalIds, narration })
    const fidelity = await accounted('fidelity', `${control.caseTitle}:${control.run}:fidelity`, () => llmCall({
      templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
      schema: EbnFidelitySchema,
      system: fidelityPrompt.system,
      messages: [{ role: 'user', content: fidelityPrompt.userMessage }],
      provider: 'anthropic',
      maxTokens: 2000,
    }))
    const ending = await accounted('endingJudge', `${control.caseTitle}:${control.run}:ending-judge`, () => llmCall({
      templateVersion: 'ebn-writer-landing-judge.v0-probe',
      schema: EndingJudgeSchema,
      system: ENDING_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: `TITLE: ${written.data.title}\n\nNARRATION:\n${narration}` }],
      provider: 'anthropic',
      temperature: 0.2,
      maxTokens: 1000,
    }))
    writerResults.push({
      caseTitle: control.caseTitle,
      reelId: control.reelId,
      run: control.run,
      arm: 'writer',
      generatedTitle: written.data.title,
      narration,
      wordCount: words(narration),
      claims: control.claims,
      citationMap,
      fidelity: fidelity.data,
      ending: ending.data,
    })
    persistWriterProgress()
    console.log(`[${control.caseTitle}] ${control.run}/${RUNS}: ${words(narration)}w · double=${ending.data.doubleEnding} · report=${ending.data.reportLikeClose} · fidelity=${fidelity.data.issues.length}`)
  }

  const pairs: Array<{ caseTitle: string; run: number; aArm: Arm; bArm: Arm; preferredArm: Arm | 'tie'; reason: string }> = []
  for (const writer of writerResults) {
    const control = controls.find((row) => row.reelId === writer.reelId && row.run === writer.run)
    if (!control) throw new Error(`Missing control for ${writer.caseTitle} ${writer.run}`)
    const isA = writerFirst(writer.reelId, writer.run)
    const a = isA ? writer : control
    const b = isA ? control : writer
    const judged = await accounted('pairJudge', `${writer.caseTitle}:${writer.run}:pair`, () => llmCall({
      templateVersion: 'ebn-writer-landing-pair.v0-probe',
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
    pairs.push({ caseTitle: writer.caseTitle, run: writer.run, aArm: a.arm as Arm, bArm: b.arm as Arm, preferredArm, reason: judged.data.reason })
    console.log(`[pair ${writer.caseTitle} ${writer.run}] preferred=${preferredArm}`)
  }

  const kinds = new Map<string, number>()
  for (const row of writerResults) kinds.set(row.ending.endingKind, (kinds.get(row.ending.endingKind) ?? 0) + 1)
  const summary = {
    control: {
      drafts: controls.length,
      doubleEndings: controls.filter((row) => row.ending.doubleEnding).length,
      reportLikeCloses: controls.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: controls.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: controls.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
    },
    writer: {
      drafts: writerResults.length,
      debtPaid: writerResults.filter((row) => row.ending.debtPaid).length,
      doubleEndings: writerResults.filter((row) => row.ending.doubleEnding).length,
      laterReopensOrExplains: writerResults.filter((row) => row.ending.laterReopensOrExplains).length,
      reportLikeCloses: writerResults.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: writerResults.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: writerResults.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
      endingKinds: Object.fromEntries(kinds),
      distinctEndingKinds: kinds.size,
      maxKindCount: Math.max(0, ...kinds.values()),
    },
    pairwise: {
      writerWins: pairs.filter((pair) => pair.preferredArm === 'writer').length,
      controlWins: pairs.filter((pair) => pair.preferredArm === 'control').length,
      ties: pairs.filter((pair) => pair.preferredArm === 'tie').length,
      pairs: pairs.length,
    },
  }
  const checks = {
    preferencePass: summary.pairwise.writerWins >= 6,
    endpointPass: summary.writer.doubleEndings <= 1 && summary.writer.reportLikeCloses <= 5,
    fidelityPass: summary.writer.fidelityIssues <= summary.control.fidelityIssues,
    durationPass: summary.writer.inWordBudget >= summary.control.inWordBudget,
    diversityPass: summary.writer.distinctEndingKinds >= 3 && summary.writer.maxKindCount <= Math.floor(summary.writer.drafts * 2 / 3),
  }
  const graduated = Object.values(checks).every(Boolean)
  const successfulRunCostCents = Object.values(spend).reduce((sum, cents) => sum + cents, 0)
  const totalCostCents = successfulRunCostCents + PRIOR_FAILED_RUN_CENTS
  const report = {
    probe: 'ebn-writer-landing.v0',
    generatedAt: new Date().toISOString(),
    baselinePath: BASELINE_PATH,
    configuration: {
      runsPerCase: RUNS,
      targetSeconds,
      targetWords,
      wordWindow: [minWords, maxWords],
      writerVersion: `${STORY_EBN_WRITER_V1_VERSION}+spoken-landing.v0-probe`,
      fidelityVersion: STORY_EBN_FIDELITY_V1_VERSION,
    },
    graduationBar: {
      writerPairWins: '>=6/9',
      doubleEndings: '<=1/9',
      reportLikeCloses: '<=5/9',
      fidelityIssues: '<=control',
      inWordBudget: '>=control',
      diversity: '>=3 kinds; no kind >2/3',
    },
    summary,
    checks,
    decision: graduated ? 'writer_change_graduates_to_proposed_spec' : 'writer_change_does_not_graduate',
    spendCents: {
      ...spend,
      successfulRunTotal: successfulRunCostCents,
      priorFailedRunExact: PRIOR_FAILED_RUN_CENTS,
      total: totalCostCents,
    },
    pairs,
    controls,
    writerResults,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log('\n' + '═'.repeat(78))
  console.log(JSON.stringify({ summary, checks, decision: report.decision }, null, 2))
  console.log(`spend: ${totalCostCents}¢ ($${(totalCostCents / 100).toFixed(2)})`)
  console.log(`report: ${OUT}`)
  process.exit(0)
})()
