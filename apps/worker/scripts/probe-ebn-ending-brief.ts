// Crossroads EBN ending-brief probe (2026-08-29).
//
// Question: is the live channel's fixed seven-part structure + mandatory "Final Thought" causing
// evidence-safe stories to arrive at their ending and then explain it again?
//
// CONTROL: the current Crossroads niche description, unchanged.
// TREATMENT: only the Story Structure section is replaced by an endpoint-integrity goal. The Evidence
// Bible, EBN planner/writer prompts, model, word/claim budgets, permissions, and factual checks stay fixed.
// The treatment names possible ending functions as choices, never quotas or a mandatory surface form.
//
// PRE-REGISTERED DECISION RULES (do not move after seeing output; default n=3 per reel/arm):
//  1. Pairwise preference: treatment wins at least two thirds of blind pairs; OR treatment reduces
//     double endings by at least 3 across the 9 generated stories.
//  2. Fidelity veto: treatment may not produce more Fact-Fidelity Checker issues than control.
//  3. Diversity veto: treatment must retain at least 3 ending kinds and no one kind may exceed 2/3.
//  4. Falsifier: treatment double-ends in at least half its drafts, loses fidelity, or collapses form.
//
// This is a read-only production-data probe. It makes paid, fully cost-accounted LLM calls but writes
// no channel, reel, story, or pipeline-step row. The JSON report records spend by call class and total.
//
// Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-ebn-ending-brief.ts
//   PROBE_RUNS=1 pnpm exec tsx scripts/probe-ebn-ending-brief.ts   # smoke
import '../src/env.js'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
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

Quote the actual closing lines and terminal beat. Judge only what the narration does.

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

type Spend = {
  planner: number
  writer: number
  compression: number
  fidelity: number
  endingJudge: number
  pairJudge: number
}

type Arm = 'control' | 'treatment'

function words(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length
}

function treatmentNiche(control: string): string {
  const start = control.indexOf('## Story Structure')
  const end = control.indexOf('\n## Tone', start)
  if (start < 0 || end < 0) throw new Error('Crossroads Story Structure section was not found; refusing to run a non-isolated treatment.')
  const replacement = `## Story Shape

Make the real crossroads and the limits of the other road intelligible. End on the supported consequence, verdict, image, irony, callback, or uncertainty this story earns. Nothing after it should reopen or explain the ending.
`
  return `${control.slice(0, start)}${replacement}${control.slice(end)}`
}

function addSpend(spend: Spend, key: keyof Spend, cents: number): void {
  spend[key] += cents
}

function shuffledTreatmentFirst(reelId: string, run: number): boolean {
  return (createHash('sha256').update(`${reelId}:${run}:ending-brief`).digest()[0] ?? 0) % 2 === 0
}

void (async () => {
  const RUNS = Math.max(1, Number(process.env['PROBE_RUNS'] ?? 3))
  const OUT = process.env['PROBE_OUT'] ?? 'probe-ebn-ending-brief.json'
  const PRIOR_FAILED_ATTEMPT_ESTIMATE_CENTS = Math.max(0, Number(process.env['PROBE_PRIOR_FAILED_CENTS'] ?? 0))
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

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.name, 'Crossroads') })
  if (!channel) throw new Error('Crossroads channel not found')

  const sourceRows = await db
    .select({
      reelId: reels.id,
      status: reels.status,
      language: reels.language,
      seedIdea: reels.seedIdea,
      evidenceBible: reels.evidenceBible,
      title: stories.title,
      acceptedBody: stories.body,
      createdAt: reels.createdAt,
    })
    .from(reels)
    .innerJoin(stories, eq(reels.storyId, stories.id))
    .where(and(eq(reels.channelId, channel.id), eq(reels.status, 'approved')))
    .orderBy(desc(reels.createdAt))

  const cases = sourceRows.filter((row) => row.evidenceBible).slice(0, 3)
  if (cases.length !== 3) throw new Error(`Expected 3 approved Crossroads reels with frozen Evidence Bibles; found ${cases.length}`)

  const controlNiche = channel.nicheDescription
  const leanNiche = treatmentNiche(controlNiche)
  const targetSeconds = channel.targetSeconds ?? 75
  const targetWords = Math.round(Math.max(10, targetSeconds - 1.8) * 2.5) // informational outro tail = 1.8s
  const minWords = Math.round(targetWords * 0.9)
  const maxWords = Math.round(targetWords * 1.1)
  const maxClaims = Math.max(4, Math.min(14, Math.round(targetWords / 28)))
  const tasteRubric = composeTasteRubric({
    tasteRubric: channel.tasteRubric,
    editorialPrinciples: channel.editorialPrinciples,
    genreCategory: channel.genreCategory,
    niche: channel.nicheDescription,
  })
  const spend: Spend = { planner: 0, writer: 0, compression: 0, fidelity: 0, endingJudge: 0, pairJudge: 0 }
  const checkpoint = (label: string, error?: string) => writeFileSync(`${OUT}.checkpoint.json`, JSON.stringify({
    probe: 'ebn-ending-brief.v0',
    updatedAt: new Date().toISOString(),
    label,
    spendCents: spend,
    priorFailedAttemptEstimateCents: PRIOR_FAILED_ATTEMPT_ESTIMATE_CENTS,
    ...(error ? { error } : {}),
  }, null, 2))
  const accounted = async <T>(key: keyof Spend, label: string, call: () => Promise<{ data: T; costCents: number }>) => {
    try {
      const result = await call()
      addSpend(spend, key, result.costCents)
      checkpoint(label)
      return result
    } catch (error) {
      const reported = typeof error === 'object' && error !== null && 'costCents' in error
        ? Number((error as { costCents?: unknown }).costCents ?? 0)
        : 0
      if (Number.isFinite(reported) && reported > 0) addSpend(spend, key, reported)
      checkpoint(label, String(error))
      throw error
    }
  }

  const results: Array<{
    caseTitle: string
    reelId: string
    run: number
    arm: Arm
    generatedTitle: string
    narration: string
    wordCount: number
    claims: unknown
    citationMap: Array<{ text: string; claimId: string; factIds: string[] }>
    fidelity: z.infer<typeof EbnFidelitySchema>
    ending: z.infer<typeof EndingJudgeSchema>
  }> = []

  const makeBrief = (row: (typeof cases)[number], niche: string) => JSON.stringify({
    channel: channel.name,
    channelPromise: niche,
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

  for (const row of cases) {
    const bible = EvidenceBibleSchema.parse(row.evidenceBible)
    const bibleForModel = bible.facts.map((fact) => ({
      id: fact.id,
      stance: fact.stance,
      weight: fact.weight,
      ...(fact.attributed_to ? { attributed_to: fact.attributed_to } : {}),
      value: fact.value,
    }))
    const criticalIds = bible.facts.filter((fact) => fact.weight === 'Critical').map((fact) => fact.id)
    const factById = new Map(bible.facts.map((fact) => [fact.id, fact]))

    for (let run = 1; run <= RUNS; run++) {
      for (const arm of ['control', 'treatment'] as const) {
        const niche = arm === 'control' ? controlNiche : leanNiche
        const brief = makeBrief(row, niche)
        const planner = buildEbnPlannerPrompt({
          language: row.language,
          facts: bibleForModel,
          criticalIds,
          targetNote: `a ~${targetWords}-word historical events story that fulfills the editorial brief`,
          editorialBrief: brief,
          maxClaims,
        })
        const planned = await accounted('planner', `${row.title}:${run}:${arm}:planner`, () => llmCall({
          templateVersion: STORY_EBN_PLANNER_V1_VERSION,
          schema: EbnClaimsSchema,
          system: planner.system,
          messages: [{ role: 'user', content: planner.userMessage }],
          provider: 'anthropic',
          maxTokens: 2000,
        }))
        const rawClaims = planned.data.claims.sort((a, b) => a.order - b.order)
        const claims = rawClaims.length <= maxClaims
          ? rawClaims
          : Array.from({ length: maxClaims }, (_, bucketIndex) => {
              const start = Math.floor((bucketIndex * rawClaims.length) / maxClaims)
              const end = Math.floor(((bucketIndex + 1) * rawClaims.length) / maxClaims)
              const bucket = rawClaims.slice(start, end)
              return {
                id: `C${bucketIndex + 1}`,
                order: bucketIndex + 1,
                purpose: bucket.map((claim) => claim.purpose).join('; '),
                evidence: [...new Set(bucket.flatMap((claim) => claim.evidence))],
              }
            })
        const claimsWithFacts = claims.map((claim) => ({
          id: claim.id,
          order: claim.order,
          purpose: claim.purpose,
          facts: claim.evidence
            .map((id) => factById.get(id))
            .filter((fact) => fact !== undefined)
            .map((fact) => ({ id: fact.id, stance: fact.stance, attributed_to: fact.attributed_to, value: fact.value })),
        }))

        const write = async (writerBrief: string, requestedWords: number, previous?: z.infer<typeof EbnWriterSchema>) => {
          const prompt = buildEbnWriterPrompt({
            language: row.language,
            claims: claimsWithFacts,
            permissions: TRUE_CRIME_PERMISSIONS,
            editorialBrief: writerBrief,
            targetWords: requestedWords,
          })
          return llmCall({
            templateVersion: STORY_EBN_WRITER_V1_VERSION,
            schema: EbnWriterSchema,
            system: prompt.system,
            messages: [{
              role: 'user',
              content: previous
                ? `${prompt.userMessage}\n\nPREVIOUS CITED DRAFT TO COMPRESS:\n${JSON.stringify(previous, null, 2)}\n\nReturn a complete replacement JSON object. Preserve its supported factual spine and citations, but merge or remove redundant sentences until BOTH hard budgets are satisfied. Count the narration words before answering.`
                : prompt.userMessage,
            }],
            provider: 'anthropic' as const,
            maxTokens: Math.min(16384, Math.max(4096, targetWords * 4)),
          })
        }

        let written = await accounted('writer', `${row.title}:${run}:${arm}:writer`, () => write(brief, targetWords))
        const narrate = (draft: z.infer<typeof EbnWriterSchema>) => draft.narrative
          .flatMap((group) => group.sentences)
          .map((sentence) => sentence.text)
          .join(' ')
        let narration = narrate(written.data)
        const firstCount = words(narration)
        if (firstCount < minWords || firstCount > maxWords) {
          const correctionWords = Math.max(80, Math.round((targetWords * targetWords) / firstCount))
          written = await accounted('compression', `${row.title}:${run}:${arm}:compression`, () => write(
            `${brief}\n\nMANDATORY LENGTH CORRECTION: The previous draft was ${firstCount} words. Compress the complete story aggressively. The final production gate requires ${minWords}–${maxWords} words. Preserve every claim and citation requirement; do not add facts.`,
            correctionWords,
            written.data,
          ))
          narration = narrate(written.data)
        }

        const citationMap = written.data.narrative.flatMap((group) =>
          group.sentences.map((sentence) => ({ text: sentence.text, claimId: group.claimId, factIds: sentence.factIds })),
        )
        const fidelityPrompt = buildEbnFidelityPrompt({ facts: bibleForModel, criticalIds, narration })
        const fidelity = await accounted('fidelity', `${row.title}:${run}:${arm}:fidelity`, () => llmCall({
          templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
          schema: EbnFidelitySchema,
          system: fidelityPrompt.system,
          messages: [{ role: 'user', content: fidelityPrompt.userMessage }],
          provider: 'anthropic',
          maxTokens: 2000,
        }))

        const ending = await accounted('endingJudge', `${row.title}:${run}:${arm}:ending-judge`, () => llmCall({
          templateVersion: 'ebn-ending-brief-judge.v0-probe',
          schema: EndingJudgeSchema,
          system: ENDING_JUDGE_SYSTEM,
          messages: [{ role: 'user', content: `TITLE: ${written.data.title}\n\nNARRATION:\n${narration}` }],
          provider: 'anthropic',
          temperature: 0.2,
          maxTokens: 1000,
        }))
        results.push({
          caseTitle: row.title,
          reelId: row.reelId,
          run,
          arm,
          generatedTitle: written.data.title,
          narration,
          wordCount: words(narration),
          claims,
          citationMap,
          fidelity: EbnFidelitySchema.parse(fidelity.data),
          ending: ending.data,
        })
        console.log(`[${row.title}] run ${run}/${RUNS} ${arm}: ${words(narration)}w · double=${ending.data.doubleEnding} · debt=${ending.data.debtPaid} · fidelity=${fidelity.data.issues.length}`)
      }
    }
  }

  const pairs: Array<{
    caseTitle: string
    run: number
    aArm: Arm
    bArm: Arm
    preferredLabel: 'A' | 'B' | 'tie'
    preferredArm: Arm | 'tie'
    reason: string
  }> = []
  for (const row of cases) {
    for (let run = 1; run <= RUNS; run++) {
      const control = results.find((result) => result.reelId === row.reelId && result.run === run && result.arm === 'control')!
      const treatment = results.find((result) => result.reelId === row.reelId && result.run === run && result.arm === 'treatment')!
      const treatmentFirst = shuffledTreatmentFirst(row.reelId, run)
      const a = treatmentFirst ? treatment : control
      const b = treatmentFirst ? control : treatment
      const judged = await accounted('pairJudge', `${row.title}:${run}:pair-judge`, () => llmCall({
        templateVersion: 'ebn-ending-brief-pair.v0-probe',
        schema: PairJudgeSchema,
        system: PAIR_JUDGE_SYSTEM,
        messages: [{ role: 'user', content: `DRAFT A\nTITLE: ${a.generatedTitle}\n${a.narration}\n\nDRAFT B\nTITLE: ${b.generatedTitle}\n${b.narration}` }],
        provider: 'anthropic',
        temperature: 0.2,
        maxTokens: 800,
      }))
      const preferredArm = judged.data.preferred === 'tie'
        ? 'tie'
        : judged.data.preferred === 'A' ? a.arm : b.arm
      pairs.push({
        caseTitle: row.title,
        run,
        aArm: a.arm,
        bArm: b.arm,
        preferredLabel: judged.data.preferred,
        preferredArm,
        reason: judged.data.reason,
      })
      console.log(`[pair ${row.title} ${run}] preferred=${preferredArm}`)
    }
  }

  const armSummary = (arm: Arm) => {
    const rows = results.filter((result) => result.arm === arm)
    const kinds = new Map<string, number>()
    for (const row of rows) kinds.set(row.ending.endingKind, (kinds.get(row.ending.endingKind) ?? 0) + 1)
    return {
      drafts: rows.length,
      debtPaid: rows.filter((row) => row.ending.debtPaid).length,
      doubleEndings: rows.filter((row) => row.ending.doubleEnding).length,
      laterReopensOrExplains: rows.filter((row) => row.ending.laterReopensOrExplains).length,
      reportLikeCloses: rows.filter((row) => row.ending.reportLikeClose).length,
      fidelityIssues: rows.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
      endingKinds: Object.fromEntries(kinds),
      distinctEndingKinds: kinds.size,
      maxKindCount: Math.max(0, ...kinds.values()),
    }
  }
  const control = armSummary('control')
  const treatment = armSummary('treatment')
  const treatmentWins = pairs.filter((pair) => pair.preferredArm === 'treatment').length
  const controlWins = pairs.filter((pair) => pair.preferredArm === 'control').length
  const ties = pairs.filter((pair) => pair.preferredArm === 'tie').length
  const pairThreshold = Math.ceil(pairs.length * 2 / 3)
  const preferencePass = treatmentWins >= pairThreshold
  const doubleEndingPass = treatment.doubleEndings <= control.doubleEndings - 3
  const fidelityPass = treatment.fidelityIssues <= control.fidelityIssues
  const diversityPass = treatment.distinctEndingKinds >= 3 && treatment.maxKindCount <= Math.floor(treatment.drafts * 2 / 3)
  const falsified = treatment.doubleEndings >= Math.ceil(treatment.drafts / 2) || !fidelityPass || !diversityPass
  const decision = falsified
    ? 'treatment_falsified'
    : (preferencePass || doubleEndingPass) && fidelityPass && diversityPass
      ? 'treatment_earns_two_reel_production_test'
      : 'inconclusive_do_not_change_production'
  const successfulRunCostCents = Object.values(spend).reduce((sum, cents) => sum + cents, 0)
  const totalCostCents = successfulRunCostCents + PRIOR_FAILED_ATTEMPT_ESTIMATE_CENTS

  const report = {
    probe: 'ebn-ending-brief.v0',
    generatedAt: new Date().toISOString(),
    configuration: {
      runsPerCasePerArm: RUNS,
      cases: cases.map((row) => ({ reelId: row.reelId, title: row.title, acceptedBody: row.acceptedBody })),
      targetSeconds,
      targetWords,
      maxClaims,
      treatmentStoryShape: leanNiche.slice(leanNiche.indexOf('## Story Shape'), leanNiche.indexOf('\n## Tone')).trim(),
      promptVersions: {
        planner: STORY_EBN_PLANNER_V1_VERSION,
        writer: STORY_EBN_WRITER_V1_VERSION,
        fidelity: STORY_EBN_FIDELITY_V1_VERSION,
      },
    },
    preRegisteredDecision: {
      preferenceThreshold: pairThreshold,
      doubleEndingReductionThreshold: 3,
      diversityMinimumKinds: 3,
      maximumSingleKindShare: '2/3',
    },
    summary: {
      control,
      treatment,
      pairwise: { treatmentWins, controlWins, ties, pairs: pairs.length },
      checks: { preferencePass, doubleEndingPass, fidelityPass, diversityPass, falsified },
      decision,
    },
    spendCents: {
      ...spend,
      successfulRunTotal: successfulRunCostCents,
      priorFailedAttemptEstimate: PRIOR_FAILED_ATTEMPT_ESTIMATE_CENTS,
      total: totalCostCents,
    },
    pairs,
    results,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log('\n' + '═'.repeat(78))
  console.log(JSON.stringify(report.summary, null, 2))
  console.log(`spend: ${totalCostCents}¢ ($${(totalCostCents / 100).toFixed(2)})`)
  console.log(`report: ${OUT}`)
  process.exit(0)
})()
