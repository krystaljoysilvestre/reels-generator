// Plan-level judge-and-force probe (2026-07-20). Tests the lever the line-level prototype pointed at:
// a PLAN GATE that fails structurally-passive plans (no protagonist agency) and FORCES a steered
// re-plan, BEFORE any prose is written. Genre = drama (the confirmed structural-agency case), short
// form, Taglish. Mirrors production studio.v3 (Planner gpt-4o → Writer anthropic → Editor gpt-4o →
// Naturalizer anthropic → gate anthropic) but inserts an INLINE judge between planner and writer.
//
// This is a PROBE, not production. It wires NOTHING into generate-story.ts. The judge prompt stays
// inline ('plan-judge.v0-probe', like evidence-check.v0-probe in probe-genre-lab.ts) until the results
// below earn it a production stage. Per run it runs a PAIRED comparison: full chain from the ORIGINAL
// plan (control = what production does today, no plan judge) AND from the FORCED final plan, each
// gated ONCE (first-attempt — the metric the 60% flip trigger measures; no steered rewrite here).
//
// Usage: pnpm --filter worker exec tsx scripts/probe-plan-force.ts        (cwd apps/worker)
//   PROBE_JUDGE_ONLY=1  → planner → judge → re-plan loop only (no chains/gate) — cheap judge iteration
//   PROBE_RUNS=1        → run only 1 (smoke); default 6
//
// PRE-REGISTERED SUCCESS CRITERIA (written before the run; do not move the goalposts after):
//   1. PRIMARY (gate delta): plan-force first-attempt gate pass ≥ 3/6 AND plan-force − control ≥ 2 runs.
//      (Baseline: the 12/12 fingerprint audit; expected control ≈ 0–1/6.)
//   2. CONVERGENCE: ≥ 4/6 judge-failing plans reach a judge-pass within 3 re-plans (else the judge is
//      unsatisfiable, or this seam can't steer the planner → different lever).
//   3. BLIND READ (owner): forced final scored higher on the agency question in ≥ 4 of the forced pairs.
//   4. GAMING AUDIT (owner): reading the forced plans' judge evidence quotes, no cosmetic decision-verb
//      pass (a "decision" with no restatable alternative + cost).
//   FALSIFICATION: primary missed ⇒ plan-level judge-and-force is not the lever; do NOT wire to
//   production; write up the negative result so it isn't re-proposed.
//
// Cost: full 6-run batch ≈ $1.00–1.70; PROBE_JUDGE_ONLY batch ≈ $0.30–0.50. All calls via llmCall →
// exact usage-based costCents, printed. No DB writes.
import '../src/env.js'
import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StoryElements } from '../src/prompts-bridge.js'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { StoryOutputSchema } = await import('@reels/core')
  const {
    buildStoryPlannerPrompt,
    StoryPlanSchema,
    buildStoryWriterPrompt,
    buildStoryEditorPrompt,
    StoryEditSchema,
    buildStoryNaturalizerPrompt,
    StoryNaturalizeSchema,
    buildStoryGatePrompt,
    StoryGateSchema,
    defaultTasteRubric,
    defaultAudienceDescriptor,
    STORY_PLANNER_V1_VERSION,
    STORY_V2_VERSION,
    STORY_EDITOR_V1_VERSION,
    STORY_NATURALIZER_V1_VERSION,
    STORY_CRITIC_V2_VERSION,
  } = await import('../src/prompts-bridge.js')
  const { selectAngles } = await import('../src/assembly-bridge.js')
  const { resolvePeak } = await import('../src/pipeline/steps/generate-story.js')

  type StoryPlan = z.infer<typeof StoryPlanSchema>

  // ── Drama channel config ─────────────────────────────────────────────────────
  // SOURCE OF TRUTH: copied from probe-genre-lab.ts LAB.drama + DRAMA_FEWSHOT — keep in sync.
  // Drama is the confirmed structural-agency case (want-vs-need collision resolved by a CHOICE among
  // the living, not a truth delivered by an object/dead elder).
  const DRAMA_FEWSHOT = `--- REFERENCE STORY 1 (the debt of the sacrificing eldest · a CHOICE among the living · irony/bittersweet · the gut-punch lands mid-story, the ending is quiet) ---
Title: "Ate ka, ikaw na bahala."
Alas-dose na, gising pa rin ako. Bukas ang enrollment ng bunso.
Nasa lamesa 'yung naka-tape na brown envelope. Tatlong taon ko nang dinadagdagan — review fee, para makapag-board exam na rin ako balang-araw. Galing sa sahod na, akala ng lahat, pang-pamilya lang.
Kanina, tinapik lang ako ni Mama. "Ate ka. Ikaw na bahala sa tuition." Ngiting-ngiti. Parang ang gaan sabihin.
Sampung taong gulang ako nung una kong narinig 'yun. Twenty-nine na ako ngayon.
Kaya heto ako, tinititigan 'yung pera na kapag inabot ko, wala nang matitira sa akin.
Dati, hindi ko na pinag-iisipan. Inaabot ko lang.
Pero ngayong gabi — ayaw kong galawin.
Kinatok ko 'yung pinto ni Mama. "Ma. Ngayong taon, hindi ko kaya."
Hindi siya nagalit. Hindi rin nagulat. Parang matagal na niyang inaantay na sabihin ko 'yon.
"Sige," sabi niya. Tapos sinara 'yung pinto.
Kinabukasan, nakahanap din sila ng pang-enroll. Hindi na sa akin.
Wala nang tumapik sa balikat ko. Wala nang "ate ka."
Iba pala 'yung katahimikan kapag hindi ka na kailangan.
Hawak ko 'yung envelope ko. Buo pa. Akin na talaga.
Pero buong araw, hinihintay ko pa rin 'yung tapik na hindi na dumating.

--- REFERENCE STORY 2 (pride/jealousy inside a living marriage · a CHOICE: he lets the flaw win · tragic) ---
Title: Nag-promote si misis. Ako, hindi.
Anim na taon kaming nag-apply ni Len sa parehong posisyon. Siya 'yung tinanggap.
Masaya ako para sa kanya. Sabi ko sa sarili ko, masaya ako.
Nung gabi ng celebration niya, nagtagal ako sa banyo. Hinugasan ko 'yung mukha ko, pinilit ngumiti sa salamin.
Palabas na sana ako. Tapos narinig ko siya sa kabila — tumatawa, 'yung tawa na dati, parang sa'kin lang.
Hindi ako lumabas.
Nag-text na lang ako: "Uuwi muna ako, masama pakiramdam ko."
Totoo naman. Masama nga.
Kinabukasan, ngiti pa rin siya. "Okay ka na?" Hindi niya alam.
Anim na taong pinagsamahan — kaya ko palang itago sa kanya 'to. Yun pala 'yung madaling parte.
'Yung mahirap: tinitingnan ko siyang masaya, at hindi ko na maalala kung kailan huli akong natuwa para sa kanya nang totoo.

--- REFERENCE STORY 3 (estrangement/pride between a father and a grown child · a CHOICE: he crosses the distance · redemption, paid for) ---
Title: Sundo.
Limang taon kaming hindi nag-uusap ni Papa. Simula nung nabuntis ako, hindi kasal.
Kaya nung nanganak ako, wala akong inaasahan. Ako lang at 'yung anak ko.
Pero pagdilat ko, nandun siya sa may pinto. Hawak 'yung lumang thermos — 'yung dinadala niya dati sa'kin pag may exam ako.
Hindi siya lumapit agad. Parang hindi alam kung pwede pa.
"Pinagtimplahan kita ng lugaw," sabi niya. Yun lang.
Hindi siya humingi ng tawad. Hindi rin ako.
Iniabot ko sa kanya 'yung apo niya. Kinuha niya — kinakabahan, parang baguhan ulit.
Limang taon. Hindi na mababawi.
Pero nung araw na 'yon, hindi na kami mag-isa ng anak ko.`

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
  const RUN = { form: 'short', targetSeconds: 75, targetWords: 190, writerTokens: 4096 }

  const JUDGE_ONLY = process.env.PROBE_JUDGE_ONLY === '1'
  const N = process.env.PROBE_RUNS ? Math.max(1, Math.min(12, parseInt(process.env.PROBE_RUNS, 10))) : 6
  const MAX_REPLANS = 3
  // FORCE MODE — how the judge's failure is turned into a new plan:
  //   'feedback'  (default, production-faithful): the judge's one-sentence reason on the existing
  //               operatorFeedback seam ("operator rejected: <reason>. Re-plan differently.") — a bare
  //               planner RE-ROLL (fresh premise). Found to NOT converge (0/6): the planner re-satisfices.
  //   'directive' (experiment): the same re-roll but with a HARD agency contract injected. Also 0/N.
  //   'doctor'    (the mechanism under test here): a dedicated PLAN-DOCTOR REPAIRS the failing plan in
  //               place — keeps the world/relationships/texture, surgically fixes only the agency — instead
  //               of re-rolling. This is the "with" arm of the without-vs-with demo.
  const FORCE_MODE =
    process.env.PROBE_FORCE_MODE === 'doctor' ? 'doctor' : process.env.PROBE_FORCE_MODE === 'directive' ? 'directive' : 'feedback'
  if (JUDGE_ONLY) console.log('⚗ JUDGE-ONLY mode → planner → judge → re-plan loop only (no chains/gate)')
  console.log(`⚗ ${N} run(s), drama, short form, up to ${MAX_REPLANS} re-plans each · force=${FORCE_MODE}`)

  const AGENCY_DIRECTIVE =
    'Your next plan MUST be built around a PROTAGONIST DECISION and will be rejected again if it is not: ' +
    '(1) the protagonist makes an ACTIVE CHOICE with a live alternative and a real cost they themselves pay; ' +
    '(2) the escalation is CAUSED by that choice and its consequences (therefore/but), not a series of events happening to them; ' +
    '(3) the ending is the DIRECT CONSEQUENCE of their decision — NEVER a reveal, a coincidence, an overheard remark, a resurfacing memory, or another character\'s act. ' +
    'Do NOT write another story where the protagonist watches, endures, remembers, receives a revelation, or is acted upon. Reason it was rejected: '

  // ── Inline PLAN JUDGE ('plan-judge.v0-probe') ────────────────────────────────
  // Judges STRUCTURAL AGENCY at the idea level — before prose exists. Genre-agnostic story physics
  // (the same physics the planner + final gate already assert), never drama-specific tropes.
  const PlanJudgeSchema = z.object({
    pass: z.boolean(),
    decision: z.object({ pass: z.boolean(), evidence: z.string() }),
    chain: z.object({ pass: z.boolean(), evidence: z.string() }),
    causedEnding: z.object({ pass: z.boolean(), evidence: z.string() }),
    reason: z.string().min(1), // one blunt sentence naming the passive mechanism — steers the re-plan
  })
  const judgeSystem = `You are the PLAN GATE for the channel "${ch.name}". Niche: ${ch.niche}.
A planner has committed ONE idea for a lived, first-person story. No prose exists yet — you judge the IDEA.
You answer ONE question: does this plan have STRUCTURAL AGENCY — is the story driven by the protagonist's own costly choices? Yes or no.

Three checks. ALL must hold (pass=true only if all three sub-checks pass):
1. DECISION — the protagonist DECIDES something, with a live alternative and a felt cost: the plan says what choosing costs and what they could have done instead. Realizing, noticing, receiving, discovering, enduring, being told, or a letter/message/reveal arriving are things that happen TO a person — none is a decision.
2. CHAIN — the escalation moves BECAUSE of what the protagonist chooses (therefore / but), each step raising the cost — not a sequence of events happening to a passive witness, and not a single feeling intensifying ("and then... and then").
3. CAUSED ENDING — the ending is the CONSEQUENCE of the protagonist's decision: had they chosen otherwise, the ending would differ. An ending delivered by a reveal, a coincidence, or another character's act regardless of anything the protagonist did, fails. (A reveal may TRIGGER the story; it must not RESOLVE it.)

HOW TO JUDGE — this is the important part:
- Judge STRUCTURE, not vocabulary. The words "decides", "chooses", "refuses" prove nothing by themselves — a plan written to please this judge sprinkles decision verbs over a passive spine, and that plan must FAIL.
- For each check, in "evidence": quote the plan's own clause, THEN restate the act in your own words as a specific could-have-done-otherwise act (e.g. "she hands the envelope over instead of enrolling herself, losing three years of savings"). If you cannot restate it as a specific act with a specific alternative and cost, it is decoration — fail that check.
- When genuinely borderline, FAIL. A borderline decision at plan level becomes no decision in the prose; the writer dilutes agency, never amplifies it.
- You do NOT fix or rewrite the plan. Pass or fail. "reason" is ONE blunt sentence naming the passive mechanism in THIS plan (it steers exactly one re-plan).`

  let totalCost = 0
  const judgePlan = async (plan: StoryPlan) => {
    const view = {
      premise: plan.premise,
      conflict: plan.conflict,
      escalation: plan.escalation,
      twist: plan.twist,
      ending: plan.ending,
      emotionalDestination: plan.emotionalDestination,
      logline: plan.logline,
    }
    const res = await llmCall({
      templateVersion: 'plan-judge.v0-probe',
      schema: PlanJudgeSchema,
      system: judgeSystem,
      messages: [
        {
          role: 'user',
          content: `PLAN:\n${JSON.stringify(view, null, 2)}\n\nKeep each "evidence" to ONE short sentence (≤25 words: a short quote + your restatement) and "reason" to one sentence. OUTPUT (JSON only):\n{ "pass": false, "decision": { "pass": false, "evidence": "" }, "chain": { "pass": false, "evidence": "" }, "causedEnding": { "pass": false, "evidence": "" }, "reason": "" }`,
        },
      ],
      provider: 'anthropic',
      maxTokens: 2048,
    })
    totalCost += res.costCents
    const d = res.data
    // Defensive: effective pass is the conjunction — a model that sets pass=true while a sub-check
    // failed does not sneak through (structure over the top-level flag).
    const effectivePass = d.pass && d.decision.pass && d.chain.pass && d.causedEnding.pass
    return { ...d, pass: effectivePass }
  }

  // ── Plan-doctor ('plan-doctor.v0-probe') ──────────────────────────────────────
  // The FORCE mechanism under test in 'doctor' mode. Unlike a bare planner re-roll, the doctor REPAIRS
  // the specific failing plan: it keeps the world/relationships/texture and surgically fixes ONLY the
  // agency the judge flagged. Returns just the writer-visible fields; elements/mechanics/register carry
  // over from the original (a repair, not a re-composition).
  const DoctoredPlanSchema = z.object({
    premise: z.string().min(1),
    conflict: z.string().min(1),
    escalation: z.string().min(1),
    twist: z.string().min(1),
    ending: z.string().min(1),
    emotionalDestination: z.string().min(1),
    logline: z.string().min(1),
  })
  const doctorSystem = `You are a STORY-PLAN DOCTOR for the channel "${ch.name}". Niche: ${ch.niche}.
You are handed a plan that FAILED a structural-agency check, and the exact reason it failed. REPAIR this plan — do not replace it. Keep what works (the world, the relationships, the specific texture, the emotional territory it was reaching for) and change as little as possible, but fix the agency so ALL THREE now hold:
1. DECISION — the protagonist makes ONE clear ACTIVE CHOICE with a live alternative and a real cost they themselves pay (name the alternative and the cost).
2. CHAIN — the escalation is CAUSED by that choice and its consequence (therefore / but) — not events happening to a witness, not a feeling intensifying.
3. CAUSED ENDING — the ending is the DIRECT CONSEQUENCE of the decision; had they chosen otherwise it would differ. NEVER resolve on a reveal, a coincidence, a resurfacing memory, an object's disclosure, or another character's act. (A reveal may TRIGGER the story; it must not RESOLVE it.)
KEEP IT LEAN — this becomes a ~75-second first-person story. Build the plan around ONE central choice and its consequence: aim for 3–4 real beats total, NOT a dense chain of micro-beats. Give the writer room to make it FLOW and land — a spare escalation the writer can breathe into beats a crammed one every time. Write the escalation as a few clear sentences, not a paragraph of stacked turns.
This is drama — keep it a real, human, first-person story; do not turn a costly choice into a tidy moral. Return the full repaired plan.`
  const doctorPlan = async (plan: StoryPlan, reason: string): Promise<StoryPlan> => {
    const view = {
      premise: plan.premise,
      conflict: plan.conflict,
      escalation: plan.escalation,
      twist: plan.twist,
      ending: plan.ending,
      emotionalDestination: plan.emotionalDestination,
      logline: plan.logline,
    }
    const res = await llmCall({
      templateVersion: 'plan-doctor.v0-probe',
      schema: DoctoredPlanSchema,
      system: doctorSystem,
      messages: [
        {
          role: 'user',
          content: `FAILING PLAN:\n${JSON.stringify(view, null, 2)}\n\nWHY IT FAILED (fix exactly this):\n${reason}\n\nReturn the repaired plan as JSON with the same fields.`,
        },
      ],
      provider: 'anthropic',
      temperature: 0.7,
      maxTokens: 1200,
    })
    totalCost += res.costCents
    return { ...plan, ...res.data } // keep elements/mechanics/register from the original
  }

  // ── Planner ──────────────────────────────────────────────────────────────────
  // Cross-run variety: accumulate the ORIGINAL plans' elements/loglines so the planner's anti-sameness
  // guard fires like production. Re-plan outputs are NOT pushed — a re-plan may legitimately fix the
  // same premise the judge just rejected.
  const recentEls: StoryElements[] = []
  const recentLoglines: string[] = []
  const makePlan = async (i: number, feedback?: string, nonce?: number): Promise<StoryPlan> => {
    const angle = selectAngles(1, i * 3 + 1)[0]! // same seed per run i → angle held across re-plans
    const p = buildStoryPlannerPrompt({
      channelName: ch.name,
      nicheDescription: ch.niche,
      toneConfig: tone,
      worldBibleJson: PH_BIBLE,
      genreCategory: GENRE,
      targetSeconds: RUN.targetSeconds,
      angleDirective: angle.directive,
      avoidList: recentLoglines.join('\n'),
      rejectionAvoidList: '',
      operatorFeedback: feedback,
      regenerationNonce: nonce ?? i,
      recentElements: recentEls,
    })
    const res = await llmCall({
      templateVersion: STORY_PLANNER_V1_VERSION,
      schema: StoryPlanSchema,
      system: p.system,
      messages: [{ role: 'user', content: p.userMessage }],
      temperature: 1.0,
      maxTokens: 1500,
    })
    totalCost += res.costCents
    return res.data
  }

  type Verdict = z.infer<typeof PlanJudgeSchema> & { label: string }
  const forceLoop = async (i: number) => {
    const original = await makePlan(i)
    let v = await judgePlan(original)
    const verdicts: Verdict[] = [{ ...v, label: 'original' }]
    let current = original
    let replans = 0
    while (!v.pass && replans < MAX_REPLANS) {
      replans++
      if (FORCE_MODE === 'doctor') {
        current = await doctorPlan(current, v.reason) // REPAIR the failing plan in place
      } else {
        const feedback = FORCE_MODE === 'directive' ? `${AGENCY_DIRECTIVE}${v.reason}` : `PLAN JUDGE — structural agency: ${v.reason}`
        current = await makePlan(i, feedback, i * 10 + replans) // bare planner re-roll
      }
      v = await judgePlan(current)
      verdicts.push({ ...v, label: `${FORCE_MODE === 'doctor' ? 'doctored' : 'replan'}-${replans}` })
    }
    return { original, forced: current, verdicts, replans, converged: v.pass }
  }

  // ── Full chain (writer → editor → naturalizer) + gate ────────────────────────
  // SOURCE OF TRUTH: copied from probe-genre-lab.ts runChain/gateOnce, which mirror production
  // generate-story.ts (writer anthropic per studio.v3; editor ±25% / naturalizer ±15% discard guards;
  // resolvePeak). Keep in sync. Gate runs ONCE per arm — first-attempt only, NO steered rewrite.
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length

  const runChain = async (plan: StoryPlan) => {
    const writerPrompt = buildStoryWriterPrompt({
      channelName: ch.name,
      nicheDescription: ch.niche,
      toneConfig: tone,
      language: lang,
      audienceDescriptor: aud,
      worldBibleJson: PH_BIBLE,
      fewshotStories: ch.fewshot,
      targetSeconds: RUN.targetSeconds,
      targetWords: RUN.targetWords,
      genreCategory: GENRE,
      plan: {
        premise: plan.premise,
        conflict: plan.conflict,
        escalation: plan.escalation,
        twist: plan.twist,
        ending: plan.ending,
        emotionalDestination: plan.emotionalDestination,
      },
      register: plan.elements.register,
      platformHookHint: ch.hookHint,
    })
    const story = await llmCall({
      templateVersion: STORY_V2_VERSION,
      schema: StoryOutputSchema,
      system: writerPrompt.system,
      messages: [{ role: 'user', content: writerPrompt.userMessage }],
      provider: 'anthropic', // studio.v3 writer
      temperature: 1.0,
      maxTokens: RUN.writerTokens,
    })
    totalCost += story.costCents

    let narration = story.data.narration
    let peakMoment = story.data.peakMoment
    const stageNotes: string[] = []
    for (const stage of ['editor', 'naturalizer'] as const) {
      try {
        const prompt =
          stage === 'editor'
            ? buildStoryEditorPrompt({
                nicheDescription: ch.niche,
                genreCategory: GENRE,
                language: lang,
                audienceDescriptor: aud,
                narration,
                peakMoment,
                emotionalDestination: plan.emotionalDestination,
                canonicalNames: [],
                targetWords: RUN.targetWords,
              })
            : buildStoryNaturalizerPrompt({ language: lang, audienceDescriptor: aud, narration, peakMoment })
        const res = await llmCall({
          templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION,
          schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.userMessage }],
          ...(stage === 'naturalizer' ? { provider: 'anthropic' as const } : {}),
          temperature: 0.7,
          maxTokens: RUN.writerTokens,
        })
        totalCost += res.costCents
        const tol = stage === 'editor' ? 0.25 : 0.15
        const dw = Math.abs(wordCount(res.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        const inL = beatLines(narration)
        const outL = beatLines(res.data.narration)
        const keptPeak = resolvePeak(res.data.narration, [res.data.peakMoment, peakMoment])
        if (dw > tol) stageNotes.push(`${stage}: discarded_wordcount (${Math.round(dw * 100)}%)`)
        else if (!keptPeak) stageNotes.push(`${stage}: discarded_peak`)
        else if (inL >= 4 && outL <= Math.ceil(inL / 2)) stageNotes.push(`${stage}: discarded_formatting (${inL}→${outL})`)
        else {
          stageNotes.push(`${stage}: ok`)
          narration = res.data.narration
          peakMoment = keptPeak
        }
      } catch (err) {
        stageNotes.push(`${stage}: failed (${String(err).slice(0, 60)})`)
      }
    }

    // ── FLOW / LANDING PASS (PROBE_FLOW=1) ──────────────────────────────────────
    // A finishing line-edit that targets the exact defect the owner caught: beats that jump, abstract
    // shorthand, staccato rhythm, and a turn that doesn't land for a first-time listener. It keeps every
    // beat + the agency and adds NO new events/morals; it must NOT change proper nouns or concrete objects
    // (the don't-touch-canonical-details guard — a plain flow pass slipped "jeep"→"bus" once).
    if (process.env.PROBE_FLOW === '1') {
      try {
        const fp = await llmCall({
          templateVersion: 'flow-landing.v0-probe',
          schema: z.object({ narration: z.string().min(1) }),
          system: `You are a careful line editor for first-person ${lang} drama narration for short video.
The narration below has the RIGHT story, beats, and agency — but polish its FLOW and make sure the TURN LANDS for a first-time listener who hears it once. Hard rules:
- Keep EVERY plot beat and the protagonist's agency exactly; add NO new events, characters, backstory, or moral.
- Do NOT announce or explain feelings ("naramdaman ko", "napagtanto ko", stated lessons).
- BRIDGE beats so cause→effect is felt; turn any abstract/shorthand line into a concrete one a listener can decode in one pass; make the ENDING's turn clear (if a line subtracts a reason like "not fear", SHOW the real reason).
- VARY sentence length — do not leave it a string of short fragments.
- Do NOT change any proper noun, name, place, or concrete object (if it's a jeep it stays a jeep).
- Same voice and language. Similar length (±15%).`,
          messages: [{ role: 'user', content: `NARRATION:\n${narration}\n\nReturn JSON: { "narration": "..." }` }],
          provider: 'anthropic',
          temperature: 0.7,
          maxTokens: RUN.writerTokens,
        })
        totalCost += fp.costCents
        const dw = Math.abs(wordCount(fp.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
        const keptPeak = resolvePeak(fp.data.narration, [peakMoment])
        if (dw > 0.35) stageNotes.push(`flow: discarded_wordcount (${Math.round(dw * 100)}%)`)
        else if (!keptPeak) stageNotes.push(`flow: discarded_peak`)
        else {
          stageNotes.push(`flow: ok`)
          narration = fp.data.narration
          peakMoment = keptPeak
        }
      } catch (err) {
        stageNotes.push(`flow: failed (${String(err).slice(0, 60)})`)
      }
    }
    return { story, narration, stageNotes }
  }

  const gateOnce = async (title: string, logline: string, narration: string) => {
    const gp = buildStoryGatePrompt({
      channelName: ch.name,
      nicheDescription: ch.niche,
      language: lang,
      tasteRubric: defaultTasteRubric(GENRE, ch.niche),
      narration,
      title,
      logline,
    })
    const gr = await llmCall({
      templateVersion: STORY_CRITIC_V2_VERSION,
      schema: StoryGateSchema,
      system: gp.system,
      messages: [{ role: 'user', content: gp.userMessage }],
      provider: 'anthropic',
      maxTokens: 512,
    })
    totalCost += gr.costCents
    return gr.data
  }

  const chainAndGate = async (plan: StoryPlan) => {
    const { story, narration, stageNotes } = await runChain(plan)
    const gate = await gateOnce(story.data.title, story.data.logline, narration)
    return { title: story.data.title, logline: story.data.logline, rawNarration: story.data.narration, narration, stageNotes, gate }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  interface RunResult {
    i: number
    replans: number
    converged: boolean
    original: StoryPlan
    forced: StoryPlan
    verdicts: Verdict[]
    control?: Awaited<ReturnType<typeof chainAndGate>>
    forcedArm?: Awaited<ReturnType<typeof chainAndGate>>
    cost: number
  }
  const results: RunResult[] = []

  // Mirror production's step-level resilience: production runs each pipeline step under BullMQ, which
  // re-runs the whole step up to 3× on a ProviderError (a transient schema-validation failure — e.g. the
  // anthropic writer emitting quote-heavy Taglish JSON that fails the single in-client repair — then
  // succeeds on retry). The probe had NO such retry, so one flaky call aborted the entire run and shrank
  // the paired sample (2026-07-23 n=6 lost 3 runs this way). Retry each run's LLM chain once so the probe
  // is as resilient as production, not more brittle. Not a mechanism change — it only stops a transient
  // provider hiccup from discarding an otherwise-valid paired run.
  const RUN_ATTEMPTS = 2
  for (let i = 0; i < N; i++) {
    const before = totalCost
    try {
      let fl: Awaited<ReturnType<typeof forceLoop>> | undefined
      let control: RunResult['control']
      let forcedArm: RunResult['forcedArm']
      for (let attempt = 1; attempt <= RUN_ATTEMPTS; attempt++) {
        try {
          fl = await forceLoop(i)
          if (!JUDGE_ONLY) {
            control = await chainAndGate(fl.original)
            forcedArm = fl.replans > 0 ? await chainAndGate(fl.forced) : undefined
          }
          break
        } catch (err) {
          if (attempt === RUN_ATTEMPTS) throw err
          console.log(`  ↻ run ${i + 1} attempt ${attempt} hit a transient provider error, retrying: ${String(err).slice(0, 90)}`)
          control = undefined
          forcedArm = undefined
        }
      }
      if (!fl) throw new Error('unreachable')
      // Cross-run variety is measured against what the planner FIRST reached for.
      recentEls.push(fl.original.elements)
      if (fl.original.logline) recentLoglines.push(fl.original.logline)
      results.push({ i, replans: fl.replans, converged: fl.converged, original: fl.original, forced: fl.forced, verdicts: fl.verdicts, control, forcedArm, cost: totalCost - before })

      // Per-run detail
      console.log(`\n${'═'.repeat(74)}`)
      console.log(`[RUN ${i + 1}/${N}]  re-plans=${fl.replans}  judge-converged=${fl.converged ? 'YES' : 'NO'}  cost=${totalCost - before}¢`)
      for (const v of fl.verdicts) {
        console.log(`  JUDGE(${v.label}): ${v.pass ? 'PASS' : 'FAIL'}  [decision=${v.decision.pass} chain=${v.chain.pass} causedEnding=${v.causedEnding.pass}]`)
        console.log(`    reason: ${v.reason}`)
        console.log(`    decision:     ${v.decision.evidence}`)
        console.log(`    chain:        ${v.chain.evidence}`)
        console.log(`    causedEnding: ${v.causedEnding.evidence}`)
      }
      console.log(`  ── ORIGINAL plan ──`)
      console.log(`    premise:    ${fl.original.premise}`)
      console.log(`    escalation: ${fl.original.escalation}`)
      console.log(`    ending:     ${fl.original.ending}`)
      if (fl.replans > 0) {
        console.log(`  ── FORCED plan ──`)
        console.log(`    premise:    ${fl.forced.premise}`)
        console.log(`    escalation: ${fl.forced.escalation}`)
        console.log(`    ending:     ${fl.forced.ending}`)
      }
      if (control) {
        console.log(`  GATE(control/original): ${control.gate.pass ? 'PASS' : `FAIL`} — ${control.gate.reason}`)
        console.log(`    stages: ${control.stageNotes.join(' | ')}`)
      }
      if (forcedArm) {
        console.log(`  GATE(forced): ${forcedArm.gate.pass ? 'PASS' : `FAIL`} — ${forcedArm.gate.reason}`)
        console.log(`    stages: ${forcedArm.stageNotes.join(' | ')}`)
      }
      if (control) console.log(`${'─'.repeat(74)}\n[CONTROL FINAL]\n${control.narration}`)
      if (forcedArm) console.log(`${'─'.repeat(74)}\n[FORCED FINAL]\n${forcedArm.narration}`)
    } catch (err) {
      console.log(`\n${'═'.repeat(74)}\n[RUN ${i + 1}/${N}] FAILED (harness): ${String(err).slice(0, 200)}`)
    }
  }

  // ── Summary + pre-registered evaluation ────────────────────────────────────────
  console.log(`\n${'═'.repeat(74)}\nSUMMARY (drama, ${results.length}/${N} runs completed):`)
  console.table(
    results.map((r) => {
      // effective plan-force output for the run: forced arm if we re-planned, else the original (judge
      // added nothing — correctly). control is always the original-plan chain (today's production).
      const controlPass = r.control ? (r.control.gate.pass ? 'PASS' : 'FAIL') : '—'
      const forcePass = JUDGE_ONLY ? '—' : (r.forcedArm ?? r.control)?.gate.pass ? 'PASS' : 'FAIL'
      return {
        run: r.i + 1,
        judgeOrig: r.verdicts[0]!.pass ? 'PASS' : 'FAIL',
        rePlans: r.replans,
        converged: r.converged ? 'yes' : 'no',
        gateControl: controlPass,
        gatePlanForce: forcePass,
        costCents: r.cost,
      }
    }),
  )

  if (!JUDGE_ONLY) {
    const withControl = results.filter((r) => r.control)
    const controlPasses = withControl.filter((r) => r.control!.gate.pass).length
    const forcePasses = withControl.filter((r) => (r.forcedArm ?? r.control)!.gate.pass).length
    const n = withControl.length
    const primaryMet = forcePasses >= 3 && forcePasses - controlPasses >= 2
    console.log(`\nPRE-REGISTERED CRITERIA (n=${n} paired runs):`)
    console.log(`  1. PRIMARY (gate delta): plan-force ${forcePasses}/${n} vs control ${controlPasses}/${n} → ${primaryMet ? 'MET' : 'NOT MET'} (need ≥3 AND delta ≥2)`)
  }
  const judgeFails = results.filter((r) => !r.verdicts[0]!.pass)
  const converged = judgeFails.filter((r) => r.converged).length
  console.log(`  2. CONVERGENCE: ${converged}/${judgeFails.length} judge-failing plans reached a judge-pass within ${MAX_REPLANS} re-plans (need ≥4/6)`)
  console.log(`  3. BLIND READ + 4. GAMING AUDIT: owner reads the blind sheet + raw evidence quotes (below).`)

  // ── Blind-read artifacts (ab-premises pattern) ─────────────────────────────────
  if (!JUDGE_ONLY) {
    interface Entry { run: number; arm: 'control' | 'forced' | 'single'; text: string }
    const entries: Entry[] = []
    for (const r of results) {
      if (r.forcedArm && r.control) {
        entries.push({ run: r.i + 1, arm: 'control', text: r.control.narration })
        entries.push({ run: r.i + 1, arm: 'forced', text: r.forcedArm.narration })
      } else if (r.control) {
        entries.push({ run: r.i + 1, arm: 'single', text: r.control.narration }) // judge passed original
      }
    }
    // Seeded shuffle so the sheet is reproducible from the key (no Math.random — deterministic).
    let seed = 20260720
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const shuffled = [...entries]
    for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j]!, shuffled[k]!] }

    const outDir = join(process.cwd(), 'scripts', 'ab-out')
    mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const blindPath = join(outDir, `plan-force-${stamp}-blind.md`)
    const keyPath = join(outDir, `plan-force-${stamp}-key.json`)
    const rawPath = join(outDir, `plan-force-${stamp}-raw.json`)

    writeFileSync(
      blindPath,
      [
        `# Blind agency read — ${ch.name} (drama · ${shuffled.length} finals)`,
        '',
        'Score each 1–5: does this feel like a person who ACTED — chose something that cost them —',
        'or a person things happened TO? (5 = clearly acted; 1 = pure passive witness.)',
        'Do NOT open the key until every one is scored.',
        '',
        ...shuffled.map((e, k) => `### ${k + 1}.\n${e.text}\n\nScore: __\n`),
      ].join('\n'),
    )
    writeFileSync(keyPath, JSON.stringify(shuffled.map((e, k) => ({ n: k + 1, run: e.run, arm: e.arm })), null, 2))
    // Full audit trail — plans, every judge verdict + evidence quotes (criterion 4), gate verdicts, cost.
    writeFileSync(
      rawPath,
      JSON.stringify(
        results.map((r) => ({
          run: r.i + 1,
          replans: r.replans,
          converged: r.converged,
          verdicts: r.verdicts,
          originalPlan: r.original,
          forcedPlan: r.replans > 0 ? r.forced : null,
          controlGate: r.control?.gate ?? null,
          forcedGate: r.forcedArm?.gate ?? null,
          controlFinal: r.control?.narration ?? null,
          forcedFinal: r.forcedArm?.narration ?? null,
        })),
        null,
        2,
      ),
    )
    console.log(`\nblind sheet:  ${blindPath}`)
    console.log(`key (AFTER scoring): ${keyPath}`)
    console.log(`raw (evidence audit): ${rawPath}`)
  }

  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
