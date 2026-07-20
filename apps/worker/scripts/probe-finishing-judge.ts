// Consolidated finishing judge (2026-07-20, owner picked this over a stack of per-axis passes). ONE
// judge reads the finished narration as a FIRST-TIME LISTENER and flags every axis at once —
// naturalness (real spoken Taglish), orientation (can you follow who/where/why in time), turn-landing
// (pivotal beat dramatized not summarized), agency, announced-theme, rhythm. A surgical forcer fixes
// exactly the flagged issues (keep everything else); loop until clean (cap). Being the LAST stage with
// a naturalness check every iteration, it also fixes the ordering bug (no un-naturalized rewrite ships).
//
// This demo runs the finishing loop on the TWO real stories the owner just critiqued (piano: orientation
// + naturalness; sinigang: announced realization + announced-theme ending), so we can see if the one
// judge catches what a human caught. Usage: pnpm --filter worker exec tsx scripts/probe-finishing-judge.ts
import '../src/env.js'
import { z } from 'zod'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const lang = 'taglish'

  const INPUTS: Array<{ title: string; narration: string }> = [
    {
      title: 'yung piyano ni Lola (post turn-landing — owner: missing context + unnatural)',
      narration: `Ang dami naming tinatapon — twalya, damit, rosaryo na kupas na — at hindi ako makagalaw sa harap ng isang lumang piyano na hindi ko alam na nandoon. Sa sulok, nakabalot ng tela. Parang inihanda para sa isang bagay na hindi natuloy.

Nakita ko 'yung mga sheet music sa loob ng bench. Gawa-kamay ang sulat — maingat, pamilyar. Tapos nakita ko 'yung pangalan niya para sa estudyante niya. 'My M.' Ako 'yun. Ako talaga.

Nag-ring ang telepono. Tito. Kinuha ko.

'Buyer bukas,' sabi niya. 'Lahat — wala nang exemption.'

Nakatayo ako sa tabi ng piyano. Isang kamay ko nasa tela pa — malambot, makapal, parang binalot nang may ingat. Hindi ko inangat ang kamay.

'Hindi kasama ang piyano.'

Matagal bago siya sumagot. Narinig ko ang paghinga niya — mabilis, pababa.

'Ano? Lahat, M. Sabi natin—'

'Hindi kasama ang piyano, Tito.'

Tumaas ang boses niya. Normal lang, alam ko. Pero hindi ko na kinausap pa siya — hindi ko sinagot ang susunod na ring, at hindi ko binalik ang tawag.

Nilapitan ko 'yung unang piraso — simple lang, pero ilang beses kong tinigas ang mga kamay. Hindi mo naman ako kailanman natuturuan, Lola. Pero nandito ka. Sa bawat 'push gently here' at 'breathe' sa gilid ng papel — ikaw 'yun. Nag-iintay.

Hindi ko alam kung kailan ako huminto sa pagbisita. Wala akong specific na dahilan. Basta, tumigil lang ako — at siya, hindi tumigil sa pag-iintay.

Yung piyano, nasa apartment ko na ngayon. Hindi halos kasya. Pero iniuwi ko — hindi dahil marunong akong tumugtog, kundi dahil siya ang nag-iwan ng pintuan bukas, kahit hindi na siya nakaabang.`,
    },
    {
      title: 'sinigang kay Lola (gate failed it — announced realization + announced-theme ending)',
      narration: `Alam ko naman na ayaw niyang umiyak, kaya hindi rin ako umiyak. Ganun kami ni Lola — nagkakaintindihan kahit walang sinasabi.

Habang naghahanap kami ng mga sibuyas, ginagawa namin 'yung paborito kong sinigang na baboy — 'yung may amoy ng sampalok na pumupuno sa buong bahay. Bukas, lilipat na siya kay Tita. Malayo. Kaya nagluto-luto kami para may magawa, para hindi kailangan magkatitigan nang matagal.

Tapos, tinanong niya ako — tanong na hindi ko inasahan. 'Luto mo ba 'to pag-alis ko?'

Doon ko narealize — hindi 'yun tungkol sa pagkain.

Nagsimula akong sumagot ng 'oo naman' — 'yung madaling sagot, 'yung hindi masakit. Pero iba ang lumabas. 'Hindi ko alam, Lola. Hindi pa ako handa.'

Bumaba ang kutsilyo niya sa tabla. Biglang tumahimik ang kusina.

Tiningnan niya ako. At nakita ko doon — hindi siya gumaan ang loob. Pinalala ko pa.

Kinuha niya ang sandok. Ibinaba niya ang apoy. Ipinahinga niya ang kamay niya sa kamay ko nang isang sandali — tapos itinuro niya ang susunod na hakbang. Walang salita. Hawak-hawak niya ako hanggang katapusan ng recipe.

Lumabas ako sa kusina niya na may dala — hindi ginhawa, kundi 'yung buong bigat ng pagmamahal na pinili naming sabihin.`,
    },
  ]

  const IssueSchema = z.object({
    axis: z.enum(['naturalness', 'orientation', 'turn', 'agency', 'announced_theme', 'rhythm']),
    problem: z.string(), // what's wrong + the offending line, one sentence
  })
  const FinishJudgeSchema = z.object({
    issues: z.array(IssueSchema),
    summary: z.string(),
  })
  const MAX_FIX = 3
  let totalCost = 0

  const judge = async (narration: string) => {
    const res = await llmCall({
      templateVersion: 'finishing-judge.v0-probe',
      schema: FinishJudgeSchema,
      system: `You are the FINISHING JUDGE for a short first-person ${lang} drama for social video. Read it as a FIRST-TIME LISTENER who hears it ONCE, cannot pause, and knows nothing going in. Flag EVERY real problem on these axes (add one issue per problem, with the offending line quoted; if an axis is fine, say nothing about it):
- naturalness: does every line sound like a real Filipino actually talking? Flag word-for-word-translated, bookish/literary, or garbled Taglish and wrong word choices (quote the phrase; e.g. handwriting is "sulat-kamay", not "gawa-kamay").
- orientation: by the time each emotional beat arrives, does the listener already know WHO these people are, WHERE we are, and WHY it matters? Flag essential context that lands too late or never (e.g. that this is a dead/departed grandmother's house being cleared, or a relationship the story depends on).
- turn: is the pivotal beat (the decision/reversal/confession the story rides on) DRAMATIZED — concrete action, real words, room to land — or COLLAPSED into summary/announcement ("Doon ko narealize…", "tapos wala")?
- agency: is the story driven by the narrator's own costly choice, or do things just happen to them?
- announced_theme: does the narrator ever SPELL OUT the meaning/feeling/moral instead of letting it land (e.g. "…kundi 'yung buong bigat ng pagmamahal na pinili naming sabihin")?
- rhythm: is the sentence rhythm varied, or a monotonous string of short fragments?
Be honest and specific; do NOT invent problems; warm, plain feeling is GOOD, not a problem. An empty issues list means it ships as-is.`,
      messages: [{ role: 'user', content: `NARRATION:\n${narration}\n\nOUTPUT (JSON only):\n{ "issues": [ { "axis": "orientation", "problem": "" } ], "summary": "" }` }],
      provider: 'anthropic',
      maxTokens: 1500,
    })
    totalCost += res.costCents
    return res.data
  }

  const force = async (narration: string, issues: Array<z.infer<typeof IssueSchema>>) => {
    const list = issues.map((i, n) => `${n + 1}. [${i.axis}] ${i.problem}`).join('\n')
    const res = await llmCall({
      templateVersion: 'finishing-force.v0-probe',
      schema: z.object({ narration: z.string().min(1) }),
      system: `You are a line editor for first-person ${lang} drama for social video. Fix EXACTLY the listed problems and nothing else. Hard rules:
- Fix each issue surgically; keep every other line, the plot, the narrator's choice, and the ending intact.
- Every line must sound like a real Filipino actually SPEAKING — natural spoken ${lang}, never translated, bookish, or garbled.
- Do NOT announce or explain feelings or state a moral; let beats land through concrete action and real words.
- Add establishing context (for orientation issues) with the LIGHTEST touch — a few words woven in early, never a backstory dump.
- Do NOT change proper nouns, names, or concrete objects. Keep it short-form (roughly the same length).
Return the full narration.`,
      messages: [{ role: 'user', content: `PROBLEMS TO FIX:\n${list}\n\nNARRATION:\n${narration}\n\nReturn JSON: { "narration": "..." }` }],
      provider: 'anthropic',
      temperature: 0.6,
      maxTokens: 2000,
    })
    totalCost += res.costCents
    return res.data.narration
  }

  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const finishingLoop = async (narration: string) => {
    const trail: Array<{ n: number; issues: Array<z.infer<typeof IssueSchema>> }> = []
    let current = narration
    let v = await judge(current)
    trail.push({ n: 0, issues: v.issues })
    let fixes = 0
    while (v.issues.length > 0 && fixes < MAX_FIX) {
      fixes++
      const rewritten = await force(current, v.issues)
      const dw = Math.abs(wc(rewritten) - wc(current)) / Math.max(1, wc(current))
      if (dw > 0.6) { trail.push({ n: fixes, issues: [{ axis: 'naturalness', problem: `rewrite rejected (Δwords ${Math.round(dw * 100)}%)` }] }); break }
      current = rewritten
      v = await judge(current)
      trail.push({ n: fixes, issues: v.issues })
    }
    return { narration: current, changed: current !== narration, clean: v.issues.length === 0, fixes, trail }
  }

  for (const input of INPUTS) {
    console.log(`\n${'═'.repeat(78)}\n[${input.title}]`)
    try {
      const r = await finishingLoop(input.narration)
      for (const t of r.trail) {
        if (t.n === 0) console.log(`  JUDGE (base): ${t.issues.length} issue(s)`)
        else console.log(`  JUDGE (after fix ${t.n}): ${t.issues.length} issue(s)`)
        for (const i of t.issues) console.log(`    - [${i.axis}] ${i.problem}`)
      }
      console.log(`  → ${r.clean ? 'CLEAN' : `still ${r.trail[r.trail.length - 1]!.issues.length} issue(s) after ${r.fixes} fix(es)`}`)
      if (r.changed) console.log(`${'─'.repeat(78)}\n[FINISHED]\n${r.narration}`)
      else console.log(`${'─'.repeat(78)}\n[FINISHED] — unchanged (judge found nothing to fix)`)
    } catch (err) {
      console.log(`  FAILED: ${String(err).slice(0, 200)}`)
    }
  }
  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
