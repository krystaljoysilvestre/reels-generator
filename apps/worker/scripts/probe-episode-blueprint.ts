// Episode-blueprint probe (2026-08-07) — W5's gate in the compile-creator-intent plan.
//
// A creator's channel idea often contains an EPISODE FORMAT ("1. Hook 2. Introduce 3. Tell the legend
// 4. Origins 5. Competing theories 6. Open ending"). Today it survives only as free text and nothing
// honours it. W5 asks: can we make it real, and WHERE.
//
// THIS PROBE EXISTS BECAUSE THE OBVIOUS ANSWER IS PROBABLY WRONG. "Put the blueprint in the planner
// prompt and let it follow loosely" is structurally the SAME intervention as the channel-destination
// probe run earlier today, which moved output by +0. It also collides with an explicit existing rule:
// the planner's VARIETY RULE requires each idea to differ from recent ones on `structure`.
//
// But a blueprint differs from a destination in one way that might matter: it is CHECKABLE. You can
// verify a script hits six beats in order; you cannot verify "wonder". Checkable belongs at the GATE —
// the one mechanism in this codebase that has consistently held.
//
// THREE ARMS, same channel, same angle seeds, n per arm:
//   control  — production prompt, blueprint nowhere. Establishes how much structure appears for free.
//   planner  — blueprint injected as planner guidance (the intuitive build).
//   gate     — blueprint compiled into an editorial principle (W1's real, shipped mechanism) and
//              enforced at the story gate, with production's steered rewrite on a fail.
//
// PRE-REGISTERED CRITERIA (written before the run; the judges have ~8% test-retest noise, so the
// margins below are deliberately sized past a 1-item difference):
//   B1. An arm SHIPS only if beatsHit beats control by ≥ 1.0 beats/story averaged over n.
//   B2. VETO — variety must not collapse: distinct `structure` labels in an arm must be ≥ control − 1.
//       An adherence win bought with sameness is a negative result. Every channel would then tell the
//       same-shaped story forever, which is the failure mode this codebase has fought hardest.
//   B3. If BOTH planner and gate pass B1, prefer GATE: it needs no new enforcement machinery (the
//       blueprint compiles into W1's principles) and it keeps the planner free to vary structure.
//   FALSIFICATION: neither arm clears B1 ⇒ episodeBlueprint does not earn a slot. Record the negative
//   result next to the destination one and leave episode format as free text.
//
// Adherence is scored by an auditor that must QUOTE the sentence serving each beat, and must mark a
// beat missing rather than stretch a quote to fit — the same discipline that kept the principles probe
// honest. Beats out of order count as hit but are reported, since order is the weaker claim.
//
// Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-episode-blueprint.ts          # n=4 per arm (~$1.50)
//   BP_RUNS=2 pnpm exec tsx scripts/probe-episode-blueprint.ts
//   BP_ARMS=control,gate pnpm exec tsx scripts/probe-episode-blueprint.ts
// Cost: ~$1.50 at n=4 (12 full planner→writer→editor→naturalizer chains + gate + audits). The plan's
// ~40¢ estimate assumed planner-only; measuring whether a SCRIPT hits its beats needs the real script.
import '../src/env.js'
import { z } from 'zod'
import { writeFileSync } from 'node:fs'
import type { StoryElements } from '../src/prompts-bridge.js'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    buildStoryWriterPrompt,
    STORY_V2_VERSION,
    buildStoryEditorPrompt,
    StoryEditSchema,
    STORY_EDITOR_V1_VERSION,
    buildStoryNaturalizerPrompt,
    StoryNaturalizeSchema,
    STORY_NATURALIZER_V1_VERSION,
    buildStoryGatePrompt,
    StoryGateSchema,
    STORY_CRITIC_V2_VERSION,
    STORY_PLANNER_V1_VERSION,
    composeTasteRubric,
    defaultAudienceDescriptor,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')

  const RUNS = Number(process.env['BP_RUNS'] ?? 4)
  const ARMS = (process.env['BP_ARMS'] ?? 'control,planner,gate').split(',').map((s) => s.trim())
  let cost = 0

  // Lihim ng Nayon — the channel whose idea actually contains a format. Short-form (75s) keeps token
  // cost sane; the blueprint question is about SHAPE, which a 75s script exercises as well as a long one.
  const CH = {
    name: 'Lihim ng Nayon',
    niche:
      'Cinematic documentary storytelling about Philippine folklore, urban legends, mythical creatures, haunted places and historical mysteries. Every episode explores a legend that shaped Filipino culture and asks what if there is some truth behind it. The tone is mysterious, respectful and thought-provoking — a storyteller uncovering forgotten history, never someone trying to scare the audience.',
    genreCategory: 'horror',
    narrativeStyle: 'folk',
    toneConfig: JSON.stringify({ intensity: 8, warmth: 5, energy: 4, pacing: 6, humor: 1 }),
    worldBibleJson: JSON.stringify({ region: 'the Philippine countryside', era: 'contemporary, with a colonial past', canonLocations: [], canonObjects: [], vocabulary: {} }, null, 2),
    targetSeconds: 75,
    language: 'english',
  }

  // The creator's own six-step format, verbatim in intent.
  const BLUEPRINT = [
    'Hook with an intriguing question or local belief',
    'Introduce the place, creature, or legend',
    'Tell the story using immersive narration',
    'Explore its historical or cultural origins',
    'Present different theories without claiming certainty',
    'End by inviting viewers to decide what they believe',
  ]

  // ARM: planner — soft guidance, the intuitive build. Spliced where a shipped version would live.
  const plannerBlock = `
THE CHANNEL'S EPISODE FORMAT — every episode on this channel moves through these beats, in this order:
${BLUEPRINT.map((b, i) => `${i + 1}. ${b}`).join('\n')}
Plan an idea that can be told in exactly this shape. The premise, setting and turn are still yours to invent and must still differ from what came before — the format is the vessel, not the story.
`
  // ARM: gate — the blueprint compiled into an editorial principle, exactly as W1 ships them.
  const gatePrinciples = `ALWAYS\n${BLUEPRINT.map((b) => `- ${b.charAt(0).toUpperCase() + b.slice(1)}.`).join('\n')}\n- Move through those beats in that order.`

  const AuditSchema = z.object({
    beats: z.array(z.object({ beat: z.string(), hit: z.boolean(), quote: z.string(), position: z.number().int() })),
  })

  async function audit(narration: string) {
    const r = await llmCall({
      templateVersion: 'blueprint-audit.v0-probe',
      schema: AuditSchema,
      provider: 'anthropic',
      system: `You check whether a short narration performs specific story beats. Be literal and strict: a beat is HIT only if a specific sentence actually does it. Do not credit a beat because the script is "about" the right thing, and never stretch a quote to fit — mark it missing instead. You do not know how this script was produced.`,
      messages: [
        {
          role: 'user',
          content: `BEATS:\n${BLUEPRINT.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\nNARRATION:\n${narration}\n\nFor each beat: is it performed? Quote the sentence that does it (verbatim, '' if missing) and give its 1-based sentence position in the narration (0 if missing).\n\nOUTPUT (JSON only): { "beats": [ { "beat": "the beat text", "hit": bool, "quote": "", "position": 0 } ] }`,
        },
      ],
      temperature: 0.1,
      maxTokens: 1500,
    })
    cost += r.costCents
    return r.data
  }

  interface Row { arm: string; i: number; narration: string; title: string; structure: string; beatsHit: number; inOrder: boolean; gatePassed: boolean | null }
  const rows: Row[] = []

  for (const arm of ARMS) {
    const recentLoglines: string[] = []
    const recentEls: StoryElements[] = []
    for (let i = 0; i < RUNS; i++) {
      const angle = selectAngles(1, i)[0]!
      const built = buildStoryPlannerPrompt({
        channelName: CH.name,
        nicheDescription: CH.niche,
        toneConfig: CH.toneConfig,
        worldBibleJson: CH.worldBibleJson,
        genreCategory: CH.genreCategory,
        narrativeStyle: CH.narrativeStyle,
        styleInfluence: 'medium',
        targetSeconds: CH.targetSeconds,
        angleDirective: angle.directive,
        avoidList: recentLoglines.join('\n'),
        rejectionAvoidList: '',
        regenerationNonce: i,
        recentElements: recentEls,
      })
      const anchor = '\n\nYou do not write prose.'
      const plannerSystem =
        arm === 'planner' && built.system.includes(anchor)
          ? built.system.replace(anchor, `\n${plannerBlock}\nYou do not write prose.`)
          : built.system

      const plan = await llmCall({
        templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema, system: plannerSystem,
        messages: [{ role: 'user', content: built.userMessage }], temperature: 1.0, maxTokens: 1500,
      })
      cost += plan.costCents
      recentEls.push(plan.data.elements)
      recentLoglines.push(plan.data.logline)

      // Writer → editor → naturalizer. qaFeedback carries the gate's steer on a rewrite, exactly as
      // production does — that steered rewrite IS the gate arm's mechanism, so it must be real here.
      const runChain = async (qaFeedback?: string) => {
        const wp = buildStoryWriterPrompt({
          channelName: CH.name, nicheDescription: CH.niche, toneConfig: CH.toneConfig, language: CH.language,
          audienceDescriptor: defaultAudienceDescriptor(CH.language), worldBibleJson: CH.worldBibleJson,
          fewshotStories: '', targetSeconds: CH.targetSeconds, targetWords: Math.round(CH.targetSeconds * 2.5),
          genreCategory: CH.genreCategory, narrativeStyle: CH.narrativeStyle, styleInfluence: 'medium',
          plan: plan.data, rejectionAvoidList: '', ...(qaFeedback ? { qaFeedback } : {}),
        } as never)
        const story = await llmCall({
          templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system: wp.system,
          messages: [{ role: 'user', content: wp.userMessage }], temperature: 1.0, maxTokens: 2200,
        })
        cost += story.costCents
        let narration = story.data.narration
        for (const stage of ['editor', 'naturalizer'] as const) {
          try {
            const p = stage === 'editor'
              ? buildStoryEditorPrompt({ narration, language: CH.language, nicheDescription: CH.niche, genreCategory: CH.genreCategory, targetWords: Math.round(CH.targetSeconds * 2.5) } as never)
              : buildStoryNaturalizerPrompt({ narration, language: CH.language, audienceDescriptor: defaultAudienceDescriptor(CH.language) } as never)
            const r = await llmCall({
              templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION,
              schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema,
              system: p.system, messages: [{ role: 'user', content: p.userMessage }], temperature: 0.8, maxTokens: 2200,
            })
            cost += r.costCents
            const next = (r.data as { narration?: string }).narration?.trim()
            if (next && next.length > narration.length * 0.6) narration = next // production's discard guard
          } catch { /* a failed polish stage keeps the previous text, as in production */ }
        }
        return { narration, title: story.data.title, logline: plan.data.logline }
      }

      let out = await runChain()
      let gatePassed: boolean | null = null

      if (arm === 'gate') {
        // The blueprint rides as an editorial principle on the REAL gate, composed the way W1 composes it.
        const rubric = composeTasteRubric({ editorialPrinciples: gatePrinciples, genreCategory: CH.genreCategory, niche: CH.niche })
        const gp = buildStoryGatePrompt({ channelName: CH.name, nicheDescription: CH.niche, language: CH.language, tasteRubric: rubric, narration: out.narration, title: out.title, logline: out.logline })
        const verdict = await llmCall({
          templateVersion: STORY_CRITIC_V2_VERSION, schema: StoryGateSchema, system: gp.system,
          messages: [{ role: 'user', content: gp.userMessage }], temperature: 0.3, maxTokens: 900,
        })
        cost += verdict.costCents
        gatePassed = verdict.data.pass
        // Production's ONE steered rewrite, including its rewriteCanFix skip: an idea-level failure
        // re-runs the whole chain to fail again, so the pipeline doesn't try. Honouring that here keeps
        // the gate arm honest — otherwise it would get a free retry production would never grant.
        if (!gatePassed && verdict.data.rewriteCanFix !== false) {
          out = await runChain(verdict.data.reason)
        }
      }

      const a = await audit(out.narration)
      const hits = a.beats.filter((b) => b.hit)
      const positions = hits.map((b) => b.position)
      const inOrder = positions.every((p, k) => k === 0 || p >= positions[k - 1]!)
      rows.push({ arm, i, narration: out.narration, title: out.title, structure: plan.data.elements.structure ?? '', beatsHit: hits.length, inOrder, gatePassed })
      console.log(`  [${arm}] ${i + 1}/${RUNS} — ${hits.length}/${BLUEPRINT.length} beats${inOrder ? ' (in order)' : ''}${gatePassed === false ? ' [gate failed → rewritten]' : ''}  ${out.title}`)
    }
  }

  // ── Results ─────────────────────────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}`)
  const stat = (arm: string) => {
    const r = rows.filter((x) => x.arm === arm)
    const mean = r.reduce((s, x) => s + x.beatsHit, 0) / (r.length || 1)
    return { mean, ordered: r.filter((x) => x.inOrder).length, structures: new Set(r.map((x) => x.structure.toLowerCase().trim()).filter(Boolean)).size, n: r.length }
  }
  for (const arm of ARMS) {
    const s = stat(arm)
    console.log(`${arm.padEnd(8)} beats ${s.mean.toFixed(2)}/${BLUEPRINT.length}  in-order ${s.ordered}/${s.n}  distinct structures ${s.structures}/${s.n}`)
  }
  const c = stat('control')
  console.log(`\nPRE-REGISTERED VERDICTS (vs control ${c.mean.toFixed(2)} beats, ${c.structures} distinct structures)`)
  for (const arm of ARMS.filter((a) => a !== 'control')) {
    const s = stat(arm)
    const b1 = s.mean - c.mean >= 1.0
    const b2 = s.structures >= c.structures - 1
    console.log(`  ${arm.padEnd(8)} B1 adherence +${(s.mean - c.mean).toFixed(2)} → ${b1 ? 'PASS' : 'FAIL'}   B2 variety ${s.structures} vs ${c.structures} → ${b2 ? 'PASS' : 'FAIL (veto)'}   ⇒ ${b1 && b2 ? 'SHIPS' : 'does not ship'}`)
  }
  writeFileSync('probe-blueprint.json', JSON.stringify({ blueprint: BLUEPRINT, rows }, null, 2))
  console.log(`\nfull narrations → apps/worker/probe-blueprint.json`)
  console.log(`TOTAL COST: $${(cost / 100).toFixed(2)}`)
  process.exit(0)
})()
