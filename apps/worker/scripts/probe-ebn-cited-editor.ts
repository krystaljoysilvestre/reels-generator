// Crossroads EBN cited-editor probe (2026-08-30).
//
// SUBSTRATE: nine frozen writer-only drafts from probe-ebn-writer-landing.json.
// ARM A: one citation-preserving Editor call with sentence lineage.
// ARM B: one matched-opportunity fresh Writer regeneration with no prior prose.
// Both arms receive the same claims, Evidence Bible, brief, and frozen diagnoses. No production writes.
// See hypotheses/ebn-cited-editor.md for the pre-registered contract and survival bar.
import '../src/env.js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const HARD_SPEND_CENTS = 200
// Conservative per-call reserves include one schema-repair attempt at the configured output ceiling.
// They may stop the probe below $2, but they prevent the next call from making the hard ceiling porous.
const RESERVE_CENTS = {
  editor: 14,
  regeneration: 12,
  fidelity: 10,
  ending: 5,
  pair: 5,
} as const

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

const CitedEditorSchema = z.object({
  title: z.string().min(1),
  logline: z.string().min(1),
  peakSentence: z.string().min(1),
  narrative: z.array(z.object({
    claimId: z.string(),
    sentences: z.array(z.object({
      text: z.string().min(1),
      sourceSentenceIds: z.array(z.string()).min(1),
      factIds: z.array(z.string()).min(1),
    })).min(1),
  })).min(1),
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

const PAIR_JUDGE_SYSTEM = `You are choosing which of two evidence-based short-documentary drafts has the stronger ENDPOINT INTEGRITY and overall spoken-story craft. The factual source is held fixed; do not prefer one because it sounds more emotional, cinematic, conclusive, human, or concrete.

Prefer the draft that most clearly pays the debt created by its own opening, gives pivotal material proportional space, reaches one earned terminal answer/consequence/contrast/callback/uncertainty, and stops without reopening or explaining it. A necessary causal synthesis is valid. A moral, CTA, object, human coda, or summary is neither inherently good nor bad. Penalize report-shaped compression, repetition, and rushed pivotal material. Return tie when the difference is not meaningful.

Return EXACTLY these keys:
{
  "preferred": "A" | "B" | "tie",
  "aTerminalBeat": "",
  "bTerminalBeat": "",
  "reason": ""
}`

type Spend = {
  editor: number
  regeneration: number
  fidelityEditor: number
  fidelityRegeneration: number
  endingEditor: number
  endingRegeneration: number
  pairVsRegeneration: number
  pairVsFrozen: number
}
type Arm = 'editor' | 'regeneration' | 'frozen'

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length
const orderedHashFirst = (key: string, tag: string) =>
  ((createHash('sha256').update(`${key}:${tag}`).digest()[0] ?? 0) % 2) === 0

void (async () => {
  const SOURCE_PATH = process.env['PROBE_SOURCE'] ?? 'probe-ebn-writer-landing.json'
  const OUT = process.env['PROBE_OUT'] ?? 'probe-ebn-cited-editor.json'
  const PARTIAL_OUT = `${OUT}.partial.json`
  const { llmCall } = await import('@reels/providers')
  const { getDb, channels, reels, stories } = await import('@reels/db')
  const { and, desc, eq } = await import('drizzle-orm')
  const {
    buildEbnWriterPrompt,
    EbnWriterSchema,
    TRUE_CRIME_PERMISSIONS,
    buildEbnFidelityPrompt,
    STORY_EBN_FIDELITY_V1_VERSION,
    EbnFidelitySchema,
    EvidenceBibleSchema,
    EbnClaimsSchema,
    composeTasteRubric,
  } = await import('../src/prompts-bridge.js')

  const SourceRowSchema = z.object({
    caseTitle: z.string(),
    reelId: z.string(),
    run: z.number(),
    arm: z.literal('writer'),
    generatedTitle: z.string(),
    narration: z.string(),
    wordCount: z.number(),
    claims: EbnClaimsSchema.shape.claims,
    citationMap: z.array(z.object({ text: z.string(), claimId: z.string(), factIds: z.array(z.string()) })),
    fidelity: EbnFidelitySchema,
    ending: EndingJudgeSchema,
  })
  const sourceReport = z.object({ writerResults: z.array(SourceRowSchema) })
    .parse(JSON.parse(readFileSync(SOURCE_PATH, 'utf8')))
  const frozenRows = sourceReport.writerResults
  if (frozenRows.length !== 9) throw new Error(`Expected 9 frozen writer-only drafts; found ${frozenRows.length}`)

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
    throw new Error(`Expected frozen 80s/196w/176-216 contract; found ${targetSeconds}s/${targetWords}w/${minWords}-${maxWords}`)
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

  type Claims = z.infer<typeof EbnClaimsSchema>['claims']
  type Fidelity = z.infer<typeof EbnFidelitySchema>
  type Ending = z.infer<typeof EndingJudgeSchema>
  type SourceSentence = { id: string; text: string; claimId: string; factIds: string[] }
  type Validity = { pass: boolean; reasons: string[] }
  type Candidate = {
    key: string
    caseTitle: string
    reelId: string
    run: number
    arm: 'editor' | 'regeneration'
    title: string
    logline: string
    peakSentence: string
    narration: string
    wordCount: number
    citationMap: Array<{ text: string; claimId: string; factIds: string[]; sourceSentenceIds?: string[] }>
    validity: Validity
    fidelity?: Fidelity
    ending?: Ending
  }
  type Pair = {
    key: string
    caseTitle: string
    reelId: string
    run: number
    comparison: 'editor_vs_regeneration' | 'editor_vs_frozen'
    aArm: Arm
    bArm: Arm
    preferredArm: Arm | 'tie'
    reason: string
    automatic: boolean
  }

  const spend: Spend = {
    editor: 0,
    regeneration: 0,
    fidelityEditor: 0,
    fidelityRegeneration: 0,
    endingEditor: 0,
    endingRegeneration: 0,
    pairVsRegeneration: 0,
    pairVsFrozen: 0,
  }
  const editorResults: Candidate[] = []
  const regenerationResults: Candidate[] = []
  const pairs: Pair[] = []
  let label = 'initialized'
  let errorText: string | undefined
  const totalSpend = () => Object.values(spend).reduce((sum, value) => sum + value, 0)
  const persist = () => writeFileSync(PARTIAL_OUT, JSON.stringify({
    probe: 'ebn-cited-editor.v0',
    updatedAt: new Date().toISOString(),
    label,
    ...(errorText ? { error: errorText } : {}),
    hardSpendCeilingCents: HARD_SPEND_CENTS,
    spendCents: spend,
    editorResults,
    regenerationResults,
    pairs,
  }, null, 2))
  if (existsSync(PARTIAL_OUT)) {
    const partial = JSON.parse(readFileSync(PARTIAL_OUT, 'utf8')) as {
      label?: string
      error?: string
      spendCents?: Partial<Spend>
      editorResults?: Candidate[]
      regenerationResults?: Candidate[]
      pairs?: Pair[]
    }
    for (const key of Object.keys(spend) as Array<keyof Spend>) spend[key] = Number(partial.spendCents?.[key] ?? 0)
    editorResults.push(...(partial.editorResults ?? []))
    regenerationResults.push(...(partial.regenerationResults ?? []))
    pairs.push(...(partial.pairs ?? []))
    label = partial.label ?? 'resumed'
    errorText = partial.error
    console.log(`resuming editor=${editorResults.length}/9 regeneration=${regenerationResults.length}/9 pairs=${pairs.length}/18 at ${totalSpend()}¢`)
  } else {
    persist()
  }
  const accounted = async <T>(
    key: keyof Spend,
    callLabel: string,
    reserveCents: number,
    call: () => Promise<{ data: T; costCents: number }>,
  ) => {
    if (totalSpend() + reserveCents > HARD_SPEND_CENTS) {
      throw new Error(`Spend guard: ${totalSpend()}¢ spent; ${reserveCents}¢ reserve would exceed ${HARD_SPEND_CENTS}¢ ceiling`)
    }
    label = callLabel
    errorText = undefined
    persist()
    try {
      const result = await call()
      spend[key] += result.costCents
      if (totalSpend() > HARD_SPEND_CENTS) throw new Error(`Hard spend ceiling exceeded after reported usage: ${totalSpend()}¢`)
      persist()
      return result
    } catch (error) {
      const reported = typeof error === 'object' && error !== null && 'costCents' in error
        ? Number((error as { costCents?: unknown }).costCents ?? 0)
        : 0
      if (Number.isFinite(reported) && reported > 0) spend[key] += reported
      errorText = String(error)
      persist()
      throw error
    }
  }

  const contextByKey = new Map<string, {
    row: (typeof cases)[number]
    frozen: z.infer<typeof SourceRowSchema>
    bible: z.infer<typeof EvidenceBibleSchema>
    bibleHash: string
    facts: Array<{ id: string; stance: string; weight: string; attributed_to?: string; value: string }>
    criticalIds: string[]
    sourceCriticalIds: string[]
    claims: Claims
    claimsWithFacts: Array<{ id: string; order: number; purpose: string; facts: Array<{ id: string; stance: string; attributed_to?: string; value: string }> }>
    sourceSentences: SourceSentence[]
    brief: string
  }>()
  const preflightMissingCritical: Array<{ caseTitle: string; run: number; facts: Array<{ id: string; value: string }> }> = []

  for (const frozen of frozenRows) {
    const row = cases.find((candidate) => candidate.reelId === frozen.reelId)
    if (!row) throw new Error(`No frozen Evidence Bible for ${frozen.caseTitle}`)
    const bible = EvidenceBibleSchema.parse(row.evidenceBible)
    const facts = bible.facts.map((fact) => ({
      id: fact.id,
      stance: fact.stance,
      weight: fact.weight,
      ...(fact.attributed_to ? { attributed_to: fact.attributed_to } : {}),
      value: fact.value,
    }))
    const factById = new Map(bible.facts.map((fact) => [fact.id, fact]))
    const claimsWithFacts = frozen.claims.map((claim) => ({
      id: claim.id,
      order: claim.order,
      purpose: claim.purpose,
      facts: claim.evidence
        .map((id) => factById.get(id))
        .filter((fact) => fact !== undefined)
        .map((fact) => ({ id: fact.id, stance: fact.stance, attributed_to: fact.attributed_to, value: fact.value })),
    }))
    const sourceSentences = frozen.citationMap.map((sentence, index) => ({ id: `S${index + 1}`, ...sentence }))
    const criticalIds = bible.facts.filter((fact) => fact.weight === 'Critical').map((fact) => fact.id)
    const citedIds = new Set(sourceSentences.flatMap((sentence) => sentence.factIds))
    const sourceCriticalIds = criticalIds.filter((id) => citedIds.has(id))
    const missingAtInput = criticalIds.filter((id) => !citedIds.has(id))
    if (missingAtInput.length > 0) {
      preflightMissingCritical.push({
        caseTitle: frozen.caseTitle,
        run: frozen.run,
        facts: missingAtInput.map((id) => ({ id, value: factById.get(id)?.value ?? '(missing fact)' })),
      })
    }
    const key = `${frozen.reelId}:${frozen.run}`
    contextByKey.set(key, {
      row,
      frozen,
      bible,
      bibleHash: createHash('sha256').update(JSON.stringify(bible)).digest('hex'),
      facts,
      criticalIds,
      sourceCriticalIds,
      claims: [...frozen.claims].sort((a, b) => a.order - b.order),
      claimsWithFacts,
      sourceSentences,
      brief: makeBrief(row),
    })
  }
  console.log(`preflight: ${9 - preflightMissingCritical.length}/9 frozen drafts retain all Critical evidence ids`)
  if (preflightMissingCritical.length > 0) console.log(JSON.stringify({ preflightMissingCritical }, null, 2))
  if (process.env['PROBE_PREFLIGHT_ONLY'] === '1') {
    label = 'preflight-complete'
    errorText = undefined
    persist()
    console.log('preflight-only mode: no external model calls made')
    process.exit(0)
  }

  const diagnostics = (context: (typeof contextByKey extends Map<string, infer V> ? V : never)) => JSON.stringify({
    wordCount: context.frozen.wordCount,
    requiredWordWindow: [minWords, maxWords],
    factualFidelityIssues: context.frozen.fidelity.issues,
    endpoint: {
      openingDebt: context.frozen.ending.openingDebt,
      terminalBeat: context.frozen.ending.terminalBeat,
      debtPaid: context.frozen.ending.debtPaid,
      laterReopensOrExplains: context.frozen.ending.laterReopensOrExplains,
      doubleEnding: context.frozen.ending.doubleEnding,
      reportLikeClose: context.frozen.ending.reportLikeClose,
      reasoning: context.frozen.ending.reasoning,
    },
  }, null, 2)

  const validateCandidate = (
    context: (typeof contextByKey extends Map<string, infer V> ? V : never),
    narrative: Array<{ claimId: string; sentences: Array<{ text: string; factIds: string[]; sourceSentenceIds?: string[] }> }>,
    peakSentence: string,
    requireLineage: boolean,
  ): Validity => {
    const reasons: string[] = []
    const expectedClaims = context.claims.map((claim) => claim.id)
    const actualClaims = narrative.map((group) => group.claimId)
    if (JSON.stringify(actualClaims) !== JSON.stringify(expectedClaims)) reasons.push(`claim order/coverage ${actualClaims.join(',')} != ${expectedClaims.join(',')}`)
    const claimEvidence = new Map(context.claims.map((claim) => [claim.id, new Set(claim.evidence)]))
    const sources = new Map(context.sourceSentences.map((sentence) => [sentence.id, sentence]))
    const cited = new Set<string>()
    const narration = narrative.flatMap((group) => group.sentences).map((sentence) => sentence.text).join(' ')
    for (const group of narrative) {
      const permitted = claimEvidence.get(group.claimId)
      if (!permitted) reasons.push(`unknown claim ${group.claimId}`)
      for (const sentence of group.sentences) {
        if (sentence.factIds.length === 0) reasons.push(`empty factIds for ${sentence.text}`)
        for (const factId of sentence.factIds) {
          cited.add(factId)
          if (!permitted?.has(factId)) reasons.push(`${factId} outside claim ${group.claimId}`)
        }
        if (requireLineage) {
          const sourceIds = sentence.sourceSentenceIds ?? []
          if (sourceIds.length === 0) reasons.push(`empty sourceSentenceIds for ${sentence.text}`)
          const sourceFactUnion = new Set<string>()
          for (const sourceId of sourceIds) {
            const source = sources.get(sourceId)
            if (!source) reasons.push(`unknown source sentence ${sourceId}`)
            else {
              if (source.claimId !== group.claimId) reasons.push(`${sourceId} belongs to ${source.claimId}, not ${group.claimId}`)
              for (const factId of source.factIds) sourceFactUnion.add(factId)
            }
          }
          for (const factId of sentence.factIds) {
            if (!sourceFactUnion.has(factId)) reasons.push(`${factId} not present in source lineage for ${sentence.text}`)
          }
        }
      }
    }
    const droppedSourceCritical = context.sourceCriticalIds.filter((id) => !cited.has(id))
    if (droppedSourceCritical.length > 0) reasons.push(`dropped source-cited Critical ids ${droppedSourceCritical.join(',')}`)
    if (!narration.includes(peakSentence)) reasons.push('peakSentence is not verbatim in narration')
    const count = words(narration)
    if (count < minWords || count > maxWords) reasons.push(`${count} words outside ${minWords}-${maxWords}`)
    return { pass: reasons.length === 0, reasons }
  }

  const spokenWriterSystem = (context: (typeof contextByKey extends Map<string, infer V> ? V : never)) => {
    const base = buildEbnWriterPrompt({
      claims: context.claimsWithFacts,
      permissions: TRUE_CRIME_PERMISSIONS,
      editorialBrief: context.brief,
      targetWords,
    })
    return {
      ...base,
      system: `${base.system.replace(
        '- For short-form budgets, write one efficient sentence per claim whenever possible. A claim may cite several facts; that is the intended compression mechanism. Keep each narration sentence at or below 30 words.',
        '- Narrative Claims are evidence units, not equal prose beats or sentence quotas. Compress routine context; let pivotal material use the space it earns. Keep each narration sentence at or below 30 words.',
      )}

SPOKEN SHORT-FORM CRAFT:
- Write the way a real narrator would naturally say this aloud in ${context.row.language}; never translation-shaped, source-note-shaped, or report-shaped prose.
- The hard total word budget wins. Cover the supported spine without giving every claim equal space or repeating a fact merely to sound conclusive.
- Infer the opening debt from the ordered claims and pay or honestly bound it by the end. The final claim may deliver a consequence, verdict, contrast, image, irony, callback, uncertainty, human result, or another function the story earns.
- Put necessary qualifications before the terminal passage when the evidence allows. Once the final supported beat has done unique closing work, stop. Do not append a moral, explanation, restatement, CTA, or second conclusion.
- These are goals and failure modes, not a required ending formula.`,
    }
  }

  for (const context of contextByKey.values()) {
    const key = `${context.frozen.reelId}:${context.frozen.run}`
    if (!editorResults.some((result) => result.key === key)) {
      const system = `You are the cited EDITOR for an Evidence-Based Narrative. You repair a rejected Writer candidate without becoming a second Writer.

You may delete repetition, merge or paraphrase supported sentences, reorder sentences only within their existing claim, and add attribution or uncertainty qualifiers required by the cited evidence. Preserve the supported story, its opening promise, and its strongest earned terminal beat; remove explanation only when it duplicates work already done. Choose what this story earns. Do not impose a moral, CTA, callback, human coda, hard stop, or any other ending form.

HARD EVIDENCE BOUNDARY:
- Every output sentence names exactly one existing claimId, one or more sourceSentenceIds from that same claim, and one or more factIds.
- factIds must already occur in the named source sentences AND be permitted by the claim.
- Preserve every claim in order, every source-cited Critical fact id, factual stance, attribution, actual chronology, and the terminal claim as the final group. The fresh fidelity checker—not this editing pass—judges whether the source candidate semantically omitted any other Critical fact.
- Add no evidence, angle, event, detail, dialogue, motive, emotion, causal claim, or interpretation.
- The editorial purpose is direction, never evidence.
- Write naturally for spoken ${context.row.language}; never translation-shaped or report-shaped.
- The final narration must be ${minWords}-${maxWords} words. Count before returning. One pass only.
- peakSentence must be copied verbatim from the returned narration.

Return JSON only with exactly this shape. The top-level field is named narrative, not narration, and each
claim owns a sentences array:
{
  "title": "",
  "logline": "",
  "peakSentence": "",
  "narrative": [
    {
      "claimId": "C1",
      "sentences": [
        {
          "text": "",
          "sourceSentenceIds": ["S1"],
          "factIds": ["F01"]
        }
      ]
    }
  ]
}`
      const editor = await accounted('editor', `${context.frozen.caseTitle}:${context.frozen.run}:editor`, RESERVE_CENTS.editor, () => llmCall({
        templateVersion: 'story-ebn-cited-editor.v0-probe',
        schema: CitedEditorSchema,
        system,
        messages: [{ role: 'user', content: `CLAIMS WITH PERMITTED FACTS:\n${JSON.stringify(context.claimsWithFacts, null, 2)}\n\nEDITORIAL BRIEF (direction only):\n${context.brief}\n\nSOURCE SENTENCES:\n${JSON.stringify(context.sourceSentences, null, 2)}\n\nREJECTED-CANDIDATE DIAGNOSES (judgment only; never replacement prose):\n${diagnostics(context)}\n\nReturn one complete edited candidate with all claims in their original order.` }],
        provider: 'anthropic',
        temperature: 0.4,
        maxTokens: 2500,
      }))
      const citationMap = editor.data.narrative.flatMap((group) => group.sentences.map((sentence) => ({
        text: sentence.text,
        claimId: group.claimId,
        factIds: sentence.factIds,
        sourceSentenceIds: sentence.sourceSentenceIds,
      })))
      const narration = citationMap.map((sentence) => sentence.text).join(' ')
      editorResults.push({
        key,
        caseTitle: context.frozen.caseTitle,
        reelId: context.frozen.reelId,
        run: context.frozen.run,
        arm: 'editor',
        title: editor.data.title,
        logline: editor.data.logline,
        peakSentence: editor.data.peakSentence,
        narration,
        wordCount: words(narration),
        citationMap,
        validity: validateCandidate(context, editor.data.narrative, editor.data.peakSentence, true),
      })
      label = `${context.frozen.caseTitle}:${context.frozen.run}:editor-saved`
      persist()
    }

    if (!regenerationResults.some((result) => result.key === key)) {
      const base = spokenWriterSystem(context)
      const regeneration = await accounted('regeneration', `${context.frozen.caseTitle}:${context.frozen.run}:regeneration`, RESERVE_CENTS.regeneration, () => llmCall({
        templateVersion: 'story-ebn-writer.v1.6+spoken-landing+diagnostic-regeneration.v0-probe',
        schema: EbnWriterSchema,
        system: base.system,
        messages: [{ role: 'user', content: `${base.userMessage}\n\nA PRIOR CANDIDATE FAILED WITH THESE DIAGNOSES. Write a FRESH candidate from the claims and facts above; you do not have the prior prose and must not quote or repair its wording. Use the diagnoses only as failure modes to avoid:\n${diagnostics(context)}` }],
        provider: 'anthropic',
        temperature: 0.4,
        maxTokens: 2500,
      }))
      const citationMap = regeneration.data.narrative.flatMap((group) => group.sentences.map((sentence) => ({
        text: sentence.text,
        claimId: group.claimId,
        factIds: sentence.factIds,
      })))
      const narration = citationMap.map((sentence) => sentence.text).join(' ')
      regenerationResults.push({
        key,
        caseTitle: context.frozen.caseTitle,
        reelId: context.frozen.reelId,
        run: context.frozen.run,
        arm: 'regeneration',
        title: regeneration.data.title,
        logline: regeneration.data.logline,
        peakSentence: regeneration.data.peakSentence,
        narration,
        wordCount: words(narration),
        citationMap,
        validity: validateCandidate(context, regeneration.data.narrative, regeneration.data.peakSentence, false),
      })
      label = `${context.frozen.caseTitle}:${context.frozen.run}:regeneration-saved`
      persist()
    }
  }

  const judgeCandidate = async (candidate: Candidate) => {
    if (!candidate.validity.pass) return
    const context = contextByKey.get(candidate.key)
    if (!context) throw new Error(`Missing context for ${candidate.key}`)
    if (!candidate.fidelity) {
      const prompt = buildEbnFidelityPrompt({ facts: context.facts, criticalIds: context.criticalIds, narration: candidate.narration })
      const key = candidate.arm === 'editor' ? 'fidelityEditor' : 'fidelityRegeneration'
      const result = await accounted(key, `${candidate.caseTitle}:${candidate.run}:${candidate.arm}:fidelity`, RESERVE_CENTS.fidelity, () => llmCall({
        templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
        schema: EbnFidelitySchema,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessage }],
        provider: 'anthropic',
        maxTokens: 2000,
      }))
      candidate.fidelity = result.data
      persist()
    }
    if (!candidate.ending) {
      const key = candidate.arm === 'editor' ? 'endingEditor' : 'endingRegeneration'
      const result = await accounted(key, `${candidate.caseTitle}:${candidate.run}:${candidate.arm}:ending`, RESERVE_CENTS.ending, () => llmCall({
        templateVersion: 'ebn-cited-editor-ending-judge.v0-probe',
        schema: EndingJudgeSchema,
        system: ENDING_JUDGE_SYSTEM,
        messages: [{ role: 'user', content: `TITLE: ${candidate.title}\n\nNARRATION:\n${candidate.narration}` }],
        provider: 'anthropic',
        temperature: 0.2,
        maxTokens: 1000,
      }))
      candidate.ending = result.data
      persist()
    }
    console.log(`[${candidate.arm} ${candidate.caseTitle} ${candidate.run}] ${candidate.wordCount}w · valid=${candidate.validity.pass} · fidelity=${candidate.fidelity.issues.length} · double=${candidate.ending.doubleEnding} · report=${candidate.ending.reportLikeClose}`)
  }
  for (const candidate of editorResults) await judgeCandidate(candidate)
  for (const candidate of regenerationResults) await judgeCandidate(candidate)

  const addPair = async (
    comparison: Pair['comparison'],
    editor: Candidate,
    other: Candidate | z.infer<typeof SourceRowSchema>,
    otherArm: 'regeneration' | 'frozen',
  ) => {
    const pairKey = `${editor.key}:${comparison}`
    if (pairs.some((pair) => pair.key === pairKey)) return
    if (!editor.validity.pass) {
      pairs.push({ key: pairKey, caseTitle: editor.caseTitle, reelId: editor.reelId, run: editor.run, comparison, aArm: 'editor', bArm: otherArm, preferredArm: otherArm, reason: `automatic hard-constraint loss: ${editor.validity.reasons.join('; ')}`, automatic: true })
      persist()
      return
    }
    if ('validity' in other && !other.validity.pass) {
      pairs.push({ key: pairKey, caseTitle: editor.caseTitle, reelId: editor.reelId, run: editor.run, comparison, aArm: 'editor', bArm: otherArm, preferredArm: 'editor', reason: `automatic hard-constraint win: ${other.validity.reasons.join('; ')}`, automatic: true })
      persist()
      return
    }
    const isA = orderedHashFirst(editor.key, comparison)
    const editorDraft = { arm: 'editor' as const, title: editor.title, narration: editor.narration }
    const otherDraft = {
      arm: otherArm,
      title: 'title' in other ? other.title : other.generatedTitle,
      narration: other.narration,
    }
    const a = isA ? editorDraft : otherDraft
    const b = isA ? otherDraft : editorDraft
    const spendKey = comparison === 'editor_vs_regeneration' ? 'pairVsRegeneration' : 'pairVsFrozen'
    const judged = await accounted(spendKey, `${editor.caseTitle}:${editor.run}:${comparison}`, RESERVE_CENTS.pair, () => llmCall({
      templateVersion: `ebn-cited-editor-${comparison}.v0-probe`,
      schema: PairJudgeSchema,
      system: PAIR_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: `DRAFT A\nTITLE: ${a.title}\n${a.narration}\n\nDRAFT B\nTITLE: ${b.title}\n${b.narration}` }],
      provider: 'anthropic',
      temperature: 0.2,
      maxTokens: 800,
    }))
    const preferredArm = judged.data.preferred === 'tie'
      ? 'tie'
      : judged.data.preferred === 'A' ? a.arm : b.arm
    pairs.push({ key: pairKey, caseTitle: editor.caseTitle, reelId: editor.reelId, run: editor.run, comparison, aArm: a.arm, bArm: b.arm, preferredArm, reason: judged.data.reason, automatic: false })
    persist()
    console.log(`[${comparison} ${editor.caseTitle} ${editor.run}] preferred=${preferredArm}`)
  }

  for (const editor of editorResults) {
    const regeneration = regenerationResults.find((candidate) => candidate.key === editor.key)
    const context = contextByKey.get(editor.key)
    if (!regeneration || !context) throw new Error(`Missing comparison material for ${editor.key}`)
    await addPair('editor_vs_regeneration', editor, regeneration, 'regeneration')
    await addPair('editor_vs_frozen', editor, context.frozen, 'frozen')
  }

  const armSummary = (candidates: Candidate[]) => {
    const valid = candidates.filter((candidate) => candidate.validity.pass)
    const kinds = new Map<string, number>()
    for (const candidate of valid) {
      if (candidate.ending) kinds.set(candidate.ending.endingKind, (kinds.get(candidate.ending.endingKind) ?? 0) + 1)
    }
    return {
      drafts: candidates.length,
      structurallyValid: valid.length,
      inWordBudget: candidates.filter((candidate) => candidate.wordCount >= minWords && candidate.wordCount <= maxWords).length,
      rawFidelityIssues: valid.reduce((sum, candidate) => sum + (candidate.fidelity?.issues.length ?? 0), 0),
      doubleEndings: valid.filter((candidate) => candidate.ending?.doubleEnding).length,
      reportLikeCloses: valid.filter((candidate) => candidate.ending?.reportLikeClose).length,
      endingKinds: Object.fromEntries(kinds),
      distinctEndingKinds: kinds.size,
      maxKindCount: Math.max(0, ...kinds.values()),
    }
  }
  const editorSummary = armSummary(editorResults)
  const regenerationSummary = armSummary(regenerationResults)
  const editorVsRegeneration = pairs.filter((pair) => pair.comparison === 'editor_vs_regeneration')
  const editorVsFrozen = pairs.filter((pair) => pair.comparison === 'editor_vs_frozen')
  const pairSummary = (rows: Pair[], other: Arm) => ({
    editorWins: rows.filter((pair) => pair.preferredArm === 'editor').length,
    otherWins: rows.filter((pair) => pair.preferredArm === other).length,
    ties: rows.filter((pair) => pair.preferredArm === 'tie').length,
    automatic: rows.filter((pair) => pair.automatic).length,
  })
  const confirmedZeroFatalAxes = editorResults
    .filter((candidate) => candidate.validity.pass)
    .every((candidate) => (candidate.fidelity?.issues ?? []).every((issue) => !['added', 'removed', 'attribution', 'certainty', 'chronology'].includes(issue.axis)))
  const checks = {
    distinctValuePass: editorVsRegeneration.filter((pair) => pair.preferredArm === 'editor').length >= 6,
    absoluteImprovementPass: editorVsFrozen.filter((pair) => pair.preferredArm === 'editor').length >= 6,
    provenancePass: editorSummary.structurallyValid === 9,
    rawFidelityCountPass: editorSummary.rawFidelityIssues <= 12,
    rawFatalAxesPass: confirmedZeroFatalAxes,
    durationPass: editorSummary.inWordBudget >= 6,
    endpointPass: editorSummary.doubleEndings <= 1 && editorSummary.reportLikeCloses <= 5,
    diversityPass: editorSummary.distinctEndingKinds >= 3 && editorSummary.maxKindCount <= 6,
  }
  const requiresAdjudication = !checks.rawFidelityCountPass || !checks.rawFatalAxesPass
  const mechanicalPass = Object.entries(checks)
    .filter(([key]) => key !== 'rawFidelityCountPass' && key !== 'rawFatalAxesPass')
    .every(([, value]) => value)
  const decision = mechanicalPass && checks.rawFidelityCountPass && checks.rawFatalAxesPass
    ? 'cited_editor_hypothesis_survives_probe'
    : mechanicalPass && requiresAdjudication
      ? 'cited_editor_requires_blind_fidelity_adjudication'
      : 'cited_editor_mechanism_does_not_survive'
  const report = {
    probe: 'ebn-cited-editor.v0',
    generatedAt: new Date().toISOString(),
    hypothesis: '../../hypotheses/ebn-cited-editor.md',
    sourcePath: SOURCE_PATH,
    configuration: {
      drafts: 9,
      targetSeconds,
      targetWords,
      wordWindow: [minWords, maxWords],
      provider: 'anthropic',
      hardSpendCeilingCents: HARD_SPEND_CENTS,
      oneCreativeCallPerArm: true,
      noProductionWrites: true,
      preflightMissingCritical,
      bibleHashes: Object.fromEntries([...contextByKey.entries()].map(([key, context]) => [key, context.bibleHash])),
    },
    summary: {
      frozen: {
        drafts: 9,
        inWordBudget: frozenRows.filter((row) => row.wordCount >= minWords && row.wordCount <= maxWords).length,
        rawFidelityIssues: frozenRows.reduce((sum, row) => sum + row.fidelity.issues.length, 0),
        doubleEndings: frozenRows.filter((row) => row.ending.doubleEnding).length,
        reportLikeCloses: frozenRows.filter((row) => row.ending.reportLikeClose).length,
      },
      editor: editorSummary,
      regeneration: regenerationSummary,
      pairs: {
        editorVsRegeneration: pairSummary(editorVsRegeneration, 'regeneration'),
        editorVsFrozen: pairSummary(editorVsFrozen, 'frozen'),
      },
    },
    checks,
    requiresAdjudication,
    decision,
    spendCents: { ...spend, total: totalSpend() },
    pairs,
    frozenRows,
    editorResults,
    regenerationResults,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  label = 'complete'
  errorText = undefined
  persist()
  console.log('\n' + '═'.repeat(78))
  console.log(JSON.stringify({ summary: report.summary, checks, requiresAdjudication, decision }, null, 2))
  console.log(`spend: ${totalSpend()}¢ ($${(totalSpend() / 100).toFixed(2)}) / $${(HARD_SPEND_CENTS / 100).toFixed(2)} ceiling`)
  console.log(`report: ${OUT}`)
  process.exit(0)
})()
