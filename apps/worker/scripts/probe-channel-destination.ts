// Channel-level destination probe (2026-08-07).
//
// THE QUESTION: today `emotionalDestination` / `hookPromise` / `viewerTransformation` are planner
// OUTPUTS — invented fresh every reel. Nothing on the channel says "every story here leaves the viewer
// in the same place." Should the channel own a DESTINATION, or should we leave it to the LLM?
//
// Two things have to be true before that earns a slot, and this probe measures both:
//   1. An explicit destination actually STEERS the planner (vs. it planning the same ideas anyway).
//   2. Steering it does not COLLAPSE variety — a fixed destination fighting the planner's variety rule
//      is the obvious failure mode, and an adherence win bought with sameness is a negative result.
//
// PHASE A — a 2×2 on ONE real channel (Crossroads, informational), so genre/tone/world are held fixed
// and the ONLY things that move are (a) whether the niche prose already states a destination and
// (b) whether the destination is promoted to its own prompt slot:
//
//                       CONTROL (production prompt)      DEST (production prompt + destination slot)
//   BARE niche          baseline — no destination        does an explicit slot steer it?      ← core
//   RICH niche (real)   prose-only destination           does slot > prose buy anything?      ← "leave
//                                                                                                it to
//                                                                                                the LLM?"
//
// The BARE niche is the real Crossroads text with every destination/mission sentence removed and
// nothing else changed — subject matter identical, purpose stripped. That isolates the variable.
//
// PHASE B — extraction. If a slot IS worth having, it has to be fillable from what creators already
// write. Runs an extract-or-ABSTAIN prompt over the 3 real channel niches in the DB plus 4 deliberately
// bare ones. The metric that matters is INVENTION: an extractor that never abstains is making
// destinations up, which is worse than no slot at all. Every returned quote is verified as a literal
// substring of the source text in code — no judge, no benefit of the doubt.
//
// PRE-REGISTERED SUCCESS CRITERIA (written before the run — do not move them afterwards):
//   A1. EFFECT (primary): on the BARE niche, DEST adherence total ≥ CONTROL + 3 points (0–2 scale,
//       n=5 → 10 points available). Miss ⇒ an explicit destination does not steer the planner; drop
//       the idea and leave it to the LLM.
//   A2. VARIETY (veto — an A1 win does not survive an A2 failure): DEST must not lose more than 1
//       distinct value on `structure`, `setting` or `turn` vs its own CONTROL cell, and repeated
//       (structure+setting+turn) triples must not increase by more than 1.
//   A3. REDUNDANCY: if RICH/CONTROL adherence ≥ 8/10, the niche prose is ALREADY doing the job for
//       channels that write it down — the slot's value is then limited to channels whose text lacks it
//       (which is what Phase B measures), and a schema change is not justified on RICH's evidence.
//   B1. NO INVENTION: 4/4 abstentions on the bare inputs. Any fabricated destination fails the phase.
//   B2. GROUNDED: every non-abstained destination carries a quote that is a literal substring of the
//       niche text (checked in code, not by a model).
//
// NOISE: the repo's judges have ~8% test-retest noise (see bounded-edit / critic-calibration work).
// A 1-point difference is noise. The criteria above are sized past it deliberately.
//
// This probe wires NOTHING into production. The destination block and both judges stay inline
// ('channel-destination.v0-probe') until the results earn them a spec — the probe-plan-force pattern.
//
// Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-channel-destination.ts            # both phases, n=5  (~60-80¢)
//   PROBE_PHASE=B pnpm exec tsx scripts/probe-channel-destination.ts   # extraction only (~10¢)
//   PROBE_RUNS=2 pnpm exec tsx scripts/probe-channel-destination.ts    # smoke
import '../src/env.js'
import { z } from 'zod'
import { writeFileSync } from 'node:fs'
import type { StoryElements } from '../src/prompts-bridge.js'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildStoryPlannerPrompt, StoryPlanSchema, STORY_PLANNER_V1_VERSION } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')

  type StoryPlan = z.infer<typeof StoryPlanSchema>

  const RUNS = Number(process.env['PROBE_RUNS'] ?? 5)
  const PHASE = (process.env['PROBE_PHASE'] ?? 'AB').toUpperCase()
  let totalCost = 0

  // ── The channel under test ────────────────────────────────────────────────────────────────────
  // Real row: Crossroads (informational, English, 540s long-form). Held fixed across all four cells.
  const CHANNEL = {
    name: 'Crossroads',
    genreCategory: 'informational',
    narrativeStyle: 'deep_dive',
    targetSeconds: 540,
    toneConfig: JSON.stringify({ intensity: 8, warmth: 5, energy: 6, pacing: 7, humor: 1 }),
    worldBibleJson: JSON.stringify(
      {
        region: 'global modern settings',
        era: 'contemporary',
        canonLocations: [],
        canonObjects: [],
        vocabulary: {
          path: 'trajectory',
          impact: 'repercussion',
          crossroads: 'critical juncture',
          'ripple effect': 'wave of consequences',
          'bigger picture': 'macro view',
        },
      },
      null,
      2,
    ),
  }

  // The real niche text, verbatim from the DB (channel 9a788df1). Destination language INTACT:
  // "help people think more deeply…", "helping viewers become more informed, critical thinkers",
  // "Every ending leaves you seeing the world differently."
  const NICHE_RICH = `Crossroads is a short-form explainer channel that explores the pivotal moments, decisions, and events that shape our world. Every episode begins at a critical crossroads—a technological breakthrough, government policy, scientific discovery, historical event, or hypothetical scenario—and follows the most likely paths that could unfold.

Using research, historical precedent, expert insights, and logical reasoning, each video explains not only what could happen, but why it matters and how it could affect people, economies, technology, and society Rather than predicting the future, Crossroads helps viewers understand the interconnected consequences of today's choices.

The goal is simple: help people think more deeply about the world by revealing the ripple effects behind every major decision and event.

Tagline: Every choice changes the future.

Content Pillars

🌍 Geopolitics — wars, alliances, sanctions, diplomacy, global power shifts
💰 Economics — inflation, trade, markets, supply chains, financial systems
🤖 Technology — AI, robotics, cybersecurity, space, quantum computing
🌱 Climate & Energy — renewable energy, nuclear power, food security, sustainability
🧬 Science — medicine, genetics, astronomy, emerging discoveries
🏛️ Society — demographics, education, cities, work, culture
📜 History — pivotal moments and the consequences that shaped today's world

---

Example Topics

* What Happens If AI Replaces Half of All Office Jobs?
* What If the Internet Went Offline for 24 Hours?
* What If Nuclear Fusion Finally Works?
* What If Taiwan's Semiconductor Industry Stops?
* What If Every Country Adopted a Four-Day Workweek?
* What If the US Dollar Lost Its Reserve Currency Status?
* What If Antarctica's Ice Melt Accelerates?
* What If Antibiotics Stop Working?
* What If Humans Build a Permanent City on Mars?
* What If Every Car Becomes Self-Driving?

---

Brand Personality

* Thoughtful and intellectually curious
* Balanced, objective, and evidence-based
* Clear and accessible without oversimplifying
* Visually engaging with cinematic storytelling
* Transparent about uncertainty and competing viewpoints

---

Core Story Structure

Every episode follows a simple, repeatable framework:

1. The Crossroads — Introduce the pivotal event, decision, or scenario.
2. Immediate Impact — Explain what changes first.
3. Ripple Effects — Explore how those changes spread across industries, societies, and countries.
4. The Bigger Picture — Reveal the deeper implications and interconnected systems at play.
5. Open Question — End with a thought-provoking question that invites viewers to think beyond the video.

---

Mission

In a world overflowing with headlines and opinions, Crossroads exists to explain how one decision can change everything. Instead of chasing breaking news, it uncovers the connections, consequences, and trade-offs that shape our future—helping viewers become more informed, critical thinkers.

Every episode begins at a crossroads. Every ending leaves you seeing the world differently.`

  // The SAME channel with every purpose/mission sentence removed — subject, pillars, topics, brand
  // personality and episode framework all kept. Nothing was added. This is what a creator who describes
  // WHAT they cover but never WHY writes, which is the common case.
  const NICHE_BARE = `Crossroads is a short-form explainer channel that explores the pivotal moments, decisions, and events that shape our world. Every episode begins at a critical crossroads—a technological breakthrough, government policy, scientific discovery, historical event, or hypothetical scenario—and follows the most likely paths that could unfold.

Using research, historical precedent, expert insights, and logical reasoning, each video explains what could happen next.

Content Pillars

🌍 Geopolitics — wars, alliances, sanctions, diplomacy, global power shifts
💰 Economics — inflation, trade, markets, supply chains, financial systems
🤖 Technology — AI, robotics, cybersecurity, space, quantum computing
🌱 Climate & Energy — renewable energy, nuclear power, food security, sustainability
🧬 Science — medicine, genetics, astronomy, emerging discoveries
🏛️ Society — demographics, education, cities, work, culture
📜 History — pivotal moments and the consequences that shaped today's world

---

Example Topics

* What Happens If AI Replaces Half of All Office Jobs?
* What If the Internet Went Offline for 24 Hours?
* What If Nuclear Fusion Finally Works?
* What If Taiwan's Semiconductor Industry Stops?
* What If Every Country Adopted a Four-Day Workweek?
* What If the US Dollar Lost Its Reserve Currency Status?
* What If Antarctica's Ice Melt Accelerates?
* What If Antibiotics Stop Working?
* What If Humans Build a Permanent City on Mars?
* What If Every Car Becomes Self-Driving?

---

Brand Personality

* Thoughtful and intellectually curious
* Balanced, objective, and evidence-based
* Clear and accessible without oversimplifying
* Visually engaging with cinematic storytelling
* Transparent about uncertainty and competing viewpoints

---

Core Story Structure

Every episode follows a simple, repeatable framework:

1. The Crossroads — Introduce the pivotal event, decision, or scenario.
2. Immediate Impact — Explain what changes first.
3. Ripple Effects — Explore how those changes spread across industries, societies, and countries.
4. The Bigger Picture — Reveal the deeper implications and interconnected systems at play.
5. Open Question — End with a thought-provoking question that invites viewers to think beyond the video.`

  // The destination itself — written in the channel's OWN words (drawn from the mission lines in
  // NICHE_RICH) so the DEST arm isn't smuggling in a better idea, only a better PLACEMENT.
  const DESTINATION =
    'The viewer walks out seeing a system they thought was distant and separate — geopolitics, a supply chain, a policy — as something already running through their own life, and feeling the weight of a decision someone else is making for them.'

  // The candidate prompt block. Deliberately the STRONG version: if a strong destination can't move
  // planner output, a softer one certainly won't, and a null result is then trustworthy.
  const destinationBlock = (dest: string) => `
THE CHANNEL'S DESTINATION — every story on this channel exists to leave the viewer in the same place:
${dest}
This is the one thing that does not vary between episodes. The premise, setting, structure and turn must still differ from everything that came before — the variety rule is unchanged. What varies is the ROUTE; the destination is fixed. If your committed idea cannot honestly arrive there, it is the wrong idea for this channel — pick another.
`

  // Splice the block in directly after the tone line, where it would live if this shipped, rather than
  // bolting it on the end. Falls back to appending if the anchor ever moves.
  function withDestination(system: string, dest: string): string {
    const anchor = '\n\nYou do not write prose.'
    return system.includes(anchor)
      ? system.replace(anchor, `\n${destinationBlock(dest)}\nYou do not write prose.`)
      : `${system}\n${destinationBlock(dest)}`
  }

  // ── Judges (inline, probe-only) ───────────────────────────────────────────────────────────────
  const AdherenceSchema = z.object({
    score: z.number().int().min(0).max(2), // 0 = lands somewhere else · 1 = adjacent · 2 = lands on it
    reason: z.string().min(1),
  })

  async function judgeAdherence(plan: StoryPlan, dest: string) {
    const r = await llmCall({
      templateVersion: 'channel-destination-judge.v0-probe',
      schema: AdherenceSchema,
      system: `You score how closely ONE planned story lands on a stated channel destination. You are reading planning notes, not prose. Be strict and literal: score what the plan actually commits to, not what a generous reading could make it mean. You do not know which of two prompt variants produced this plan and must not speculate.`,
      messages: [
        {
          role: 'user',
          content: `THE CHANNEL'S DESTINATION — where every story is supposed to leave the viewer:
${dest}

THE PLANNED STORY:
- hook promise: ${plan.hookPromise}
- viewer believes walking in: ${plan.viewerTransformation.before}
- viewer believes walking out: ${plan.viewerTransformation.after}
- ending: ${plan.ending}
- emotional destination: ${plan.emotionalDestination}

Score 0-2:
  2 = the viewer genuinely ends up at that destination — the walking-out belief and the feeling both match it
  1 = adjacent — same territory, but it lands on a different belief or a different feeling
  0 = it lands somewhere else entirely

OUTPUT (JSON only): { "score": 0-2, "reason": "one sentence citing the plan's own words" }`,
        },
      ],
      temperature: 0.2,
      maxTokens: 300,
    })
    totalCost += r.costCents
    return r.data
  }

  const SamenessSchema = z.object({
    distinctIdeas: z.number().int().min(1), // how many genuinely different stories are in the set
    verdict: z.enum(['varied', 'some_overlap', 'samey']),
    reason: z.string().min(1),
  })

  async function judgeSameness(plans: StoryPlan[]) {
    const r = await llmCall({
      templateVersion: 'channel-destination-sameness.v0-probe',
      schema: SamenessSchema,
      system: `You judge whether a batch of planned stories for one channel are genuinely different stories or the same story wearing different subjects. A different topic with the same shape, the same turn and the same closing feeling is NOT a different story. You do not know how these were produced.`,
      messages: [
        {
          role: 'user',
          content: `${plans
            .map(
              (p, i) => `STORY ${i + 1}
  logline: ${p.logline}
  conflict: ${p.conflict}
  twist: ${p.twist}
  ending: ${p.ending}
  emotional destination: ${p.emotionalDestination}`,
            )
            .join('\n\n')}

OUTPUT (JSON only): { "distinctIdeas": <how many of these ${plans.length} are genuinely different stories>, "verdict": "varied" | "some_overlap" | "samey", "reason": "one sentence" }`,
        },
      ],
      temperature: 0.2,
      maxTokens: 400,
    })
    totalCost += r.costCents
    return r.data
  }

  // ── Deterministic variety (no judge, no noise) ────────────────────────────────────────────────
  function variety(plans: StoryPlan[]) {
    const els = plans.map((p) => p.elements as StoryElements & Record<string, string | undefined>)
    const distinct = (k: string) => new Set(els.map((e) => (e[k] ?? '').toLowerCase().trim()).filter(Boolean)).size
    const triples = els.map((e) => [e.structure, e.setting, e.turn].map((v) => (v ?? '').toLowerCase().trim()).join('|'))
    const repeatedTriples = triples.length - new Set(triples).size
    return {
      structure: distinct('structure'),
      setting: distinct('setting'),
      turn: distinct('turn'),
      role: distinct('role'),
      trigger: distinct('trigger'),
      repeatedTriples,
    }
  }

  // ── Phase A ───────────────────────────────────────────────────────────────────────────────────
  interface Cell {
    key: string
    niche: string
    useSlot: boolean
    plans: StoryPlan[]
    scores: { score: number; reason: string }[]
  }

  async function runCell(key: string, niche: string, useSlot: boolean): Promise<Cell> {
    const cell: Cell = { key, niche, useSlot, plans: [], scores: [] }
    // Per-cell avoid lists accumulate exactly as production's do, so the variety pressure the planner
    // feels is the real one. Angle rotation + nonce are keyed to i, identical across cells.
    const recentLoglines: string[] = []
    const recentEls: StoryElements[] = []
    for (let i = 0; i < RUNS; i++) {
      const angle = selectAngles(1, i)[0]!
      const built = buildStoryPlannerPrompt({
        channelName: CHANNEL.name,
        nicheDescription: niche,
        toneConfig: CHANNEL.toneConfig,
        worldBibleJson: CHANNEL.worldBibleJson,
        genreCategory: CHANNEL.genreCategory,
        narrativeStyle: CHANNEL.narrativeStyle,
        styleInfluence: 'medium',
        targetSeconds: CHANNEL.targetSeconds,
        angleDirective: angle.directive,
        avoidList: recentLoglines.join('\n'),
        rejectionAvoidList: '',
        regenerationNonce: i,
        recentElements: recentEls,
      })
      const system = useSlot ? withDestination(built.system, DESTINATION) : built.system
      const plan = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION,
        schema: StoryPlanSchema,
        system,
        messages: [{ role: 'user', content: built.userMessage }],
        temperature: 1.0,
        maxTokens: 1500,
      })
      totalCost += plan.costCents
      cell.plans.push(plan.data)
      recentEls.push(plan.data.elements)
      if (plan.data.logline) recentLoglines.push(plan.data.logline)
      console.log(`  [${key}] ${i + 1}/${RUNS} — ${plan.data.logline.slice(0, 90)}`)
    }
    for (const p of cell.plans) cell.scores.push(await judgeAdherence(p, DESTINATION))
    return cell
  }

  // ── Phase B ───────────────────────────────────────────────────────────────────────────────────
  const ExtractSchema = z.object({
    hasDestination: z.boolean(),
    destination: z.string(), // '' when hasDestination is false
    quote: z.string(), // '' when hasDestination is false — must be verbatim from the source
    confidence: z.enum(['stated', 'implied', 'none']),
  })

  async function extractDestination(name: string, niche: string) {
    const r = await llmCall({
      templateVersion: 'channel-destination-extract.v0-probe',
      schema: ExtractSchema,
      system: `You read a creator's channel description and extract the channel's DESTINATION if — and only if — the creator put one there.

A destination is where every episode is meant to leave the VIEWER: what they believe, feel, or do differently afterwards. It is not the subject matter, not the format, not the tone, and not the brand personality.

ABSTAIN by default. Most descriptions say what a channel is ABOUT and never say what it is FOR; for those the honest answer is hasDestination:false. Inventing a plausible destination is the worst possible failure here — a wrong destination would silently steer every future story on the channel. Only return one when you can quote the exact words in the description that carry it.`,
      messages: [
        {
          role: 'user',
          content: `CHANNEL: ${name}

DESCRIPTION:
${niche}

OUTPUT (JSON only):
{
  "hasDestination": true only if the description genuinely states or clearly implies where episodes leave the viewer,
  "destination": "one sentence, in the creator's own terms, naming what the viewer believes/feels/does differently afterwards — '' if hasDestination is false",
  "quote": "the exact words from the DESCRIPTION above that carry it, copied character-for-character — '' if hasDestination is false",
  "confidence": "stated" | "implied" | "none"
}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 500,
    })
    totalCost += r.costCents
    return r.data
  }

  // Bare inputs — subject-only descriptions with no purpose language anywhere. Any destination
  // returned for these is fabricated by definition.
  const BARE_INPUTS: { name: string; niche: string }[] = [
    { name: 'Night Shift', niche: 'Scary stories. Filipino horror, ghost sightings, aswang, haunted places. New reel every night.' },
    { name: 'Plate Notes', niche: 'Quick Filipino recipes and street food finds around Metro Manila. 60-second cooking reels, budget meals, market hauls.' },
    { name: 'Ledger', niche: 'Personal finance explainers for young professionals — investing, taxes, budgeting, insurance, credit cards.' },
    { name: 'Offcuts', niche: 'Short comedy skits about office life. Meetings, bosses, deadlines, coworkers.' },
  ]

  // ── Run ───────────────────────────────────────────────────────────────────────────────────────
  const out: Record<string, unknown> = { runs: RUNS, destination: DESTINATION }

  if (PHASE.includes('A')) {
    console.log(`\n=== PHASE A — does a channel destination steer the planner? (n=${RUNS} per cell) ===\n`)
    const cells: Cell[] = []
    for (const [key, niche, slot] of [
      ['BARE/CONTROL', NICHE_BARE, false],
      ['BARE/DEST', NICHE_BARE, true],
      ['RICH/CONTROL', NICHE_RICH, false],
      ['RICH/DEST', NICHE_RICH, true],
    ] as [string, string, boolean][]) {
      cells.push(await runCell(key, niche, slot))
    }

    console.log(`\n--- adherence (0-2 per plan, ${RUNS * 2} available) + variety ---\n`)
    const summary: Record<string, unknown> = {}
    for (const c of cells) {
      const total = c.scores.reduce((s, x) => s + x.score, 0)
      const v = variety(c.plans)
      const same = await judgeSameness(c.plans)
      summary[c.key] = { adherence: total, of: RUNS * 2, scores: c.scores.map((s) => s.score), variety: v, sameness: same }
      console.log(
        `${c.key.padEnd(14)} adherence ${String(total).padStart(2)}/${RUNS * 2}  [${c.scores.map((s) => s.score).join(',')}]  ` +
          `distinct structure/setting/turn ${v.structure}/${v.setting}/${v.turn}  repeatedTriples ${v.repeatedTriples}  ` +
          `sameness ${same.verdict} (${same.distinctIdeas}/${RUNS} distinct)`,
      )
    }

    const get = (k: string) => summary[k] as { adherence: number; variety: ReturnType<typeof variety> }
    const bc = get('BARE/CONTROL')
    const bd = get('BARE/DEST')
    const rc = get('RICH/CONTROL')
    const rd = get('RICH/DEST')
    const a1 = bd.adherence - bc.adherence >= 3
    const a2 =
      bd.variety.structure >= bc.variety.structure - 1 &&
      bd.variety.setting >= bc.variety.setting - 1 &&
      bd.variety.turn >= bc.variety.turn - 1 &&
      bd.variety.repeatedTriples <= bc.variety.repeatedTriples + 1
    const a3 = rc.adherence >= Math.ceil(RUNS * 2 * 0.8)
    console.log(`\nPRE-REGISTERED VERDICTS`)
    console.log(`  A1 EFFECT   (BARE/DEST − BARE/CONTROL ≥ 3): ${bd.adherence} − ${bc.adherence} = ${bd.adherence - bc.adherence} → ${a1 ? 'PASS' : 'FAIL'}`)
    console.log(`  A2 VARIETY  (no collapse vs BARE/CONTROL):  ${a2 ? 'PASS' : 'FAIL'}`)
    console.log(`  A3 REDUNDANT(RICH/CONTROL ≥ ${Math.ceil(RUNS * 2 * 0.8)}/${RUNS * 2}):        ${rc.adherence} → ${a3 ? 'YES — prose already does it' : 'no'}`)
    console.log(`  (RICH/DEST for reference: ${rd.adherence}/${RUNS * 2})`)
    out['phaseA'] = { summary, cells: cells.map((c) => ({ key: c.key, plans: c.plans, scores: c.scores })), verdicts: { a1, a2, a3 } }
  }

  if (PHASE.includes('B')) {
    console.log(`\n=== PHASE B — can a destination be extracted from what creators already write? ===\n`)
    const { getDb, channels } = await import('@reels/db')
    const rows = await getDb().select().from(channels)
    const real = rows.map((c) => ({ name: c.name, niche: c.nicheDescription }))
    const results: Record<string, unknown>[] = []
    for (const input of [...real, ...BARE_INPUTS]) {
      const r = await extractDestination(input.name, input.niche)
      // The honesty check: the quote must literally appear in the source. Whitespace-normalised only.
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
      const grounded = r.hasDestination ? norm(input.niche).includes(norm(r.quote)) && r.quote.trim().length > 0 : true
      const isBare = BARE_INPUTS.some((b) => b.name === input.name)
      results.push({ name: input.name, isBare, ...r, grounded })
      console.log(
        `${input.name.padEnd(20)} ${isBare ? 'BARE' : 'REAL'}  ${r.hasDestination ? `FOUND (${r.confidence})` : 'ABSTAIN'}  quoteGrounded=${grounded}`,
      )
      if (r.hasDestination) {
        console.log(`    destination: ${r.destination}`)
        console.log(`    quote:       "${r.quote}"${grounded ? '' : '   ← NOT IN SOURCE TEXT'}`)
      }
    }
    const bareFound = results.filter((r) => r.isBare && r.hasDestination).length
    const ungrounded = results.filter((r) => !r.grounded).length
    console.log(`\nPRE-REGISTERED VERDICTS`)
    console.log(`  B1 NO INVENTION (0 of ${BARE_INPUTS.length} bare inputs yield a destination): ${bareFound} invented → ${bareFound === 0 ? 'PASS' : 'FAIL'}`)
    console.log(`  B2 GROUNDED     (every quote is a literal substring):                ${ungrounded} ungrounded → ${ungrounded === 0 ? 'PASS' : 'FAIL'}`)
    out['phaseB'] = { results, verdicts: { b1: bareFound === 0, b2: ungrounded === 0 } }
  }

  const file = `probe-destination-${PHASE.toLowerCase()}.json`
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`\nfull output → apps/worker/${file}`)
  console.log(`TOTAL COST: ${(totalCost / 100).toFixed(2)} USD (${totalCost.toFixed(2)}¢)`)
  process.exit(0)
})()
