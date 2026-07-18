// Genre lab (2026-07-17): full-chain probe (Planner → Writer → Editor → Claude Naturalizer →
// Claude gate) for ONE genre at a time, on a Taglish channel — 2 short (75s) + 2 long-form (240s,
// exercises the long-form WRITER branch — isLongForm>180s in story.v2 — NOT the full chaptered
// scene-breakdown pipeline; this probe stops at the writer/gate). No DB writes. Mirrors production generate-story
// (studio.v2 routing + discard guards). Every run doubles as a Taglish naturalness test.
// Usage: tsx scripts/probe-genre-lab.ts <genre> [writerProvider]
//   e.g. tsx scripts/probe-genre-lab.ts reddit_story            (gpt-4o writer)
//        tsx scripts/probe-genre-lab.ts reddit_story anthropic  (Claude writer — PRODUCTION since studio.v3, 5482675)
// Cost: ~50-100¢ per genre.
import '../src/env.js'
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

  // Authentic Taglish reddit exemplars (ORIGINAL, hand-authored). Every one is a genuine DILEMMA
  // ("I did X, someone did Y, now I don't know if I was wrong / what to do"), meaty and relatable,
  // written in a PROCESSING voice (the poster second-guessing themselves, not an author narrating).
  // They span communities (off-my-chest, let's-not-meet, AITA-family, relationships, malicious
  // compliance), not one template. Note #4 (creepy): the supernatural ENTERS through a real problem
  // and opens braced against skepticism — never folklore exposition. In production the operator
  // supplies the channel's own reference stories.
  const REDDIT_FEWSHOT = `--- REFERENCE STORY 1 (off-my-chest · moral dilemma, genuinely arguable · processing voice · ends on the question) ---
Title: Hindi ako pumunta sa libing ng tatay ko. Wala pang nakakaalam kung bakit.
Alam kong parang halimaw ako. Hayaan niyo lang muna akong mag-paliwanag.
Namatay yung tatay ko last month. Hindi ako pumunta sa libing. Sabi ko sa pamilya, may sakit ako. Nagsinungaling ako.
Yung totoo: siya yung dahilan kung bakit umalis ako ng bahay nung 17 ako. Hindi ko na uungkatin lahat dito — pero may mga bagay na hindi mo basta napapatawad kahit patay na sila.
Nung tumawag si Mama na wala na siya, hinintay kong dumating yung lungkot. Hindi dumating. Yun mismo yung kinatatakutan ko.
Looking back, siguro dapat pumunta na lang ako para kay Mama. Para sa itsura. Pero hindi ko kaya tumayo sa harap ng kabaong niya at magkunwaring nawawalan ako.
Ngayon iniisip ng mga kapatid ko na wala akong puso. Iniisip ni Mama na binigo ko siya sa huling araw.
Hindi ko pa rin alam kung tama ako. Baka hindi. Pero hindi ko rin alam kung kaya kong gawin ulit nang iba.
Masama ba ako?

--- REFERENCE STORY 2 (AITA · family/money, HIGH stakes, genuinely split · processing voice · ends open) ---
Title: Tinigil ko yung allowance ng bunso matapos kong malaman saan galing yung pinang-college niya. AITA?
Alam ko kung paano 'to maririnig. Pero kailangan ko ng honest na opinyon.
27 ako. Ako yung nagpaaral sa bunso — 65k kada sem, tatlong taon na. Working student ako noon, apat na taong puyat, kasi "nawala" daw yung college fund ko.
Last month, habang naghahanap ako ng papeles, nakita ko yung lumang bankbook. Yung fund na "nawala." Hindi pala nawala. Ginamit nila — down sa lupa, tapos unang tuition ng bunso.
So ako pala, dalawang beses nagbayad. Sa sarili ko dati, sa kapatid ko ngayon.
Tinigil ko yung allowance niya. Sabi ko sa magulang ko, "kayo na bahala, gaya ng ginawa niyo sa akin."
Looking back, baka masyadong mabigat kay bunso — wala naman talaga siyang alam noon, bata pa. Umiiyak siya. Totoong inosente siya.
Pero bakit ako pa rin yung laging nagbabayad para sa desisyon nila?
Hindi ako kausap ng buong pamilya ngayon. AITA?

--- REFERENCE STORY 3 (relationships · decision dilemma — confront or not · processing voice · ends on "what do I do") ---
Title: Nakita ko sa phone ng boyfriend ko yung message. Ngayon parang ako pa yung baliw.
Anim na taon na kami. Pinag-uusapan na yung kasal.
Isang gabi, nag-vibrate yung phone niya. Lock screen lang — "Client — wag sagutin," 2:14 AM. "Miss na kita. Kailan ka uuwi sa'kin?"
Hindi ko binuksan. Hindi ko kaya.
Kinaumagahan, tinanong ko kung sino si "Client." Katrabaho lang daw, deadline. Kalmado. Sanay.
Eto yung part na baka sabihin niyong tanga ako: hindi ko pa rin siya kinukumpronta nang diretso. Kasi paano kung mali ako? Paano kung wala talaga?
Pero alam ko sa sarili ko. Yung kalmado niya, practice yun.
In hindsight, dapat siguro binuksan ko na yung phone nung gabing 'yon. Ngayon parang wala akong hawak — naghihinala lang na walang pruweba.
Nasa kabilang kwarto siya ngayon, natutulog, akala niya okay lang lahat.
Hindi ko alam kung haharapin ko siya, o hihintayin kong magkamali siya ulit. Ano ba dapat kong gawin?

--- REFERENCE STORY 4 (let's-not-meet · SUPERNATURAL ENTERS THROUGH A REAL PROBLEM · opens braced against skepticism · ends on the dilemma) ---
Title: May mga litrato sa phone ko na hindi ko kinuha. Alam ko kung gaano 'to ka-ridiculous.
Alam ko kung ano iisipin niyo. Sleep paralysis, sleepwalking, edited. Naisip ko na rin lahat 'yan. Hayaan niyo lang muna.
Mga dalawang linggo na akong may nakikitang litrato sa phone ko na hindi ko naaalalang kinuha.
Chineck ko sa Google Photos. Naka-timestamp — 2:13 AM. Lahat, mga ganung oras.
Nakatira akong mag-isa.
Akala ko sleepwalking. Kaya naglagay ako ng tape sa pinto, yung mapuputol pag binuksan. Umaga, buo pa rin yung tape. Hindi ako lumabas.
Sinabi ko kay Mama, akala ko matatawa siya. Hindi siya natawa. Sabi niya, nakatanggap din siya ng isa — pinadala ko raw sa kanya isang gabi, hindi ko naaalala.
Yung huling litrato — nakatayo ako sa labas. Sa ilalim ng lumang puno ng mangga sa dulo ng barangay. Yung puno na sinasabi ng matatanda na wag daw lalapitan.
Hindi ko alam paano ako nakarating doon. Hindi ko alam sino ang kumuha.
Ngayon takot na akong matulog. Ano ba dapat kong gawin — pumunta sa pulis na may screenshot ng sarili kong mukha?

--- REFERENCE STORY 5 (malicious compliance · workplace · agency + satisfying payoff · light processing · ends on the backfire) ---
Title: Sinabi ng boss ko wag na akong mag-OT kahit anong mangyari. Sinunod ko. Ngayon ako pa yung sinisisi.
Sabi ng manager namin sa meeting, word for word: "ayaw ko ng nag-o-OT. 6PM, uwian. Kahit anong mangyari. Hindi ako magbabayad ng OT."
Ako yung humahawak ng payroll ng buong company. Tuwing 15 at 30, may mga huling adjustment mga 5:45 kasi late magsubmit yung ibang department. Dati nag-o-OT ako para makasahod lahat on time.
Pero sabi niya, 6PM uwian. Kahit anong mangyari.
Alam kong may mangyayari. Sige po.
30th. 6PM. Umuwi ako. Iniwan ko yung payroll na hindi tapos.
Kinabukasan, 40 empleyado ang walang sahod. Kasama yung manager. Pinatawag ako, galit: "bakit hindi mo tinapos?!"
Sabi ko, "sabi niyo po 6PM uwian kahit anong mangyari, at hindi po kayo nagbabayad ng OT."
Alam kong maliit na bagay — pero honestly, sulit yung tahimik niya pagkatapos.
Ngayon pwede na ulit akong mag-OT kapag payroll. May hazard pay pa.`

  // Informational exemplars (ORIGINAL, Taglish). Every one is a COLLISION (you think X → actually Y),
  // ONE idea carried by ONE concrete case + a felt-scale beat, NO protagonist (explainer voice), and
  // an ending that RESOLVES (hands over the idea + the so-what). This is informational's narrative
  // grammar — the opposite of reddit's: question = "how/why is that true?", no agency, ending explains.
  const INFO_FEWSHOT = `--- REFERENCE 1 (collision · money · conspiratorial · resolves on a so-what) ---
Title: Bakit dinisenyo ang "minimum payment" para HINDI mo mabayaran ang utang mo.
Akala mo responsable ka kasi binabayaran mo yung minimum sa credit card. Yun mismo yung gusto nila.
Sabihin nating may utang kang 20,000, tapos 3% ang minimum. Ang babayaran mo? 600 lang. Pero ang interes bawat buwan? Mga 500 na agad.
So sa 600 na binayad mo, 100 lang ang bumawas sa utang mo. Yung 500, interes lang na bumalik.
Ganun kabagal. Kung minimum lang lagi, yung 20,000 na 'yon — pwedeng umabot ng pito hanggang walong taon bago mabayaran. At mababayaran mo ng halos doble.
Hindi 'yan aksidente. Ang minimum payment, dinisenyo para tumagal ka — kasi habang tumatagal ka, mas kumikita sila.
Kaya kahit konti, sobrahan mo lagi sa minimum. Yun lang yung paraan para hindi ka lamunin ng interes.

--- REFERENCE 2 (collision · everyday · myth-slayer · resolves on a "count it yourself") ---
Title: Bakit nasa pinakadulo lagi ng grocery ang gatas at itlog.
Hindi 'yan tamad na disenyo. Sinadya 'yan.
Yung gatas, itlog, tinapay — 'yan yung pinakamadalas bilhin ng tao. Kung nasa harap lang 'yan, papasok ka, kukunin, aalis. Tapos.
Kaya nilalagay sa pinakadulo. Para mapilitan kang dumaan sa lahat ng iba pang produkto papunta doon.
Yung mga snack, yung mga naka-sale sa gitna, yung mga bagay na hindi mo naman balak bilhin — nakikita mo lahat habang naglalakad papunta sa gatas.
May tawag pa sila dito: "the milk run."
Kaya sa susunod na pupunta ka ng grocery para lang sa gatas — bilangin mo kung ilang bagay ang naisama mo pauwi. Malamang, hindi lang gatas.`

  // One Taglish probe channel per genre. Niches deliberately match the self-run channel vision.
  const LAB: Record<string, { name: string; niche: string; hookHint: string; fewshot?: string; seeds?: string[] }> = {
    reddit_story: {
      name: 'Hatulan Niyo Ako',
      niche: 'Filipino confession & drama stories — family, barkada, office, money, and neighbor conflicts: someone did someone wrong, and the viewer has to take a side (am-I-wrong, petty revenge, malicious compliance, TIFU)',
      hookHint: 'lead with the wrong itself in the first line — the viewer must be able to take a side by second 3',
      fewshot: REDDIT_FEWSHOT,
    },
    informational: {
      name: 'Alam Mo Ba?',
      niche: 'surprising everyday facts and how-things-really-work explainers for Filipino viewers — money, food, city life, history',
      hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
      fewshot: INFO_FEWSHOT,
    },
    horror: {
      // Deliberately GENERIC + sub-tradition-spanning (urban legend / found-footage / psychological /
      // paranormal / domestic) — NOT a specific channel's DNA. This is an adversarial test of the
      // narrative-grammar abstraction, not a showcase of any one horror channel.
      name: 'Hatinggabi',
      niche: 'first-person Taglish horror — ordinary life interrupted by something wrong; spans urban legend, found-footage, psychological, paranormal, and domestic horror (apartments, hospitals, phones, commutes, elevators, old houses)',
      hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
    },
    lifestyle: {
      name: 'Sarap ng Buhay',
      niche: 'Filipino food and small-joys lifestyle — where to eat, what to cook, tiny routines that make the week better',
      hookHint: 'lead with the most wantable moment in the first 2s',
    },
    comedy: {
      name: 'Buking',
      niche: 'everyday Filipino disaster comedy — true-feeling stories of small plans going catastrophically, hilariously wrong',
      hookHint: 'a deadpan or absurd first line that promises chaos',
    },
    drama: {
      name: 'Hindi Ko Nasabi',
      niche: 'Filipino family drama — the things we never say to the people we love, told first-person',
      hookHint: 'an emotional hook in the first 2s — a line that makes you stay',
    },
    commentary: {
      name: 'Totoo Naman, Diba?',
      niche: 'sharp takes on everyday Filipino culture — work, money habits, family expectations, internet behavior',
      hookHint: 'state the take itself, flat, in the first line',
    },
    general: {
      name: 'Kwentuhan Tayo',
      niche: 'true-feeling everyday Filipino stories — whatever the barangay would actually retell',
      hookHint: 'earn the next ten seconds with the first line',
    },
    // Documentary is a PRODUCT-DIRECTION probe, run against the CURRENT architecture ON PURPOSE
    // (no documentary genre module, no grammar, no evidence seam) to observe whether the stack is
    // sufficient. `seeds` are real, checkable subjects passed as operatorSeed so the output can be
    // fact-checked against reality — documentary's whole promise is factual accuracy.
    documentary: {
      name: 'Ganito Nangyari',
      niche: 'short documentaries on how real things came to be or fell apart — companies, inventions, disasters, places; the true story behind something the viewer half-knows',
      hookHint: 'open on the surprising real fact or the moment it all turned',
      seeds: [
        'the accidental invention of bubble wrap',
        'how Kodak invented the digital camera and then buried it',
        'why the Tacoma Narrows Bridge collapsed in 1940',
        'how Blockbuster passed on buying Netflix and then collapsed',
      ],
    },
  }

  const genre = process.argv[2]
  const ch = genre ? LAB[genre] : undefined
  if (!genre || !ch) {
    console.error(`usage: tsx scripts/probe-genre-lab.ts <genre> [writerProvider]\ngenres: ${Object.keys(LAB).join(', ')}`)
    process.exit(1)
  }
  // Optional writer-model experiment (probe-only; production writer stays per generate-story).
  const writerProvider = process.argv[3] === 'anthropic' ? ('anthropic' as const) : undefined
  if (writerProvider) console.log(`⚗ writer provider override: ${writerProvider}`)
  // DNA-ONLY experiment (harness override — the planner/prompts are UNCHANGED): swap only the channel
  // niche/name to test whether a genre's shape-convergence comes from the planner or the channel DNA.
  if (process.env.PROBE_NICHE) ch.niche = process.env.PROBE_NICHE
  if (process.env.PROBE_NAME) ch.name = process.env.PROBE_NAME
  if (process.env.PROBE_NICHE) console.log(`⚗ DNA override → "${ch.name}": ${ch.niche}`)

  const RUNS = [
    { form: 'short', targetSeconds: 75, targetWords: 190, writerTokens: 4096 },
    { form: 'short', targetSeconds: 75, targetWords: 190, writerTokens: 4096 },
    { form: 'long', targetSeconds: 240, targetWords: 600, writerTokens: 16384 },
    { form: 'long', targetSeconds: 240, targetWords: 600, writerTokens: 16384 },
  ]

  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const beatLines = (s: string) => s.split('\n').filter((l) => l.trim()).length
  const PH_BIBLE = JSON.stringify({ region: 'Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} })
  const tone = JSON.stringify({ intensity: 7, warmth: 5, energy: 5, pacing: 5, humor: genre === 'comedy' ? 8 : 3 })
  let totalCost = 0
  // Accumulate across runs so the planner's anti-sameness guard fires like production (spreads
  // registers/shapes instead of converging on one) — the probe otherwise runs each story cold.
  const recentEls: StoryElements[] = []
  const recentLoglines: string[] = []
  const summary: string[] = [] // one line per run: form | title | register | gate | retried

  for (let i = 0; i < RUNS.length; i++) {
   try {
    const run = RUNS[i]!
    const angle = selectAngles(1, i * 3 + 1)[0]!
    const plannerPrompt = buildStoryPlannerPrompt({
      channelName: ch.name,
      nicheDescription: ch.niche,
      toneConfig: tone,
      worldBibleJson: PH_BIBLE,
      genreCategory: genre,
      targetSeconds: run.targetSeconds,
      angleDirective: angle.directive,
      operatorSeed: ch.seeds?.[i], // real subject to fact-check (documentary probe); undefined otherwise
      avoidList: recentLoglines.join('\n'),
      rejectionAvoidList: '',
      regenerationNonce: i,
      recentElements: recentEls,
    })
    const plan = await llmCall({
      templateVersion: STORY_PLANNER_V1_VERSION,
      schema: StoryPlanSchema,
      system: plannerPrompt.system,
      messages: [{ role: 'user', content: plannerPrompt.userMessage }],
      temperature: 1.0,
      maxTokens: 1500,
    })
    totalCost += plan.costCents
    recentEls.push(plan.data.elements)
    if (plan.data.logline) recentLoglines.push(plan.data.logline)

    // Full chain (writer → editor → naturalizer), callable twice: production's gate-steered rewrite.
    const runChain = async (qaFeedback?: string) => {
      const writerPrompt = buildStoryWriterPrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        toneConfig: tone,
        language: 'taglish',
        audienceDescriptor: defaultAudienceDescriptor('taglish'),
        worldBibleJson: PH_BIBLE,
        fewshotStories: ch.fewshot ?? '(no reference stories yet — write in the channel voice)',
        targetSeconds: run.targetSeconds,
        targetWords: run.targetWords,
        genreCategory: genre,
        plan: {
          premise: plan.data.premise,
          conflict: plan.data.conflict,
          escalation: plan.data.escalation,
          twist: plan.data.twist,
          ending: plan.data.ending,
          emotionalDestination: plan.data.emotionalDestination,
        },
        register: plan.data.elements.register,
        platformHookHint: run.form === 'short' ? ch.hookHint : undefined,
        qaFeedback,
      })
      const story = await llmCall({
        templateVersion: STORY_V2_VERSION,
        schema: StoryOutputSchema,
        system: writerPrompt.system,
        messages: [{ role: 'user', content: writerPrompt.userMessage }],
        ...(writerProvider ? { provider: writerProvider } : {}),
        temperature: 1.0,
        maxTokens: run.writerTokens,
      })
      totalCost += story.costCents

      let narration = story.data.narration
      let peakMoment = story.data.peakMoment
      const stageNotes: string[] = []

      // Editor → Naturalizer with the production discard guards.
      for (const stage of ['editor', 'naturalizer'] as const) {
        try {
          const prompt =
            stage === 'editor'
              ? buildStoryEditorPrompt({
                  nicheDescription: ch.niche,
                  genreCategory: genre,
                  language: 'taglish',
                  audienceDescriptor: defaultAudienceDescriptor('taglish'),
                  narration,
                  peakMoment,
                  emotionalDestination: plan.data.emotionalDestination,
                  canonicalNames: [],
                  targetWords: run.targetWords,
                })
              : buildStoryNaturalizerPrompt({
                  language: 'taglish',
                  audienceDescriptor: defaultAudienceDescriptor('taglish'),
                  narration,
                  peakMoment,
                })
          const res = await llmCall({
            templateVersion: stage === 'editor' ? STORY_EDITOR_V1_VERSION : STORY_NATURALIZER_V1_VERSION,
            schema: stage === 'editor' ? StoryEditSchema : StoryNaturalizeSchema,
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.userMessage }],
            ...(stage === 'naturalizer' ? { provider: 'anthropic' as const } : {}),
            temperature: 0.7,
            maxTokens: run.writerTokens,
          })
          totalCost += res.costCents
          // SOURCE OF TRUTH: these mirror the production discard tolerances in
          // apps/worker/src/pipeline/steps/generate-story.ts (editor ±25%, naturalizer ±15%). If those
          // change, this probe silently diverges from the thing it claims to mirror — keep in sync.
          const tol = stage === 'editor' ? 0.25 : 0.15
          const dw = Math.abs(wordCount(res.data.narration) - wordCount(narration)) / Math.max(1, wordCount(narration))
          const inL = beatLines(narration)
          const outL = beatLines(res.data.narration)
          if (dw > tol) stageNotes.push(`${stage}: discarded_wordcount (${Math.round(dw * 100)}%)`)
          else if (!res.data.narration.includes(res.data.peakMoment.trim())) stageNotes.push(`${stage}: discarded_peak`)
          else if (inL >= 4 && outL <= Math.ceil(inL / 2)) stageNotes.push(`${stage}: discarded_formatting (${inL}→${outL})`)
          else {
            stageNotes.push(`${stage}: ok${res.data.narration === narration ? ' (unchanged)' : ''}`)
            ;({ narration, peakMoment } = res.data)
          }
        } catch (err) {
          stageNotes.push(`${stage}: failed (${String(err).slice(0, 60)})`)
        }
      }
      return { story, narration, stageNotes }
    }

    const gateOnce = async (title: string, logline: string, narration: string) => {
      const gp = buildStoryGatePrompt({
        channelName: ch.name,
        nicheDescription: ch.niche,
        language: 'taglish',
        tasteRubric: defaultTasteRubric(genre, ch.niche),
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

    // Production shape: chain → gate; on FAIL, ONE steered rewrite → gate again; ships regardless.
    let attempt = await runChain()
    const gateLines: string[] = []
    let retried = false
    try {
      let verdict = await gateOnce(attempt.story.data.title, attempt.story.data.logline, attempt.narration)
      gateLines.push(`${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.reason}`)
      if (!verdict.pass) {
        retried = true
        attempt = await runChain(verdict.reason)
        verdict = await gateOnce(attempt.story.data.title, attempt.story.data.logline, attempt.narration)
        gateLines.push(`after rewrite: ${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.reason}`)
      }
    } catch (err) {
      gateLines.push(`gate errored: ${String(err).slice(0, 120)}`)
    }

    const el = plan.data.elements
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`[${genre.toUpperCase()} · ${run.form.toUpperCase()} ${run.targetSeconds}s · ${i + 1}/${RUNS.length}] "${attempt.story.data.title}"  register=${el.register ?? '-'}${retried ? '  (rewritten once)' : ''}`)
    console.log(`  logline: ${attempt.story.data.logline}`)
    // PLAN INTERNALS — what the PLANNER selected (the real signal for narrative-grammar convergence).
    console.log(`  ── PLAN (planner convergence) ──`)
    console.log(`  premise:    ${plan.data.premise}`)
    console.log(`  conflict:   ${plan.data.conflict}`)
    console.log(`  escalation: ${plan.data.escalation}`)
    console.log(`  twist:      ${plan.data.twist}`)
    console.log(`  ending:     ${plan.data.ending}`)
    console.log(`  elements:   structure=${el.structure} | role=${el.role} | setting=${el.setting} | anchor=${el.anchor ?? '-'} | trigger=${el.trigger} | turn=${el.turn} | aftereffect=${el.aftereffect}`)
    console.log(`  stages: ${attempt.stageNotes.join(' | ')}  words=${wordCount(attempt.narration)}`)
    for (const g of gateLines) console.log(`  GATE: ${g}`)
    console.log(`${'─'.repeat(70)}\n${attempt.narration}`)
    const finalGate = gateLines[gateLines.length - 1] ?? '(no gate)'
    summary.push(`${run.form.padEnd(5)} | ${attempt.story.data.title.slice(0, 40).padEnd(40)} | ${(el.register ?? '-').slice(0, 24).padEnd(24)} | ${finalGate.startsWith('gate errored') ? 'ERROR' : /(^|: )PASS — /.test(finalGate) ? 'PASS' : 'FAIL'}${retried ? ' (retried)' : ''}`)
   } catch (err) {
    console.log(`\n${'═'.repeat(70)}\n[${genre.toUpperCase()} · ${i + 1}/${RUNS.length}] RUN FAILED (harness): ${String(err).slice(0, 200)}`)
    summary.push(`${RUNS[i]!.form.padEnd(5)} | ${'(harness failure)'.padEnd(40)} | ${'-'.padEnd(24)} | ERROR`)
   }
  }
  console.log(`\n${'═'.repeat(70)}\nSUMMARY (${genre}):\n${summary.map((s, n) => `  ${n + 1}. ${s}`).join('\n')}`)
  console.log(`total lab cost (${genre}): ${totalCost}¢`)
  process.exit(0)
})()
