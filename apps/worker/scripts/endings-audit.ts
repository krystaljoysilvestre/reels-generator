// Endings audit — the measuring instrument for the endings lap (2026-08-06).
//
// Reads stored stories (or a JSON file of {genre,title,body} for probe batches) and grades ONLY the
// ending on three axes the founder's complaint decomposes into:
//   1. DELETION TEST  — cut the closing lines: does the viewer lose information? (nothing lost = the
//      ending is decoration on a payoff that already happened — "terminal exposition")
//   2. landingKind    — WHAT the ending places (object/place/action/image/question/aphorism/summary).
//      This is the MONOCULTURE TRIPWIRE: if a criterion change collapses the histogram to one kind,
//      we traded one AI-tell for another and the criterion comes back out.
//   3. apparentEffect — where a viewer plausibly LANDS (the Layer-3 baseline, before any planned
//      viewerDestination exists).
//
// Zero writes. Reads only. Usage:
//   pnpm --filter worker exec tsx scripts/endings-audit.ts            # stored stories
//   pnpm --filter worker exec tsx scripts/endings-audit.ts probe.json # [{genre,title,body}] batch
import '../src/env.js'
import { z } from 'zod'

const VerdictSchema = z.object({
  // models return this as a string OR as an array of sentences — accept both
  closingLines: z
    .union([z.string(), z.array(z.string()).transform((a) => a.join(' '))])
    .describe('the exact closing lines you judged, quoted from the story'),
  deletionLoss: z.enum(['nothing', 'some', 'essential']),
  terminalExposition: z.boolean(),
  landingKind: z.enum(['object', 'place', 'action', 'image', 'question', 'aphorism', 'summary', 'other']),
  apparentEffect: z.string().describe('where a viewer plausibly lands, in <=8 words'),
  why: z.string().describe('one sentence of evidence quoting the text'),
})

const SYSTEM = `You judge ONLY how a short-video narration ENDS. You are not grading the story.

Read the whole narration for context, then isolate its CLOSING LINES (the last 1-3 sentences).

1. THE DELETION TEST — imagine cutting those closing lines. What INFORMATION or CONCRETE THING does the viewer lose? Judge substance, NOT whether the lines feel conclusive. A line can feel like a satisfying ending and still lose nothing when cut — that is the failure you are here to catch.
   - "nothing": the closing lines restate, summarize, or interpret something the story already delivered. Cutting them removes no fact, no image, no consequence. An aphorism or a reframe of the already-stated idea is ALWAYS "nothing", however well written.
   - "some": they add a beat of resolution or flavour, but no new fact, image, or consequence.
   - "essential": they deliver something the story does not otherwise have — a new concrete image, the turn's consequence, the answer to the question the opening asked.
   Ask literally: "if I deleted this, what would the viewer not know or not see?" If the honest answer is "nothing new — the story already said that", answer "nothing".

2. terminalExposition — TRUE if the closing lines name the story's own meaning or feeling instead of placing a concrete thing ("that's all it takes to remind us…", "shows us that…", "we're all just…", or glossing an image with what it means). Naming a moral warmly is NOT automatically this — interpreting your own picture is.

3. landingKind — what the closing lines actually PLACE: object / place / action / image / question / aphorism / summary / other.

4. apparentEffect — where a viewer plausibly lands (e.g. "uneasy about mirrors", "curious, looks around", "wants to try it tonight", "nothing in particular").

Quote real text as evidence. Judge what is on the page, not what was intended.

Output JSON with EXACTLY these six keys and no others:
{
  "closingLines": "the last 1-3 sentences, quoted verbatim from the narration",
  "deletionLoss": "nothing" | "some" | "essential",
  "terminalExposition": true | false,
  "landingKind": "object" | "place" | "action" | "image" | "question" | "aphorism" | "summary" | "other",
  "apparentEffect": "where a viewer plausibly lands, 8 words or fewer",
  "why": "one sentence of evidence quoting the text"
}
Do NOT invent other keys (no "deletionTest"). deletionLoss carries ONLY the enum word; put reasoning in "why".`

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { readFileSync, writeFileSync } = await import('node:fs')

  type Item = { genre: string; title: string; body: string; peak?: string | null }
  let items: Item[] = []
  const file = process.argv[2]

  if (file) {
    items = JSON.parse(readFileSync(file, 'utf8')) as Item[]
    console.log(`loaded ${items.length} stories from ${file}\n`)
  } else {
    const { getDb, stories, channels } = await import('@reels/db')
    const { eq, desc } = await import('drizzle-orm')
    const rows = await getDb()
      .select({
        title: stories.title, body: stories.body, peak: stories.twistAnchor,
        genre: channels.genreCategory,
      })
      .from(stories)
      .innerJoin(channels, eq(stories.channelId, channels.id))
      .orderBy(desc(stories.createdAt))
    items = rows.map((r) => ({ genre: r.genre, title: r.title, body: r.body, peak: r.peak }))
    console.log(`loaded ${items.length} stored stories\n`)
  }

  let cents = 0
  const results: Array<Item & z.infer<typeof VerdictSchema>> = []

  for (const [i, it] of items.entries()) {
    try {
      const res = await llmCall({
        templateVersion: 'endings-audit.v1',
        schema: VerdictSchema,
        system: SYSTEM,
        messages: [{ role: 'user', content: `GENRE: ${it.genre}\nTITLE: ${it.title}\n\nNARRATION:\n${it.body}\n\nOUTPUT JSON only.` }],
        temperature: 0.2,
        maxTokens: 700,
      })
      cents += res.costCents
      results.push({ ...it, ...res.data })
      const flag = res.data.deletionLoss === 'nothing' || res.data.terminalExposition ? '✗' : '✓'
      console.log(`${flag} [${it.genre}] "${it.title}"`)
      console.log(`   loss=${res.data.deletionLoss} exposition=${res.data.terminalExposition} kind=${res.data.landingKind}`)
      console.log(`   lands: ${res.data.apparentEffect}`)
      console.log(`   close: "${res.data.closingLines.slice(0, 120)}"`)
      console.log(`   why:   ${res.data.why}\n`)
    } catch (e) {
      console.warn(`! ${i} [${it.genre}] "${it.title}" judge failed: ${String(e).slice(0, 700)}\n`)
    }
  }

  // ── Per-genre tally + the monoculture histogram ──
  const byGenre = new Map<string, typeof results>()
  for (const r of results) byGenre.set(r.genre, [...(byGenre.get(r.genre) ?? []), r])
  console.log('═'.repeat(64))
  for (const [genre, rs] of [...byGenre].sort()) {
    const fails = rs.filter((r) => r.deletionLoss === 'nothing' || r.terminalExposition).length
    console.log(`${genre.padEnd(15)} ${fails}/${rs.length} weak endings`)
  }
  const kinds = new Map<string, number>()
  for (const r of results) kinds.set(r.landingKind, (kinds.get(r.landingKind) ?? 0) + 1)
  console.log(`\nlandingKind histogram (monoculture tripwire — diversity is the health signal):`)
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${'█'.repeat(n)} ${n}`)
  console.log(`\ndistinct landing kinds: ${kinds.size}/8`)
  console.log(`judge spend: ${cents}¢`)

  const out = process.env.ENDINGS_AUDIT_OUT
  if (out) { writeFileSync(out, JSON.stringify(results, null, 2)); console.log(`report → ${out}`) }
  process.exit(0)
})()
