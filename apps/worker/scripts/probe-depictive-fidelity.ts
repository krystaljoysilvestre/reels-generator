// Depictive-fidelity routing probe (specs/depictive-fidelity.md).
//
// THE QUESTION: does the subject classifier + structured identity/eligibility gate route each class of real
// subject to the right depiction mode — on the LIVE Wikipedia/Wikidata data, not on fixtures? The unit tests
// prove the pure logic; only this proves the classifier reads real names the way we think, and that Wikidata
// actually carries the death dates the safety gate depends on.
//
// Nothing is rendered and nothing is written to the DB. Cost is the decider call per subject (~$0.002 each)
// plus one staging rewrite; the Wikipedia/Wikidata lookups are free.
//
// Usage: pnpm --filter worker exec tsx scripts/probe-depictive-fidelity.ts     (cwd apps/worker)
//
// PRE-REGISTERED EXPECTATIONS (written before the run):
//   A. place / object / animal with a specific real name  → reference_plate
//   B. anonymous subject of any kind                      → generated (generic_subject)
//   C. an invented character                              → generated (fictional_subject)
//   D. a long-dead figure with a Wikidata death date      → reference_plate (verified_historical)
//   E. a living public figure (no P570)                   → archival_only (death_date_unverifiable)
//   F. someone who died ~50 years ago                     → archival_only (living_or_recently_deceased)
//   G. a name that lands on a disambiguation page         → generated (identity_unverified), NEVER sourced
//   H. the staging rewrite for a withheld person          → output names nobody
//
// D–G are the safety spine: NO subject may reach 'reference_plate' without BOTH a Wikidata identity and a
// death year ≥ HUMAN_PLATE_MIN_YEARS_DEAD. A single violation there is a release blocker, not a tuning note.
//
// FALSIFICATION: if E/F/G ever route to 'reference_plate', the structural gate is not doing what the floor
// requires and the human path must not ship.
import '../src/env.js'
import { llmCall, resolveSubjectIdentity, wikidataDeathYear } from '@reels/providers'
import { HUMAN_PLATE_MIN_YEARS_DEAD, SourcePolicySchema, mentionsAny, personNameVariants } from '@reels/core'
import { buildRepresentativeStagingPrompt, RepresentativeStagingSchema } from '../src/prompts-bridge.js'
import { routeDepiction } from '../src/pipeline/depiction-routing.js'

const POLICY = SourcePolicySchema.parse({ realPlaces: true, realPeople: 'historical', realEvents: true, invention: 'constrained' })

interface Case {
  id: string
  kind: 'character' | 'location' | 'object'
  description: string
  expectMode: 'generated' | 'reference_plate' | 'archival_only'
  expectReason?: string
  note: string
}

const CASES: Case[] = [
  // Regression — the two cases the original places build was verified on.
  { id: 'paoay-church', kind: 'location', description: 'a baroque church of coral blocks with massive side buttresses and a coral-stone bell tower', expectMode: 'reference_plate', note: 'A · regression: places still source' },
  { id: 'a-bedroom', kind: 'location', description: 'a small rented bedroom with peeling cream paint and one shuttered window', expectMode: 'generated', expectReason: 'generic_subject', note: 'B · regression: generic settings still skip' },

  // New subject classes.
  { id: 'titanic', kind: 'object', description: 'a four-funnelled British ocean liner of 1912', expectMode: 'reference_plate', note: 'A · object' },
  { id: 'cracked-mirror', kind: 'object', description: 'a bathroom mirror with a crack running through it', expectMode: 'generated', expectReason: 'generic_subject', note: 'B · anonymous object' },
  { id: 'philippine-eagle', kind: 'character', description: 'a large forest raptor with a shaggy crest and pale blue eyes', expectMode: 'reference_plate', note: 'A · animal tagged as a character — the case a kind-based gate gets wrong' },
  { id: 'a-stray-dog', kind: 'character', description: 'a thin street dog with matted fur', expectMode: 'generated', expectReason: 'generic_subject', note: 'B · anonymous animal' },
  { id: 'ashley', kind: 'character', description: 'a seventeen-year-old schoolgirl in a white uniform blouse', expectMode: 'generated', expectReason: 'fictional_subject', note: 'C · invented character' },

  // The safety spine.
  { id: 'jose-rizal', kind: 'character', description: 'a Filipino writer and national hero of the late nineteenth century, in a dark frock coat', expectMode: 'reference_plate', expectReason: 'verified_historical', note: 'D · long dead, Wikidata-verified' },
  { id: 'elvis-presley', kind: 'character', description: 'an American singer of the mid twentieth century', expectMode: 'archival_only', expectReason: 'living_or_recently_deceased', note: 'F · died ~50 years ago — too recent for a plate' },
  { id: 'john-smith', kind: 'character', description: 'a man', expectMode: 'generated', expectReason: 'identity_unverified', note: 'G · ambiguous name — never sourced on either path' },
]

const ok = (b: boolean) => (b ? '[32mPASS[0m' : '[31mFAIL[0m')

async function main() {
  let spent = 0
  let failures = 0
  const year = new Date().getUTCFullYear()

  console.log(`\n=== Depiction routing (policy: realPlaces=true, realPeople=historical; cutoff = died ≤ ${year - HUMAN_PLATE_MIN_YEARS_DEAD}) ===\n`)

  for (const c of CASES) {
    const { routing, costCents } = await routeDepiction({ id: c.id, kind: c.kind, description: c.description }, POLICY, 'Philippines')
    spent += costCents
    const modeOk = routing.depictionMode === c.expectMode
    const reasonOk = !c.expectReason || routing.eligibilityReason === c.expectReason
    if (!modeOk || !reasonOk) failures++
    console.log(
      `${ok(modeOk && reasonOk)}  ${c.id.padEnd(20)} → ${routing.subjectClass.padEnd(9)} ${routing.depictionMode.padEnd(17)} ${routing.eligibilityReason}` +
      `${modeOk && reasonOk ? '' : `   (expected ${c.expectMode}${c.expectReason ? ` / ${c.expectReason}` : ''})`}\n     ${c.note}`,
    )
  }

  // E · a LIVING public figure. Deliberately resolved by hand rather than hardcoded into CASES: naming a
  // specific living person in a committed test fixture is the thing this whole feature exists to avoid, and
  // the assertion we care about is structural — "no P570 ⇒ never a plate" — not who the person is.
  console.log('\n=== Living-person gate (structural) ===\n')
  for (const name of ['Taylor Swift', 'Lionel Messi']) {
    const identity = await resolveSubjectIdentity(name)
    const deathYear = identity ? await wikidataDeathYear(identity.wikibaseItem) : null
    const safe = deathYear === null || deathYear > year - HUMAN_PLATE_MIN_YEARS_DEAD
    if (!safe) failures++
    console.log(`${ok(safe)}  a living public figure → wikidata=${identity?.wikibaseItem ?? 'none'} deathYear=${deathYear ?? 'none'} → ineligible for a conditioning plate`)
  }

  // H · the staging rewrite must not name the person it is replacing.
  console.log('\n=== Representative staging rewrite ===\n')
  const withheld = 'juan-dela-cruz'
  const names = personNameVariants(withheld)
  const sp = buildRepresentativeStagingPrompt(
    'Close-up of Juan Dela Cruz shaking hands with trade officials at a podium, flags of the Philippines behind them',
    'Juan Dela Cruz',
  )
  const rewrite = await llmCall({
    templateVersion: 'entity-source.v1', schema: RepresentativeStagingSchema,
    provider: 'anthropic', model: 'claude-haiku-4-5-20251001',
    system: sp.system, messages: [{ role: 'user', content: sp.userMessage }],
  })
  spent += rewrite.costCents
  const clean = !mentionsAny(rewrite.data.imagePrompt, names)
  const positive = !/\bno faces\b|\bwithout showing\b|\bunidentifiable\b/i.test(rewrite.data.imagePrompt)
  if (!clean) failures++
  console.log(`${ok(clean)}  names nobody`)
  console.log(`${ok(positive)}  describes presence, not absence${positive ? '' : '  (soft: quality, not safety — the scrub still guarantees the name is gone)'}`)
  console.log(`     → "${rewrite.data.imagePrompt}"`)

  console.log(`\n=== ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} · spend $${(spent / 100).toFixed(3)} ===\n`)
  if (failures > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
