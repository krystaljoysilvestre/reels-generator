// Turn-landing pass demo (2026-07-20). Isolates ONE variable: the turn-landing pass. Both arms share
// the SAME agentic (plan-doctored) plan AND the SAME base narration (writer→editor→naturalizer, run
// once); the only difference is whether the turn-landing pass runs on it.
//   WITHOUT = the base narration (what production produces today with the plan gate on).
//   WITH    = base → turn-landing pass (judge whether the pivotal beat is dramatized; if COLLAPSED,
//             force a targeted rewrite of just that beat, ≤2 iterations).
// Both arms are gated once so you can see if the pass flips a collapsed-turn FAIL → PASS (the RUN 2
// scenario from probe-plan-force.ts). Reuses the SHIPPED core prompts (story-plan-critic/-doctor.v1).
//
// Usage: pnpm --filter worker exec tsx scripts/probe-turn-landing.ts   (cwd apps/worker; PROBE_RUNS=3 default)
// Cost: ~$1 for 3 drama runs. No DB writes.
import '../src/env.js'
import { z } from 'zod'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    STORY_PLANNER_V1_VERSION,
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
    defaultTasteRubric,
    defaultAudienceDescriptor,
    buildStoryPlanCriticPrompt,
    PlanCriticSchema,
    STORY_PLAN_CRITIC_V1_VERSION,
    buildStoryPlanDoctorPrompt,
    PlanDoctorSchema,
    STORY_PLAN_DOCTOR_V1_VERSION,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')
  const { resolvePeak } = await import('../src/pipeline/steps/generate-story.js')
  type StoryPlan = z.infer<typeof StoryPlanSchema>

  // Drama config — SOURCE OF TRUTH: probe-plan-force.ts / probe-genre-lab.ts LAB.drama. Keep in sync.
  const DRAMA_FEWSHOT = `--- REFERENCE STORY 1 (the debt of the sacrificing eldest · a CHOICE among the living · irony/bittersweet) ---
Title: "Ate ka, ikaw na bahala."
Alas-dose na, gising pa rin ako. Bukas ang enrollment ng bunso.
Nasa lamesa 'yung naka-tape na brown envelope. Tatlong taon ko nang dinadagdagan — review fee, para makapag-board exam na rin ako balang-araw.
Kanina, tinapik lang ako ni Mama. "Ate ka. Ikaw na bahala sa tuition." Ngiting-ngiti.
Kaya heto ako, tinititigan 'yung pera na kapag inabot ko, wala nang matitira sa akin.
Pero ngayong gabi — ayaw kong galawin.
Kinatok ko 'yung pinto ni Mama. "Ma. Ngayong taon, hindi ko kaya."
Hindi siya nagalit. "Sige," sabi niya. Tapos sinara 'yung pinto.
Kinabukasan, nakahanap din sila ng pang-enroll. Hindi na sa akin. Wala nang tumapik sa balikat ko.
Iba pala 'yung katahimikan kapag hindi ka na kailangan.

--- REFERENCE STORY 2 (pride inside a living marriage · a CHOICE: he lets the flaw win · tragic) ---
Title: Nag-promote si misis. Ako, hindi.
Anim na taon kaming nag-apply ni Len sa parehong posisyon. Siya 'yung tinanggap.
Nung gabi ng celebration niya, nagtagal ako sa banyo. Pinilit ngumiti sa salamin.
Palabas na sana ako. Tapos narinig ko siya sa kabila — tumatawa, 'yung tawa na dati parang sa'kin lang.
Hindi ako lumabas. Nag-text na lang: "Uuwi muna ako, masama pakiramdam ko."
Kinabukasan, ngiti pa rin siya. "Okay ka na?" Hindi niya alam.
'Yung mahirap: tinitingnan ko siyang masaya, at hindi ko na maalala kung kailan huli akong natuwa para sa kanya nang totoo.

--- REFERENCE STORY 3 (estrangement between a father and a grown child · a CHOICE: he crosses the distance · redemption, paid for) ---
Title: Sundo.
Limang taon kaming hindi nag-uusap ni Papa. Simula nung nabuntis ako, hindi kasal.
Pero pagdilat ko, nandun siya sa may pinto. Hawak 'yung lumang thermos — 'yung dinadala niya dati pag may exam ako.
"Pinagtimplahan kita ng lugaw," sabi niya. Yun lang.
Hindi siya humingi ng tawad. Hindi rin ako.
Iniabot ko sa kanya 'yung apo niya. Kinuha niya — kinakabahan, parang baguhan ulit.
Limang taon. Hindi na mababawi. Pero nung araw na 'yon, hindi na kami mag-isa ng anak ko.`

  const ch = {
    name: 'Hindi Ko Nasabi',
    niche:
      'Filipino drama — ordinary people forced into hard, human choices: family, marriage, money, pride, love, and the debts we owe each other; told first-person',
    hookHint: 'an emotional hook in the first 2s — a line that makes you stay',
    fewshot: DRAMA_FEWSHOT,
  }
  const GENRE = 'drama'
  const lang = 'taglish'
  const aud = defaultAudienceDescriptor(lang)
  const PH_BIBLE = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  const tone = JSON.stringify({ intensity: 7, warmth: 5, energy: 5, pacing: 5, humor: 3 })
  const RUN = { targetSeconds: 75, targetWords: 190, writerTokens: 4096 }
  const N = process.env.PROBE_RUNS ? Math.max(1, Math.min(8, parseInt(process.env.PROBE_RUNS, 10))) : 3
  const MAX_REPAIRS = 2
  let totalCost = 0
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length

  // ── Plan: planner → plan-gate → doctor (agentic plan), reusing the SHIPPED core prompts ──────────
  const makePlan = async (i: number): Promise<StoryPlan> => {
    const angle = selectAngles(1, i * 3 + 1)[0]!
    const p = buildStoryPlannerPrompt({
      channelName: ch.name, nicheDescription: ch.niche, toneConfig: tone, worldBibleJson: PH_BIBLE,
      genreCategory: GENRE, targetSeconds: RUN.targetSeconds, angleDirective: angle.directive,
      avoidList: '', rejectionAvoidList: '', regenerationNonce: i,
    })
    const res = await llmCall({ templateVersion: STORY_PLANNER_V1_VERSION, schema: StoryPlanSchema, system: p.system, messages: [{ role: 'user', content: p.userMessage }], temperature: 1.0, maxTokens: 1500 })
    totalCost += res.costCents
    return res.data
  }
  const judgePlan = async (plan: StoryPlan) => {
    const { system, userMessage } = buildStoryPlanCriticPrompt({ channelName: ch.name, nicheDescription: ch.niche, plan })
    const res = await llmCall({ templateVersion: STORY_PLAN_CRITIC_V1_VERSION, schema: PlanCriticSchema, system, messages: [{ role: 'user', content: userMessage }], provider: 'anthropic', maxTokens: 2048 })
    totalCost += res.costCents
    const d = res.data
    return { pass: d.pass && d.decision.pass && d.chain.pass && d.causedEnding.pass, reason: d.reason }
  }
  const doctorPlan = async (plan: StoryPlan, reason: string): Promise<StoryPlan> => {
    const { system, userMessage } = buildStoryPlanDoctorPrompt({ channelName: ch.name, nicheDescription: ch.niche, targetSeconds: RUN.targetSeconds, plan, reason })
    const res = await llmCall({ templateVersion: STORY_PLAN_DOCTOR_V1_VERSION, schema: PlanDoctorSchema, system, messages: [{ role: 'user', content: userMessage }], provider: 'anthropic', temperature: 0.7, maxTokens: 1200 })
    totalCost += res.costCents
    return { ...plan, ...res.data }
  }
  const agenticPlan = async (i: number): Promise<StoryPlan> => {
    let plan = await makePlan(i)
    let v = await judgePlan(plan)
    let n = 0
    while (!v.pass && n < MAX_REPAIRS) { n++; plan = await doctorPlan(plan, v.reason); v = await judgePlan(plan) }
    return plan
  }

  // ── Base chain (writer → editor → naturalizer), mirrors production tolerances ─────────────────────
  const runChain = async (plan: StoryPlan) => {
    const wp = buildStoryWriterPrompt({
      channelName: ch.name, nicheDescription: ch.niche, toneConfig: tone, language: lang, audienceDescriptor: aud,
      worldBibleJson: PH_BIBLE, fewshotStories: ch.fewshot, targetSeconds: RUN.targetSeconds, targetWords: RUN.targetWords,
      genreCategory: GENRE,
      plan: { premise: plan.premise, conflict: plan.conflict, escalation: plan.escalation, twist: plan.twist, ending: plan.ending, emotionalDestination: plan.emotionalDestination },
      register: plan.elements.register, platformHookHint: ch.hookHint,
    })
    const story = await llmCall({ templateVersion: STORY_V2_VERSION, schema: StoryOutputSchema, system: wp.system, messages: [{ role: 'user', content: wp.userMessage }], provider: 'anthropic', temperature: 1.0, maxTokens: RUN.writerTokens })
    totalCost += story.costCents
    let narration = story.data.narration
    let peakMoment = story.data.peakMoment
    for (const stage of ['editor', 'naturalizer'] as const) {
      try {
        const prompt = stage === 'editor'
          ? buildStoryEditorPrompt({ nicheDescription: ch.niche, genreCategory: GENRE, language: lang, audienceDescriptor: aud, narration, peakMoment, emotionalDestination: plan.emotionalDestination, canonicalNames: [], targetWords: RUN.targetWords })
          : buildStoryNaturalizerPrompt({ language: lang, audienceDescriptor: aud, narration, peakMoment })
        const res = await llmCall({ templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION, schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema, system: prompt.system, messages: [{ role: 'user', content: prompt.userMessage }], ...(stage === 'naturalizer' ? { provider: 'anthropic' as const } : {}), temperature: 0.7, maxTokens: RUN.writerTokens })
        totalCost += res.costCents
        const tol = stage === 'editor' ? 0.25 : 0.15
        const dw = Math.abs(wordCount(res.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        const keptPeak = resolvePeak(res.data.narration, [res.data.peakMoment, peakMoment])
        const inL = beatLines(narration), outL = beatLines(res.data.narration)
        if (dw <= tol && keptPeak && !(inL >= 4 && outL <= Math.ceil(inL / 2))) { narration = res.data.narration; peakMoment = keptPeak }
      } catch { /* pass text through */ }
    }
    return { title: story.data.title, logline: story.data.logline, narration, peakMoment }
  }

  const gateOnce = async (title: string, logline: string, narration: string) => {
    const gp = buildStoryGatePrompt({ channelName: ch.name, nicheDescription: ch.niche, language: lang, tasteRubric: defaultTasteRubric(GENRE, ch.niche), narration, title, logline })
    const gr = await llmCall({ templateVersion: STORY_CRITIC_V2_VERSION, schema: StoryGateSchema, system: gp.system, messages: [{ role: 'user', content: gp.userMessage }], provider: 'anthropic', maxTokens: 512 })
    totalCost += gr.costCents
    return gr.data
  }

  // ── THE TURN-LANDING PASS (the thing being built) ─────────────────────────────────────────────────
  // judge: is the pivotal beat dramatized or collapsed?  force: rewrite ONLY that beat to land it.
  const TurnJudgeSchema = z.object({
    turn: z.string(),      // the pivotal beat, named in a phrase
    landed: z.boolean(),   // is it dramatized as a concrete, felt moment?
    problem: z.string(),   // if collapsed: how (summary/announced/glossed) + which line; '' if landed
  })
  const turnJudge = async (narration: string) => {
    const res = await llmCall({
      templateVersion: 'turn-landing-judge.v0-probe',
      schema: TurnJudgeSchema,
      system: `You judge ONE thing about this first-person short ${lang} drama: is the PIVOTAL TURN dramatized, or collapsed?
The turn is the single beat the whole story rides on — the decision, reversal, confession, or revelation that EARNS the ending.
1) Name the turn in a short phrase.
2) landed=true ONLY if a first-time listener (who hears it once) FEELS that beat: a concrete action, the actual words if someone speaks, a physical/sensory detail, and the beat given room — not rushed past.
   landed=false if the turn is COLLAPSED — summarized ("sinabi niya, and it wasn't what I feared"), announced ("napagtanto ko na…", "tapos wala"), or glossed in one abstract sentence.
3) If landed=false, "problem" = one sentence naming exactly HOW it's collapsed and WHICH line.
Judge ONLY the turn beat. Do NOT fail warm, plain feeling elsewhere; do NOT demand melodrama.`,
      messages: [{ role: 'user', content: `NARRATION:\n${narration}\n\nOUTPUT (JSON only):\n{ "turn": "", "landed": false, "problem": "" }` }],
      provider: 'anthropic',
      maxTokens: 512,
    })
    totalCost += res.costCents
    return res.data
  }
  const turnForce = async (narration: string, turn: string, problem: string) => {
    const res = await llmCall({
      templateVersion: 'turn-landing-force.v0-probe',
      schema: z.object({ narration: z.string().min(1) }),
      system: `You are a line editor for first-person ${lang} drama. The narration's PIVOTAL TURN is collapsed; dramatize JUST that beat.
THE TURN: ${turn}
THE PROBLEM: ${problem}
Rules:
- Rewrite ONLY the collapsed beat (plus the minimum lines around it needed to make it land). Keep the rest of the narration.
- Keep the plot, the protagonist's choice, and the ending EXACTLY. Add no new events.
- SHOW the moment: concrete action, the actual words spoken if someone speaks, a physical/sensory detail, room to land — WITHOUT announcing the feeling or stating a moral.
- Do NOT change any proper noun, name, or concrete object. Same voice and language.
Return the full narration.`,
      messages: [{ role: 'user', content: `NARRATION:\n${narration}\n\nReturn JSON: { "narration": "..." }` }],
      provider: 'anthropic',
      temperature: 0.7,
      maxTokens: RUN.writerTokens,
    })
    totalCost += res.costCents
    return res.data.narration
  }
  const turnLandingPass = async (narration: string) => {
    const verdicts: Array<{ landed: boolean; turn: string; problem: string }> = []
    let current = narration
    let v = await turnJudge(current)
    verdicts.push(v)
    let applied = 0
    while (!v.landed && applied < MAX_REPAIRS) {
      applied++
      const rewritten = await turnForce(current, v.turn, v.problem)
      // Guard: dramatizing legitimately adds words, but reject a runaway rewrite (keep prior text).
      const dw = Math.abs(wordCount(rewritten) - wordCount(current)) / Math.max(1, wordCount(current))
      if (dw > 0.6) { verdicts.push({ landed: false, turn: v.turn, problem: `rewrite rejected (Δwords ${Math.round(dw * 100)}%)` }); break }
      current = rewritten
      v = await turnJudge(current)
      verdicts.push(v)
    }
    return { narration: current, changed: current !== narration, verdicts }
  }

  // ── Main: same base, with vs without the turn-landing pass ────────────────────────────────────────
  console.log(`⚗ turn-landing demo — drama, short form, ${N} run(s)`)
  for (let i = 0; i < N; i++) {
    try {
      const plan = await agenticPlan(i)
      const base = await runChain(plan) // shared base for both arms
      const gateWithout = await gateOnce(base.title, base.logline, base.narration)
      const landed = await turnLandingPass(base.narration)
      const gateWith = landed.changed ? await gateOnce(base.title, base.logline, landed.narration) : gateWithout

      console.log(`\n${'═'.repeat(76)}`)
      console.log(`[RUN ${i + 1}/${N}] "${base.title}"`)
      const tv = landed.verdicts[0]!
      console.log(`  TURN JUDGE: turn = ${tv.turn}`)
      console.log(`  base turn landed? ${tv.landed ? 'YES' : 'NO'}${tv.landed ? '' : ` — ${tv.problem}`}`)
      console.log(`  turn-landing pass applied? ${landed.changed ? `YES (${landed.verdicts.length - 1} rewrite(s))` : 'no (turn already landed)'}`)
      console.log(`  GATE without: ${gateWithout.pass ? 'PASS' : 'FAIL'}${gateWithout.pass ? '' : ` — ${gateWithout.reason}`}`)
      console.log(`  GATE with:    ${gateWith.pass ? 'PASS' : 'FAIL'}${gateWith.pass ? '' : ` — ${gateWith.reason}`}`)
      console.log(`${'─'.repeat(76)}\n[WITHOUT turn-landing]\n${base.narration}`)
      if (landed.changed) console.log(`${'─'.repeat(76)}\n[WITH turn-landing]\n${landed.narration}`)
      else console.log(`${'─'.repeat(76)}\n[WITH turn-landing] — identical (the pass found the turn already landed)`)
    } catch (err) {
      console.log(`\n[RUN ${i + 1}/${N}] FAILED: ${String(err).slice(0, 200)}`)
    }
  }
  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
