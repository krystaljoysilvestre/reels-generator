// Ending-critic calibration harness (2026-08-06).
//
// WHY THIS EXISTS: the first bounded-edit probe caught me tuning the critic from OVER-firing (2/4
// hand-authored closes) straight into UNDER-firing (it missed 3 of 8 independently-weak endings). Each
// tuning pass was justified by the evidence in front of it, and the evidence in front of it was 4 items
// and a 2-item true-positive check. That is too small to see an overshoot.
//
// So: no more tuning against one error rate. This harness measures BOTH on every run, over a labelled
// dev set, for ~1¢ per item. It generates nothing and edits nothing — it runs ONLY the critic (the
// locate step) and compares its verdict against the label.
//
// WHERE THE LABELS COME FROM (deliberately not from me):
//   · should-NOT-fire — the repo's own hand-authored fewshot exemplars (probe-genre-lab.ts: "the real
//     thing"), plus every probe story the INDEPENDENT endings-audit judge graded not-weak.
//   · should-FIRE — every probe story that judge graded weak (deletionLoss:'nothing' OR
//     terminalExposition:true).
//
// TWO LIMITS TO STATE OUT LOUD:
//   1. This is a DEV set. Tuning until it scores well is fitting to it. The honest number comes from a
//      FRESH batch afterwards (probe-ending-repair.ts with a new PROBE_SEED_OFFSET) — this harness makes
//      iteration cheap, it does not make the result final.
//   2. The judge that produced the labels has ~8% test-retest noise (measured: 2 of 24 byte-identical
//      stories flipped verdict between runs). Treat a 1-item difference as noise, not progress.
//
// Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-critic-calibration.ts                    # whole dev set
//   CAL_GENRES=informational,lifestyle pnpm exec tsx scripts/probe-critic-calibration.ts
//   CAL_SET=critic-devset.json pnpm exec tsx scripts/probe-critic-calibration.ts
import '../src/env.js'
import { readFileSync } from 'node:fs'

interface DevItem {
  genre: string
  title: string
  body: string
  expectFire: boolean
  source: string
  loss?: string
  expo?: boolean
  kind?: string
}

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const {
    buildStoryEndingCriticPrompt,
    EndingCriticSchema,
    STORY_ENDING_CRITIC_V1_VERSION,
  } = await import('../src/prompts-bridge.js')
  const { splitNumberedSentences, asModelText } = await import('@reels/core')

  // Genre niches, mirroring probe-genre-lab.ts LAB (kept for the CAL_REPAIR path below).
  const NICHE: Record<string, string> = {
    informational: 'surprising everyday facts and how-things-really-work explainers for Filipino viewers — money, food, city life, history',
    comedy: 'everyday Filipino disaster comedy — true-feeling stories of small plans going catastrophically, hilariously wrong',
    lifestyle: 'Filipino food and small-joys lifestyle — where to eat, what to cook, tiny routines that make the week better',
    general: 'true-feeling everyday Filipino stories — whatever the barangay would actually retell',
    drama: 'Filipino drama — ordinary people forced into hard, human choices: family, marriage, money, pride, love, and the debts we owe each other; told first-person',
    horror: 'first-person Filipino folk horror — ordinary provincial life turned wrong by the old fears',
    reddit_story: 'Filipino confession & drama stories — someone did someone wrong, and the viewer has to take a side',
  }

  const file = process.env.CAL_SET ?? 'critic-devset.json'
  let items = JSON.parse(readFileSync(file, 'utf8')) as DevItem[]
  const only = process.env.CAL_GENRES?.split(',').map((s) => s.trim())
  if (only?.length) items = items.filter((i) => only.includes(i.genre))

  // ── CAL_REPAIR=1 — run the FULL pass on the known-weak items only ─────────────────────────────────
  // The cheapest honest measurement of the pre-registered criterion. Generating fresh stories to find
  // ~5 weak endings costs ~$3; running the shipped repair over 8 already-graded weak endings costs ~60¢
  // and measures the same thing — how many weak closes the pass actually fixes. Writes both arms for
  // endings-audit.ts, which stays the independent scorer (the pass never grades its own homework).
  // NOT a substitute for a fresh batch: these items are dev-set members, so this measures the SURGEON's
  // conversion rate on weak material, not the critic's generalization to unseen stories.
  if (process.env.CAL_REPAIR === '1') {
    const { runEndingRepair } = await import('../src/pipeline/steps/ending-repair.js')
    const { resolvePeak } = await import('../src/pipeline/steps/generate-story.js')
    const { writeFileSync } = await import('node:fs')
    const weak = items.filter((i) => i.expectFire)
    console.log(`⚗ END-TO-END REPAIR on ${weak.length} independently-weak endings\n`)
    let cents = 0
    const before: DevItem[] = []
    const after: DevItem[] = []
    for (const it of weak) {
      const niche = NICHE[it.genre] ?? NICHE.general!
      const res = await runEndingRepair({
        title: it.title,
        narration: it.body,
        peakMoment: '', // no stored peak for these; the peak guards simply do not engage
        genreCategory: it.genre,
        nicheDescription: niche,
        language: 'taglish',
        audienceDescriptor: 'Filipino viewers on short-form video',
        onCost: (c) => { cents += c },
        resolvePeak,
      })
      const audit = res.audit
      const attempts = audit.status === 'ok' ? audit.attempts : []
      const applied = audit.status === 'ok' && audit.applied
      const a = attempts.find((x) => x.applied)
      const skipped = attempts.find((x) => x.skipped)?.skipped
      before.push({ ...it, body: it.body })
      after.push({ ...it, body: res.narration })
      console.log(`${applied ? '✎ EDITED' : '· no edit'} [${it.genre}] ${it.title.slice(0, 46)}`)
      if (skipped) console.log(`     blocked: ${skipped.slice(0, 120)}`)
      if (applied) {
        console.log(`     −  ${a?.removed?.slice(0, 130)}`)
        console.log(`     +  ${a?.replacement?.slice(0, 130)}`)
      }
    }
    writeFileSync('cal-repair-before.json', JSON.stringify(before.map(({ genre, title, body }) => ({ genre, title, body })), null, 2))
    writeFileSync('cal-repair-after.json', JSON.stringify(after.map(({ genre, title, body }) => ({ genre, title, body })), null, 2))
    const edits = before.filter((b, i) => b.body !== after[i]!.body).length
    console.log(`\nedits applied: ${edits}/${weak.length}   cost: ${cents}¢`)
    console.log('score independently:')
    console.log('  pnpm exec tsx scripts/endings-audit.ts cal-repair-before.json')
    console.log('  pnpm exec tsx scripts/endings-audit.ts cal-repair-after.json')
    process.exit(0)
  }

  console.log(`⚗ critic calibration — ${STORY_ENDING_CRITIC_V1_VERSION}`)
  console.log(`dev set: ${items.length} items · ${items.filter((i) => i.expectFire).length} should-fire / ${items.filter((i) => !i.expectFire).length} should-not-fire\n`)

  let cents = 0
  type Row = DevItem & { fired: boolean; problem: string; kindSaid: string; correct: boolean }
  const rows: Row[] = []

  for (const it of items) {
    try {
      const split = splitNumberedSentences(it.body)
      const p = buildStoryEndingCriticPrompt({
        genreCategory: it.genre,
        language: 'taglish',
        // closingCraft reverted out 2026-08-06 (decision-log 2026-08-06-003)
        closingCraft: undefined,
        title: it.title,
        numberedNarration: split.numbered,
        sentenceCount: split.raw.length,
      })
      const res = await llmCall({
        templateVersion: STORY_ENDING_CRITIC_V1_VERSION,
        schema: EndingCriticSchema,
        system: p.system,
        messages: [{ role: 'user', content: p.userMessage }],
        provider: 'anthropic',
        maxTokens: 700,
      })
      cents += res.costCents
      const fired = !res.data.landed
      const correct = fired === it.expectFire
      rows.push({ ...it, fired, problem: res.data.problem, kindSaid: res.data.landingKind, correct })
      const mark = correct ? '·' : '✗'
      console.log(`${mark} ${it.expectFire ? 'weak    ' : 'fine    '} → ${fired ? 'FIRED   ' : 'landed  '} [${it.genre}] ${it.title.slice(0, 44)}`)
    } catch (e) {
      console.warn(`! [${it.genre}] "${it.title.slice(0, 40)}" failed: ${String(e).slice(0, 160)}`)
    }
  }

  // ── Both error rates, every run ───────────────────────────────────────────────────────────────────
  const pos = rows.filter((r) => r.expectFire)
  const neg = rows.filter((r) => !r.expectFire)
  const caught = pos.filter((r) => r.fired)
  const falseFires = neg.filter((r) => r.fired)
  const missed = pos.filter((r) => !r.fired)

  console.log(`\n${'═'.repeat(78)}`)
  console.log('BOTH ERROR RATES (tuning one without the other is how the last overshoot happened)')
  console.log('═'.repeat(78))
  console.log(`RECALL      caught ${caught.length}/${pos.length} weak endings          ${pos.length ? Math.round((100 * caught.length) / pos.length) : 0}%`)
  console.log(`PRECISION   false fires ${falseFires.length}/${neg.length} good endings     ${neg.length ? Math.round((100 * falseFires.length) / neg.length) : 0}% fire rate`)

  const genres = [...new Set(rows.map((r) => r.genre))].sort()
  console.log(`\nper genre (recall · false fires):`)
  for (const g of genres) {
    const p = rows.filter((r) => r.genre === g && r.expectFire)
    const n = rows.filter((r) => r.genre === g && !r.expectFire)
    console.log(`  ${g.padEnd(14)} ${p.filter((r) => r.fired).length}/${p.length} caught   ${n.filter((r) => r.fired).length}/${n.length} false`)
  }
  console.log(`\nby source (hand-authored false fires are the most damning):`)
  for (const s of [...new Set(rows.map((r) => r.source))]) {
    const n = rows.filter((r) => r.source === s && !r.expectFire)
    console.log(`  ${s.padEnd(14)} ${n.filter((r) => r.fired).length}/${n.length} false fires`)
  }

  if (missed.length) {
    console.log(`\n── MISSED (weak, critic said landed) ──`)
    for (const r of missed) {
      console.log(`  [${r.genre}] ${r.title.slice(0, 50)}   (judge: loss=${r.loss} expo=${r.expo} kind=${r.kind})`)
      console.log(`     critic called it: ${r.kindSaid}`)
    }
  }
  if (falseFires.length) {
    console.log(`\n── FALSE FIRES (good ending, critic wanted to replace it) ──`)
    for (const r of falseFires) {
      console.log(`  [${r.genre}] ${r.title.slice(0, 50)}   (${r.source})`)
      console.log(`     "${r.problem.slice(0, 150)}"`)
    }
  }
  console.log(`\ncost: ${cents}¢`)
  process.exit(0)
})()
