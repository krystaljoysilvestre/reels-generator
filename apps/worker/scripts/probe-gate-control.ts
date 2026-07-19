// Gate control (2026-07-19) — throwaway. Pushes the HAND-AUTHORED reddit exemplars
// (probe-genre-lab REDDIT_FEWSHOT — what we consider "the real thing") through the SAME
// production gate + reddit taste rubric the fingerprint audit used. Question: does the gate
// PASS human-authored content, or fail it too? If it fails these, the 12/12 audit result is
// partly a harsh-grader artifact; if it passes, the audit signal is real.
// Usage: tsx scripts/probe-gate-control.ts
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildStoryGatePrompt, StoryGateSchema, defaultTasteRubric, STORY_CRITIC_V2_VERSION } = await import(
    '../src/prompts-bridge.js'
  )

  const CH = {
    name: 'Hatulan Niyo Ako',
    niche:
      'Filipino confession & drama stories — family, barkada, office, money, and neighbor conflicts: someone did someone wrong, and the viewer has to take a side (am-I-wrong, petty revenge, malicious compliance, TIFU)',
  }

  // The 5 hand-authored exemplars, verbatim from probe-genre-lab.ts. Loglines are neutral one-liners
  // (the gate weights title+narration far more). Span: confession / AITA / decision-dilemma /
  // creepy-encounter(passive-but-acts) / malicious-compliance(agency+payoff).
  const EXEMPLARS: { tag: string; title: string; logline: string; narration: string }[] = [
    {
      tag: 'confession · unresolved',
      title: 'Hindi ako pumunta sa libing ng tatay ko. Wala pang nakakaalam kung bakit.',
      logline: 'A grown child skips their father’s funeral and cannot tell if they are heartless or justified.',
      narration: `Alam kong parang halimaw ako. Hayaan niyo lang muna akong mag-paliwanag.
Namatay yung tatay ko last month. Hindi ako pumunta sa libing. Sabi ko sa pamilya, may sakit ako. Nagsinungaling ako.
Yung totoo: siya yung dahilan kung bakit umalis ako ng bahay nung 17 ako. Hindi ko na uungkatin lahat dito — pero may mga bagay na hindi mo basta napapatawad kahit patay na sila.
Nung tumawag si Mama na wala na siya, hinintay kong dumating yung lungkot. Hindi dumating. Yun mismo yung kinatatakutan ko.
Looking back, siguro dapat pumunta na lang ako para kay Mama. Para sa itsura. Pero hindi ko kaya tumayo sa harap ng kabaong niya at magkunwaring nawawalan ako.
Ngayon iniisip ng mga kapatid ko na wala akong puso. Iniisip ni Mama na binigo ko siya sa huling araw.
Hindi ko pa rin alam kung tama ako. Baka hindi. Pero hindi ko rin alam kung kaya kong gawin ulit nang iba.
Masama ba ako?`,
    },
    {
      tag: 'AITA · open',
      title: 'Tinigil ko yung allowance ng bunso matapos kong malaman saan galing yung pinang-college niya. AITA?',
      logline: 'The one who paid their own way stops funding the sibling raised on the fund that was taken from them.',
      narration: `Alam ko kung paano 'to maririnig. Pero kailangan ko ng honest na opinyon.
27 ako. Ako yung nagpaaral sa bunso — 65k kada sem, tatlong taon na. Working student ako noon, apat na taong puyat, kasi "nawala" daw yung college fund ko.
Last month, habang naghahanap ako ng papeles, nakita ko yung lumang bankbook. Yung fund na "nawala." Hindi pala nawala. Ginamit nila — down sa lupa, tapos unang tuition ng bunso.
So ako pala, dalawang beses nagbayad. Sa sarili ko dati, sa kapatid ko ngayon.
Tinigil ko yung allowance niya. Sabi ko sa magulang ko, "kayo na bahala, gaya ng ginawa niyo sa akin."
Looking back, baka masyadong mabigat kay bunso — wala naman talaga siyang alam noon, bata pa. Umiiyak siya. Totoong inosente siya.
Pero bakit ako pa rin yung laging nagbabayad para sa desisyon nila?
Hindi ako kausap ng buong pamilya ngayon. AITA?`,
    },
    {
      tag: 'decision-dilemma · open',
      title: 'Nakita ko sa phone ng boyfriend ko yung message. Ngayon parang ako pa yung baliw.',
      logline: 'Six years in and about to marry, they find a 2AM message and cannot decide whether to confront or wait.',
      narration: `Anim na taon na kami. Pinag-uusapan na yung kasal.
Isang gabi, nag-vibrate yung phone niya. Lock screen lang — "Client — wag sagutin," 2:14 AM. "Miss na kita. Kailan ka uuwi sa'kin?"
Hindi ko binuksan. Hindi ko kaya.
Kinaumagahan, tinanong ko kung sino si "Client." Katrabaho lang daw, deadline. Kalmado. Sanay.
Eto yung part na baka sabihin niyong tanga ako: hindi ko pa rin siya kinukumpronta nang diretso. Kasi paano kung mali ako? Paano kung wala talaga?
Pero alam ko sa sarili ko. Yung kalmado niya, practice yun.
In hindsight, dapat siguro binuksan ko na yung phone nung gabing 'yon. Ngayon parang wala akong hawak — naghihinala lang na walang pruweba.
Nasa kabilang kwarto siya ngayon, natutulog, akala niya okay lang lahat.
Hindi ko alam kung haharapin ko siya, o hihintayin kong magkamali siya ulit. Ano ba dapat kong gawin?`,
    },
    {
      tag: 'creepy-encounter · passive-but-acts · open',
      title: 'May mga litrato sa phone ko na hindi ko kinuha. Alam ko kung gaano ’to ka-ridiculous.',
      logline: 'Photos they never took keep appearing at 2AM, and the last one is of them standing somewhere they never went.',
      narration: `Alam ko kung ano iisipin niyo. Sleep paralysis, sleepwalking, edited. Naisip ko na rin lahat 'yan. Hayaan niyo lang muna.
Mga dalawang linggo na akong may nakikitang litrato sa phone ko na hindi ko naaalalang kinuha.
Chineck ko sa Google Photos. Naka-timestamp — 2:13 AM. Lahat, mga ganung oras.
Nakatira akong mag-isa.
Akala ko sleepwalking. Kaya naglagay ako ng tape sa pinto, yung mapuputol pag binuksan. Umaga, buo pa rin yung tape. Hindi ako lumabas.
Sinabi ko kay Mama, akala ko matatawa siya. Hindi siya natawa. Sabi niya, nakatanggap din siya ng isa — pinadala ko raw sa kanya isang gabi, hindi ko naaalala.
Yung huling litrato — nakatayo ako sa labas. Sa ilalim ng lumang puno ng mangga sa dulo ng barangay. Yung puno na sinasabi ng matatanda na wag daw lalapitan.
Hindi ko alam paano ako nakarating doon. Hindi ko alam sino ang kumuha.
Ngayon takot na akong matulog. Ano ba dapat kong gawin — pumunta sa pulis na may screenshot ng sarili kong mukha?`,
    },
    {
      tag: 'malicious-compliance · agency+payoff',
      title: 'Sinabi ng boss ko wag na akong mag-OT kahit anong mangyari. Sinunod ko. Ngayon ako pa yung sinisisi.',
      logline: 'Told never to work overtime no matter what, the payroll clerk obeys — and 40 people miss payday.',
      narration: `Sabi ng manager namin sa meeting, word for word: "ayaw ko ng nag-o-OT. 6PM, uwian. Kahit anong mangyari. Hindi ako magbabayad ng OT."
Ako yung humahawak ng payroll ng buong company. Tuwing 15 at 30, may mga huling adjustment mga 5:45 kasi late magsubmit yung ibang department. Dati nag-o-OT ako para makasahod lahat on time.
Pero sabi niya, 6PM uwian. Kahit anong mangyari.
Alam kong may mangyayari. Sige po.
30th. 6PM. Umuwi ako. Iniwan ko yung payroll na hindi tapos.
Kinabukasan, 40 empleyado ang walang sahod. Kasama yung manager. Pinatawag ako, galit: "bakit hindi mo tinapos?!"
Sabi ko, "sabi niyo po 6PM uwian kahit anong mangyari, at hindi po kayo nagbabayad ng OT."
Alam kong maliit na bagay — pero honestly, sulit yung tahimik niya pagkatapos.
Ngayon pwede na ulit akong mag-OT kapag payroll. May hazard pay pa.`,
    },
  ]

  const rubric = defaultTasteRubric('reddit_story', CH.niche)
  let totalCost = 0
  const summary: string[] = []

  for (const ex of EXEMPLARS) {
    const gp = buildStoryGatePrompt({
      channelName: CH.name,
      nicheDescription: CH.niche,
      language: 'taglish',
      tasteRubric: rubric,
      narration: ex.narration,
      title: ex.title,
      logline: ex.logline,
    })
    try {
      const gr = await llmCall({
        templateVersion: STORY_CRITIC_V2_VERSION,
        schema: StoryGateSchema,
        system: gp.system,
        messages: [{ role: 'user', content: gp.userMessage }],
        provider: 'anthropic',
        maxTokens: 512,
      })
      totalCost += gr.costCents
      console.log(`\n${'═'.repeat(70)}`)
      console.log(`[${ex.tag}] "${ex.title}"`)
      console.log(`  ${gr.data.pass ? '✅ PASS' : '❌ FAIL'} — ${gr.data.reason}`)
      summary.push(`${gr.data.pass ? 'PASS' : 'FAIL'} | ${ex.tag}`)
    } catch (err) {
      console.log(`\n[${ex.tag}] GATE ERRORED: ${String(err).slice(0, 160)}`)
      summary.push(`ERROR | ${ex.tag}`)
    }
  }

  console.log(`\n${'═'.repeat(70)}\nCONTROL SUMMARY (gate vs hand-authored exemplars):`)
  for (const s of summary) console.log(`  ${s}`)
  const passes = summary.filter((s) => s.startsWith('PASS')).length
  console.log(`\n  ${passes}/${EXEMPLARS.length} human-authored exemplars PASSED the gate`)
  console.log(`  control cost: ${totalCost}¢`)
  process.exit(0)
})()
