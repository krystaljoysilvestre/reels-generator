// Crossroads EBN endpoint-contract probe (2026-08-29).
//
// CONTROL: the nine production-prompt control drafts frozen in probe-ebn-ending-brief.json.
// TREATMENT: the same live Crossroads brief, Evidence Bibles, EBN permissions, model, word budget, and
// fidelity checker. The EBN planner additionally emits an evidence-anchored endpoint contract; the EBN
// writer consumes it and treats claims as evidence units rather than equal sentence quotas.
//
// This tests one vertical mechanism: Planner chooses the ending's narrative intent and anchors it to
// claim ids; Writer realizes that intent without acquiring facts. The ending function is free prose,
// not an enum or prescribed surface form. It may be factual, human, ironic, visual, unresolved, etc.
//
// PRE-REGISTERED GRADUATION BAR (default n=3 per story, nine treatment drafts):
//  1. Blind preference: contract wins >=6/9 pairs.
//  2. Endpoint integrity: <=1/9 double endings and <=5/9 report-like closes.
//  3. Fidelity veto: no more total FFC issues than the frozen control (12).
//  4. Duration: at least the frozen control's 6/9 drafts inside the 176–216 word production window.
//  5. Diversity veto: >=3 ending kinds and no one kind in >2/3 of drafts.
// All five must pass. Otherwise the contract does not graduate to production.
//
// Read-only production-data probe. Paid calls are checkpointed and cost-accounted; no database writes.
// Usage (cwd apps/worker): pnpm exec tsx scripts/probe-ebn-ending-contract.ts
import '../src/env.js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const EndingContractSchema = z.object({
  openingDebt: z.string().min(1),
  resolutionClaimIds: z.array(z.string()).min(1),
  uncertaintyClaimIds: z.array(z.string()).default([]),
  mustPrecedeTerminalClaimIds: z.array(z.string()).default([]),
  terminalClaimId: z.string().min(1),
  terminalPurpose: z.string().min(1),
  endingFunction: z.string().min(1),
  afterTerminalFailure: z.string().min(1),
})

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

type Spend = { planner: number; writer: number; compression: number; fidelity: number; endingJudge: number; pairJudge: number }
type Arm = 'control' | 'contract'

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length
const treatmentFirst = (reelId: string, run: number) =>
  ((createHash('sha256').update(`${reelId}:${run}:ending-contract`).digest()[0] ?? 0) % 2) === 0

void (async () => {
  const RUNS = Math.max(1, Number(process.env['PROBE_RUNS'] ?? 3))
  const BASELINE_PATH = process.env['PROBE_BASELINE'] ?? 'probe-ebn-ending-brief.json'
  const OUT = process.env['PROBE_OUT'] ?? 'probe-ebn-ending-contract.json'
  const { llmCall } = await import('@reels/providers')
  const { getDb, channels, reels, stories } = await import('@reels/db')
  const { and, desc, eq } = await import('drizzle-orm')
  const {
    buildEbnPlannerPrompt,
    STORY_EBN_PLANNER_V1_VERSION,
    EbnClaimsSchema,
    buildEbnWriterPrompt,
    STORY_EBN_WRITER_V1_VERSION,
    EbnWriterSchema,
    TRUE_CRIME_PERMISSIONS,
    buildEbnFidelityPrompt,
    STORY_EBN_FIDELITY_V1_VERSION,
    EbnFidelitySchema,
    EvidenceBibleSchema,
    composeTasteRubric,
  } = await import('../src/prompts-bridge.js')

  const ContractPlannerSchema = EbnClaimsSchema.extend({ endingContract: EndingContractSchema })
  const BaseResultSchema = z.object({
    caseTitle: z.string(),
    reelId: z.string(),
    run: z.number(),
    arm: z.string(),
    generatedTitle: z.string(),
    narration: z.string(),
    wordCount: z.number(),
    fidelity: EbnFidelitySchema,
    ending: EndingJudgeSchema,
  })
  const BaselineSchema = z.object({ results: z.array(BaseResultSchema) })
  const baseline = BaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')))
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
  const maxClaims = Math.max(4, Math.min(14, Math.round(targetWords / 28)))
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

  const spend: Spend = { planner: 0, writer: 0, compression: 0, fidelity: 0, endingJudge: 0, pairJudge: 0 }
  const checkpoint = (label: string, error?: string) => writeFileSync(`${OUT}.checkpoint.json`, JSON.stringify({
    probe: 'ebn-ending-contract.v0', updatedAt: new Date().toISOString(), label, spendCents: spend,
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

  const contractResults: Array<{
    caseTitle: string
    reelId: string
    run: number
    arm: 'contract'
    generatedTitle: string
    narration: string
    wordCount: number
    contract: z.infer<typeof EndingContractSchema>
    contractValid: boolean
    claims: z.infer<typeof EbnClaimsSchema>['claims']
    citationMap: Array<{ text: string; claimId: string; factIds: string[] }>
    fidelity: z.infer<typeof EbnFidelitySchema>
    ending: z.infer<typeof EndingJudgeSchema>
  }> = []

  for (const row of cases) {
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
    const brief = makeBrief(row)

    for (let run = 1; run <= RUNS; run++) {
      const basePlanner = buildEbnPlannerPrompt({
        language: row.language,
        facts,
        criticalIds,
        targetNote: `a ~${targetWords}-word historical events story that fulfills the editorial brief`,
        editorialBrief: brief,
        maxClaims,
      })
      const plannerSystem = `${basePlanner.system}

ENDPOINT CONTRACT — after choosing the claims, make one additional narrative-intent decision anchored entirely to those claim ids:
- openingDebt: the question, tension, or declared structure the opening will make the audience expect the story to pay.
- resolutionClaimIds: the existing claims that answer or honestly bound that debt.
- uncertaintyClaimIds: existing claims carrying any evidentiary uncertainty the audience must understand before the ending; empty is valid.
- mustPrecedeTerminalClaimIds: claims whose content must land before the terminal claim can do its unique closing work; empty is valid.
- terminalClaimId: the one existing claim that should be LAST because it does unique closing work.
- terminalPurpose: what that claim should accomplish for the audience, never proposed wording or a new fact.
- endingFunction: describe the function this specific story earns. Choose freely; do not default to a moral, human coda, object, image, CTA, summary, or any fixed form.
- afterTerminalFailure: name what kind of repetition, explanation, or reopening would dilute this specific ending.

The contract is editorial metadata, NEVER evidence. It may only reference claim ids you emit. Arrange terminalClaimId last.`
      const plannerUser = basePlanner.userMessage.replace(
        / OUTPUT \(JSON only\):[\s\S]*$/u,
        ` OUTPUT (JSON only):\n{ "claims": [ { "id": "C1", "order": 1, "purpose": "", "evidence": ["F01"] } ], "endingContract": { "openingDebt": "", "resolutionClaimIds": ["C1"], "uncertaintyClaimIds": [], "mustPrecedeTerminalClaimIds": [], "terminalClaimId": "C1", "terminalPurpose": "", "endingFunction": "", "afterTerminalFailure": "" } }`,
      )
      const planned = await accounted('planner', `${row.title}:${run}:planner`, () => llmCall({
        templateVersion: 'story-ebn-planner.v1.3+endpoint-contract.v0-probe',
        schema: ContractPlannerSchema,
        system: plannerSystem,
        messages: [{ role: 'user', content: plannerUser }],
        provider: 'anthropic',
        maxTokens: 2400,
      }))
      const claims = planned.data.claims.sort((a, b) => a.order - b.order)
      const contract = EndingContractSchema.parse(planned.data.endingContract)
      const claimIds = new Set(claims.map((claim) => claim.id))
      const referencedIds = [
        ...contract.resolutionClaimIds,
        ...contract.uncertaintyClaimIds,
        ...contract.mustPrecedeTerminalClaimIds,
        contract.terminalClaimId,
      ]
      const contractValid = referencedIds.every((id) => claimIds.has(id))
        && claims.at(-1)?.id === contract.terminalClaimId
        && !contract.mustPrecedeTerminalClaimIds.includes(contract.terminalClaimId)

      const claimsWithFacts = claims.map((claim) => ({
        id: claim.id,
        order: claim.order,
        purpose: claim.purpose,
        facts: claim.evidence
          .map((id) => factById.get(id))
          .filter((fact) => fact !== undefined)
          .map((fact) => ({ id: fact.id, stance: fact.stance, attributed_to: fact.attributed_to, value: fact.value })),
      }))
      const write = async (requestedWords: number, previous?: z.infer<typeof EbnWriterSchema>) => {
        const baseWriter = buildEbnWriterPrompt({
          language: row.language,
          claims: claimsWithFacts,
          permissions: TRUE_CRIME_PERMISSIONS,
          editorialBrief: brief,
          targetWords: requestedWords,
        })
        const writerSystem = `${baseWriter.system.replace(
          '- For short-form budgets, write one efficient sentence per claim whenever possible. A claim may cite several facts; that is the intended compression mechanism. Keep each narration sentence at or below 30 words.',
          '- Narrative Claims are evidence units, not equal prose beats. Compress routine context; give pivotal and terminal claims the sentence space they earn. Keep each narration sentence at or below 30 words.',
        )}

ENDPOINT CONTRACT (editorial direction, NEVER evidence):
${JSON.stringify(contract, null, 2)}

Realize the contract using only the supplied claims and their cited facts. The terminal claim stays last. Its passage must pay or honestly bound openingDebt and perform terminalPurpose. Material named in mustPrecedeTerminalClaimIds and uncertaintyClaimIds must be understood before the terminal passage. Once the terminal passage has done its unique work, STOP; do not append a moral, explanation, restatement, CTA, or second conclusion. This does not prescribe a surface form — use the ending function this story earned.

Write as natural SPOKEN ${row.language}: something a real narrator would say aloud in this language, never translation-shaped or report-shaped prose.`
        const previousBlock = previous
          ? `\n\nPREVIOUS CITED DRAFT TO COMPRESS:\n${JSON.stringify(previous, null, 2)}\n\nReturn a complete replacement JSON object. Preserve the endpoint contract, factual spine, and citations while bringing the narration inside the hard word budget.`
          : ''
        return llmCall({
          templateVersion: 'story-ebn-writer.v1.6+endpoint-contract.v0-probe',
          schema: EbnWriterSchema,
          system: writerSystem,
          messages: [{ role: 'user', content: `${baseWriter.userMessage}${previousBlock}` }],
          provider: 'anthropic' as const,
          maxTokens: Math.min(16384, Math.max(4096, targetWords * 4)),
        })
      }
      let written = await accounted('writer', `${row.title}:${run}:writer`, () => write(targetWords))
      const narrate = (draft: z.infer<typeof EbnWriterSchema>) => draft.narrative
        .flatMap((group) => group.sentences)
        .map((sentence) => sentence.text)
        .join(' ')
      let narration = narrate(written.data)
      const firstCount = words(narration)
      if (firstCount < minWords || firstCount > maxWords) {
        const correctionWords = Math.max(80, Math.round((targetWords * targetWords) / firstCount))
        written = await accounted('compression', `${row.title}:${run}:compression`, () => write(correctionWords, written.data))
        narration = narrate(written.data)
      }
      const citationMap = written.data.narrative.flatMap((group) =>
        group.sentences.map((sentence) => ({ text: sentence.text, claimId: group.claimId, factIds: sentence.factIds })),
      )
      const fidelityPrompt = buildEbnFidelityPrompt({ facts, criticalIds, narration })
      const fidelity = await accounted('fidelity', `${row.title}:${run}:fidelity`, () => llmCall({
        templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
        schema: EbnFidelitySchema,
        system: fidelityPrompt.system,
        messages: [{ role: 'user', content: fidelityPrompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 2000,
      }))
      const ending = await accounted('endingJudge', `${row.title}:${run}:ending-judge`, () => llmCall({
        templateVersion: 'ebn-ending-contract-judge.v0-probe',
        schema: EndingJudgeSchema,
        system: ENDING_JUDGE_SYSTEM,
        messages: [{ role: 'user', content: `TITLE: ${written.data.title}\n\nNARRATION:\n${narration}` }],
        provider: 'anthropic',
        temperature: 0.2,
        maxTokens: 1000,
      }))
      contractResults.push({
        caseTitle: row.title,
        reelId: row.reelId,
        run,
        arm: 'contract',
        generatedTitle: written.data.title,
        narration,
        wordCount: words(narration),
        contract,
        contractValid,
        claims,
        citationMap,
        fidelity: EbnFidelitySchema.parse(fidelity.data),
        ending: ending.data,
      })
      console.log(`[${row.title}] ${run}/${RUNS}: ${words(narration)}w · contract=${contractValid} · double=${ending.data.doubleEnding} · report=${ending.data.reportLikeClose} · fidelity=${fidelity.data.issues.length}`)
    }
  }

  const pairs: Array<{
    caseTitle: string
    run: number
    aArm: Arm
    bArm: Arm
    preferredArm: Arm | 'tie'
    reason: string
  }> = []
  for (const contract of contractResults) {
    const control = controls.find((row) => row.reelId === contract.reelId && row.run === contract.run)
    if (!control) throw new Error(`Missing frozen control for ${contract.caseTitle} run ${contract.run}`)
    const contractIsA = treatmentFirst(contract.reelId, contract.run)
    const a = contractIsA ? contract : control
    const b = contractIsA ? control : contract
    const judged = await accounted('pairJudge', `${contract.caseTitle}:${contract.run}:pair`, () => llmCall({
      templateVersion: 'ebn-ending-contract-pair.v0-probe',
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
    pairs.push({ caseTitle: contract.caseTitle, run: contract.run, aArm: a.arm as Arm, bArm: b.arm as Arm, preferredArm, reason: judged.data.reason })
    console.log(`[pair ${contract.caseTitle} ${contract.run}] preferred=${preferredArm}`)
  }

  const kinds = new Map<string, number>()
  for (const row of contractResults) kinds.set(row.ending.endingKind, (kinds.get(row.ending.endingKind) ?? 0) + 1)
  const summary = {
    control: {
      drafts: controls.length,
      doubleEndings: controls.filter((row) => row.ending.doubleEnding).length,
      reportLikeCloses: controls.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: controls.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: controls.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
    },
    contract: {
      drafts: contractResults.length,
      validContracts: contractResults.filter((row) => row.contractValid).length,
      debtPaid: contractResults.filter((row) => row.ending.debtPaid).length,
      doubleEndings: contractResults.filter((row) => row.ending.doubleEnding).length,
      laterReopensOrExplains: contractResults.filter((row) => row.ending.laterReopensOrExplains).length,
      reportLikeCloses: contractResults.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: contractResults.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      inWordBudget: contractResults.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
      endingKinds: Object.fromEntries(kinds),
      distinctEndingKinds: kinds.size,
      maxKindCount: Math.max(0, ...kinds.values()),
    },
    pairwise: {
      contractWins: pairs.filter((pair) => pair.preferredArm === 'contract').length,
      controlWins: pairs.filter((pair) => pair.preferredArm === 'control').length,
      ties: pairs.filter((pair) => pair.preferredArm === 'tie').length,
      pairs: pairs.length,
    },
  }
  const checks = {
    preferencePass: summary.pairwise.contractWins >= 6,
    endpointPass: summary.contract.doubleEndings <= 1 && summary.contract.reportLikeCloses <= 5,
    fidelityPass: summary.contract.fidelityIssues <= summary.control.fidelityIssues,
    durationPass: summary.contract.inWordBudget >= summary.control.inWordBudget,
    diversityPass: summary.contract.distinctEndingKinds >= 3 && summary.contract.maxKindCount <= Math.floor(summary.contract.drafts * 2 / 3),
    contractValidityPass: summary.contract.validContracts === summary.contract.drafts,
  }
  const graduated = Object.values(checks).every(Boolean)
  const totalCostCents = Object.values(spend).reduce((sum, cents) => sum + cents, 0)
  const report = {
    probe: 'ebn-ending-contract.v0',
    generatedAt: new Date().toISOString(),
    baselinePath: BASELINE_PATH,
    configuration: {
      runsPerCase: RUNS,
      targetSeconds,
      targetWords,
      wordWindow: [minWords, maxWords],
      maxClaims,
      plannerVersion: `${STORY_EBN_PLANNER_V1_VERSION}+endpoint-contract.v0-probe`,
      writerVersion: `${STORY_EBN_WRITER_V1_VERSION}+endpoint-contract.v0-probe`,
      fidelityVersion: STORY_EBN_FIDELITY_V1_VERSION,
    },
    graduationBar: {
      contractPairWins: '>=6/9',
      doubleEndings: '<=1/9',
      reportLikeCloses: '<=5/9',
      fidelityIssues: '<=control',
      inWordBudget: '>=control',
      diversity: '>=3 kinds; no kind >2/3',
      validContracts: 'all',
    },
    summary,
    checks,
    decision: graduated ? 'contract_graduates_to_proposed_spec' : 'contract_does_not_graduate',
    spendCents: { ...spend, total: totalCostCents },
    pairs,
    controls,
    contractResults,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log('\n' + '═'.repeat(78))
  console.log(JSON.stringify({ summary, checks, decision: report.decision }, null, 2))
  console.log(`spend: ${totalCostCents}¢ ($${(totalCostCents / 100).toFixed(2)})`)
  console.log(`report: ${OUT}`)
  process.exit(0)
})()
