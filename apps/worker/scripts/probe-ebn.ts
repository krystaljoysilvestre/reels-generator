// Evidence-Based Narrative — full-chain probe (2026-07-21, specs/evidence-based-narrative.md).
// Now runs from a RAW curated dossier through the SHIPPED core prompts:
//   Dossier → Extractor → Evidence Bible → Planner(claims) → Writer(cited prose) → Fact-Fidelity Checker.
// Validates (a) the extractor stays faithful to the dossier + assigns stances correctly, (b) the writer
// stays evidence-bound, (c) the FFC catches injected fiction. Synthetic adjudicated case (fictional —
// no real-person assertion in a throwaway probe; same schema as a real curated dossier). NO visuals,
// NO publishing — fidelity only.
//
// Usage: pnpm --filter worker exec tsx scripts/probe-ebn.ts   (cwd apps/worker) · Cost ~$0.20–0.40, Anthropic.
import '../src/env.js'
import { z } from 'zod'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const {
    buildEbnExtractorPrompt, STORY_EBN_EXTRACTOR_V1_VERSION, EvidenceBibleSchema,
    buildEbnPlannerPrompt, STORY_EBN_PLANNER_V1_VERSION, EbnClaimsSchema,
    buildEbnWriterPrompt, STORY_EBN_WRITER_V1_VERSION, EbnWriterSchema, TRUE_CRIME_PERMISSIONS,
    buildEbnFidelityPrompt, STORY_EBN_FIDELITY_V1_VERSION, EbnFidelitySchema,
  } = await import('../src/prompts-bridge.js')
  const anthropic = { provider: 'anthropic' as const }
  let totalCost = 0

  // ── The curated DOSSIER (raw source material, as a human curator would assemble it). Fictional case. ──
  const DOSSIER = `COURT VERDICT (People v. Marcus Reyes, 2022): The court convicted Marcus Reyes of qualified theft. It found that Reyes, who served as treasurer of the Santa Rosa Community Cooperative from 2015 to 2021, diverted 4,200,000 pesos from cooperative accounts. The court sentenced Reyes to imprisonment and ordered him to pay restitution. The court rejected the defense's argument that some transfers were legitimate vendor payments.

FORENSIC AUDIT REPORT: The diversions were carried out through 37 unauthorized transfers executed between 2018 and 2021.

AUDIT REPORT (2021 year-end review): Discrepancies were first flagged by a newly hired auditor during the 2021 year-end review; this is what appears to have brought the scheme to light.

TRIAL TRANSCRIPT: The prosecution alleged that Reyes used the diverted funds to cover personal gambling debts. The defense argued that at least some of the transfers were legitimate vendor payments.

COOPERATIVE RECORDS: The Santa Rosa Community Cooperative had approximately 1,200 members.

BUILDING LOG (August 3, 2021): Reyes entered the cooperative office at 8:01 a.m. and left at 8:14 a.m.

NOTE ON OPEN QUESTIONS: It is not established in the public record whether any of the diverted funds were ever recovered.`

  // ── Stage 0: Extractor — dossier → Evidence Bible ────────────────────────────
  const ex = buildEbnExtractorPrompt({ dossier: DOSSIER, subject: 'an embezzlement conviction' })
  const exRes = await llmCall({ templateVersion: STORY_EBN_EXTRACTOR_V1_VERSION, schema: EvidenceBibleSchema, system: ex.system, messages: [{ role: 'user', content: ex.userMessage }], ...anthropic, maxTokens: 2500 })
  totalCost += exRes.costCents
  const facts = EvidenceBibleSchema.parse(exRes.data).facts
  const bibleForModel = facts.map((f) => ({ id: f.id, stance: f.stance, weight: f.weight, ...(f.attributed_to ? { attributed_to: f.attributed_to } : {}), value: f.value }))
  const criticalIds = facts.filter((f) => f.weight === 'Critical').map((f) => f.id)
  const factById = new Map(facts.map((f) => [f.id, f]))

  // ── Extractor-fidelity audit: does every extracted fact trace to the dossier + is the stance right? ──
  const ExAuditSchema = z.object({
    invented: z.array(z.object({ id: z.string(), why: z.string() })), // facts not supported by the dossier
    misstanced: z.array(z.object({ id: z.string(), should_be: z.string(), why: z.string() })), // wrong stance (e.g. an allegation marked FACT)
    summary: z.string().default(''),
  })
  const auditRes = await llmCall({
    templateVersion: 'ebn-extract-audit.v0-probe', schema: ExAuditSchema,
    system: `You audit an EVIDENCE EXTRACTION for fidelity to its DOSSIER. Flag (a) any extracted fact whose value is NOT supported by the dossier (invented), and (b) any fact whose STANCE is wrong given how the dossier frames it — the key error is marking an allegation/claim ("the prosecution alleged…") as FACT, or marking a court finding as mere CLAIM. Be strict. If the extraction is clean, return empty arrays.`,
    messages: [{ role: 'user', content: `DOSSIER:\n${DOSSIER}\n\nEXTRACTED FACTS:\n${JSON.stringify(facts, null, 2)}\n\nOUTPUT (JSON only):\n{ "invented": [ { "id": "", "why": "" } ], "misstanced": [ { "id": "", "should_be": "", "why": "" } ], "summary": "" }` }],
    ...anthropic, maxTokens: 1500,
  })
  totalCost += auditRes.costCents

  // ── Stage 1: Planner → Narrative Claims ──────────────────────────────────────
  const language = process.env.PROBE_LANG || 'english'
  const pl = buildEbnPlannerPrompt({ language, facts: bibleForModel, criticalIds, targetNote: 'a ~150-word recap' })
  const claimsRes = await llmCall({ templateVersion: STORY_EBN_PLANNER_V1_VERSION, schema: EbnClaimsSchema, system: pl.system, messages: [{ role: 'user', content: pl.userMessage }], ...anthropic, maxTokens: 1500 })
  totalCost += claimsRes.costCents
  const claims = claimsRes.data.claims

  // ── Stage 2: Writer → cited prose ────────────────────────────────────────────
  const claimsWithFacts = claims.map((c) => ({
    id: c.id, order: c.order, purpose: c.purpose,
    facts: c.evidence.map((id) => factById.get(id)).filter(Boolean).map((f) => ({ id: f!.id, stance: f!.stance, attributed_to: f!.attributed_to, value: f!.value })),
  }))
  const wr = buildEbnWriterPrompt({ language, claims: claimsWithFacts, permissions: TRUE_CRIME_PERMISSIONS })
  const writerRes = await llmCall({ templateVersion: STORY_EBN_WRITER_V1_VERSION, schema: EbnWriterSchema, system: wr.system, messages: [{ role: 'user', content: wr.userMessage }], ...anthropic, maxTokens: 2000 })
  totalCost += writerRes.costCents
  const flatSentences = writerRes.data.narrative.flatMap((g) => g.sentences.map((s) => ({ text: s.text, claimId: g.claimId, factIds: s.factIds })))
  const cleanNarration = flatSentences.map((s) => s.text).join(' ')

  // ── Stage 3: Fact-Fidelity Checker ───────────────────────────────────────────
  const runFFC = async (narration: string) => {
    const fp = buildEbnFidelityPrompt({ facts: bibleForModel, criticalIds, narration })
    const res = await llmCall({ templateVersion: STORY_EBN_FIDELITY_V1_VERSION, schema: EbnFidelitySchema, system: fp.system, messages: [{ role: 'user', content: fp.userMessage }], ...anthropic, maxTokens: 1500 })
    totalCost += res.costCents
    return res.data
  }
  const cleanVerdict = await runFFC(cleanNarration)

  // ── Injection tests (hand-crafted single violations vs the case) ──────────────
  const base = 'Marcus Reyes served as treasurer of the Santa Rosa Community Cooperative from 2015 to 2021. In 2022 a court convicted him of qualified theft after finding he had diverted 4.2 million pesos through 37 unauthorized transfers between 2018 and 2021. The scheme surfaced when a newly hired auditor flagged discrepancies in the 2021 year-end review. The court sentenced him to prison and ordered restitution.'
  const injections: { axis: string; narration: string }[] = [
    { axis: 'added', narration: `${base} Investigators later traced most of the missing money to a secret offshore account in Reyes's name.` },
    { axis: 'certainty', narration: `${base} Reyes used the money to pay off his personal gambling debts.` },
    { axis: 'motive', narration: `${base} He drained the accounts because he had long resented the cooperative's board for passing him over for a promotion.` },
    { axis: 'dialogue', narration: `${base} When the auditor confronted him that morning, Reyes said, "You have no idea what you're doing."` },
    { axis: 'chronology', narration: `Marcus Reyes was convicted of qualified theft in 2022. Only afterward did he begin making the 37 unauthorized transfers that drained 4.2 million pesos from the Santa Rosa Community Cooperative.` },
    { axis: 'removed', narration: `Marcus Reyes served as treasurer of the Santa Rosa Community Cooperative from 2015 to 2021. A newly hired auditor flagged discrepancies in the 2021 year-end review, and the cooperative — which had about 1,200 members — was shaken. Reyes had entered the office at 8:01 that August morning and left at 8:14.` },
  ]
  const injResults: { axis: string; caught: boolean; got: string[] }[] = []
  for (const inj of injections) {
    const v = await runFFC(inj.narration)
    const axes = v.issues.map((i) => i.axis)
    injResults.push({ axis: inj.axis, caught: axes.includes(inj.axis as never), got: axes })
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}\nEBN full chain: Dossier → Extractor → Bible → Claims → Writer → Fact-Fidelity Checker`)
  console.log(`\n── EXTRACTED EVIDENCE BIBLE (${facts.length} atomic facts) ──`)
  for (const f of facts) console.log(`  ${f.id} [${f.stance}/${f.weight}${f.kind === 'DERIVED' ? `/DERIVED←${f.derived_from.join(',')}` : ''}]${f.attributed_to ? ` (attr: ${f.attributed_to})` : ''}  ${f.value}`)
  console.log(`\n── EXTRACTOR-FIDELITY AUDIT ── invented: ${auditRes.data.invented.length} · mis-stanced: ${auditRes.data.misstanced.length}`)
  for (const i of auditRes.data.invented) console.log(`    INVENTED ${i.id}: ${i.why}`)
  for (const m of auditRes.data.misstanced) console.log(`    MIS-STANCED ${m.id} → ${m.should_be}: ${m.why}`)

  console.log(`\n── NARRATIVE CLAIMS (ordering only) ──`)
  for (const c of claims) console.log(`  ${c.id} [order ${c.order}] ${c.purpose}  ← ${c.evidence.join(', ')}`)
  console.log(`\n── GENERATED NARRATION (writer; every sentence cited) ──\n${cleanNarration}`)
  const allIds = new Set(facts.map((f) => f.id))
  const badCites = flatSentences.flatMap((s) => s.factIds.filter((id) => !allIds.has(id)))
  console.log(`\n── CITABILITY: ${badCites.length === 0 ? 'all citations resolve ✓' : `DANGLING: ${badCites.join(', ')}`}`)
  console.log(`\n── FFC on CLEAN narration: ${cleanVerdict.issues.length === 0 ? 'PASS — no issues ✓' : `${cleanVerdict.issues.length} issue(s)`}`)
  for (const i of cleanVerdict.issues) console.log(`    [${i.axis}] ${i.offending} — ${i.detail}`)
  console.log(`\n── FFC injection tests ──`)
  let caught = 0
  for (const r of injResults) { if (r.caught) caught++; console.log(`  ${r.caught ? '✓ CAUGHT' : '✗ MISSED'}  planted=${r.axis} → ${r.got.join(', ') || '(none)'}`) }

  console.log(`\n${'═'.repeat(78)}\nRESULT: extractor invented ${auditRes.data.invented.length}, mis-stanced ${auditRes.data.misstanced.length} · injections caught ${caught}/${injResults.length} · clean FFC issues ${cleanVerdict.issues.length} · dangling cites ${badCites.length}`)
  console.log(`total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
