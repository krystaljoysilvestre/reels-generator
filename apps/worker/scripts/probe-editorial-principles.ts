// Editorial-principles evidence gate (2026-08-07) — W1 of the compile-creator-intent plan.
//
// `channel.v1.6` now compiles the channel's OWN rules out of the creator's idea into
// `channels.editorial_principles`, which composes onto the editorial gate's rubric. That means a
// hallucinated rule silently polices every future script on the channel against a standard the creator
// never set. So the bar is not "are the principles good" — it is "did we invent any."
//
// PRE-REGISTERED CRITERIA (written before the run):
//   P1. NO INVENTION (primary): all 4 deliberately bare niches return ''. Any principle emitted for an
//       idea that states no rule FAILS the phase — the derivation goes back to a stricter abstain.
//   P2. GROUNDED: for every principle line emitted on a real idea, an auditor must produce the verbatim
//       supporting sentence from the source, and that quote is substring-checked IN CODE. Bar: ≥90% of
//       lines grounded, ZERO lines whose quote fails the code check (a fabricated quote is worse than a
//       fabricated principle — it means the audit itself can't be trusted).
//   P3. CHECKABLE: no emitted line is an unfalsifiable virtue ("high quality", "engaging",
//       "cinematic"). Judged, and any hit is a prompt bug, not a tuning knob.
//
// WHY AN AUDITOR AND NOT A SUBSTRING CHECK ON THE PRINCIPLES THEMSELVES: principles are deliberately
// REPHRASED into gate-checkable rubric lines ("Avoid exaggerated reactions, screaming, or sensational
// clickbait" → "NEVER / - Scream, gasp, or use sensational clickbait phrasing"), so they are not
// substrings of the source. The auditor bridges that gap and the code check keeps the auditor honest —
// the same trick the destination probe's extractor used, one level up.
//
// Usage (cwd apps/worker):
//   pnpm exec tsx scripts/probe-editorial-principles.ts
//   PRINCIPLES_ONLY=lihim  → just the motivating case (cheap iteration)
// Cost: ~40¢ (8 full channel.v1 derivations + ~4 audits). A derivation is the whole bible, not one
// field, which is why this is dearer than the destination probe's extraction arm.
import '../src/env.js'
import { z } from 'zod'
import { readFileSync, writeFileSync } from 'node:fs'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildChannelDerivationPrompt, ChannelDerivationSchema, CHANNEL_V1_VERSION } = await import(
    '@reels/core/prompts/channel.v1'
  )

  let cost = 0

  // Deliberately bare: subject matter only, no rule of any kind. Any principle here is fabricated by
  // definition. Same four the destination probe used, so the two results are comparable.
  const BARE = [
    { name: 'Night Shift', niche: 'Scary stories. Filipino horror, ghost sightings, aswang, haunted places. New reel every night.' },
    { name: 'Plate Notes', niche: 'Quick Filipino recipes and street food finds around Metro Manila. 60-second cooking reels, budget meals, market hauls.' },
    { name: 'Ledger', niche: 'Personal finance explainers for young professionals — investing, taxes, budgeting, insurance, credit cards.' },
    { name: 'Offcuts', niche: 'Short comedy skits about office life. Meetings, bosses, deadlines, coworkers.' },
  ]

  const AuditSchema = z.object({
    lines: z.array(
      z.object({
        principle: z.string(), // the emitted line, copied
        supported: z.boolean(),
        quote: z.string(), // verbatim from the source — '' when unsupported
        unfalsifiable: z.boolean(), // a virtue rather than a checkable rule
      }),
    ),
  })

  async function audit(niche: string, principles: string) {
    const r = await llmCall({
      templateVersion: 'principles-audit.v0-probe',
      schema: AuditSchema,
      system: `You audit whether each rule in a compiled list was actually stated by the creator, or was invented by the compiler. Be adversarial: your job is to CATCH inventions, not to justify them. A rule that merely suits the subject matter, or that any channel in this genre would want, is NOT supported unless the creator wrote it. Quotes must be copied character-for-character from the source; never paraphrase a quote, and never supply one you cannot find.`,
      messages: [
        {
          role: 'user',
          content: `SOURCE — what the creator wrote:
${niche}

COMPILED RULES (one per '- ' line; ignore the ALL-CAPS headings):
${principles}

For EACH '- ' rule line output an entry:
{ "principle": "the line, copied", "supported": true only if the SOURCE states it, "quote": "the exact sentence from SOURCE that carries it, character-for-character — '' if unsupported", "unfalsifiable": true if the rule is a virtue rather than something checkable against a finished script (e.g. 'high quality', 'engaging', 'cinematic') }

OUTPUT (JSON only): { "lines": [ ... ] }`,
        },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    })
    cost += r.costCents
    return r.data
  }

  async function derive(name: string, niche: string, languages: string[]) {
    const p = buildChannelDerivationPrompt({
      name,
      nicheDescription: niche,
      languages,
      targetPlatforms: ['tiktok', 'youtube_shorts', 'facebook_reels'] as never,
    })
    const r = await llmCall({
      templateVersion: CHANNEL_V1_VERSION,
      schema: ChannelDerivationSchema,
      system: p.system,
      messages: [{ role: 'user', content: p.userMessage }],
      temperature: 0.7,
      maxTokens: 2500,
    })
    cost += r.costCents
    return r.data
  }

  // Inputs: the 3 real channels in the DB + the motivating case + the 4 bare ones.
  const { getDb, channels } = await import('@reels/db')
  const real = (await getDb().select().from(channels)).map((c) => ({
    name: c.name,
    niche: c.nicheDescription,
    languages: c.languages,
    bare: false,
  }))
  const lihim = {
    name: 'Lihim ng Nayon',
    niche: readFileSync(process.env['LIHIM_FILE'] ?? '/tmp/lihim.txt', 'utf8').trim(),
    languages: ['english'],
    bare: false,
  }
  const inputs = [...real, lihim, ...BARE.map((b) => ({ ...b, languages: ['english'], bare: true }))]
  const only = process.env['PRINCIPLES_ONLY']?.toLowerCase()

  const results: Record<string, unknown>[] = []
  for (const input of inputs) {
    if (only && !input.name.toLowerCase().includes(only)) continue
    // One input failing must not lose the other seven runs' spend.
    let d: Awaited<ReturnType<typeof derive>>
    try {
      d = await derive(input.name, input.niche, input.languages)
    } catch (err) {
      console.log(`\n${'─'.repeat(78)}\n${input.name}  DERIVE FAILED — ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`)
      results.push({ name: input.name, bare: input.bare, error: true })
      continue
    }
    const principles = (d.editorialPrinciples ?? '').trim()
    const lineCount = principles.split('\n').filter((l) => l.trim().startsWith('-')).length

    console.log(`\n${'─'.repeat(78)}\n${input.name}  ${input.bare ? '[BARE]' : '[REAL]'}  genre=${d.genreCategory}`)
    if (!principles) {
      console.log('  ABSTAINED (no rules stated) ✓')
      results.push({ name: input.name, bare: input.bare, abstained: true, lineCount: 0, grounded: 0, ungrounded: 0, badQuotes: 0, unfalsifiable: 0 })
      continue
    }
    console.log(principles.split('\n').map((l) => `  │ ${l}`).join('\n'))

    const a = await audit(input.niche, principles)
    // Normalize before the substring check, or the check reports fabrication where there is none.
    // Creator ideas are pasted MARKDOWN: a quoted sentence can carry ** emphasis mid-sentence, and
    // smart quotes/dashes differ between the source and a model's transcription of it. Strip only
    // markup and punctuation VARIANTS — never words — so this can still catch a real fabrication.
    const norm = (s: string) =>
      s
        .replace(/[*_`#]/g, '')
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    const src = norm(input.niche)
    let grounded = 0
    let ungrounded = 0
    let badQuotes = 0
    for (const l of a.lines) {
      // The code check that keeps the auditor honest: a claimed quote must really be in the source.
      const quoteReal = l.quote.trim().length > 0 && src.includes(norm(l.quote))
      if (l.supported && quoteReal) grounded++
      else if (l.supported && !quoteReal) { badQuotes++; console.log(`  ✗ QUOTE NOT IN SOURCE — "${l.principle}" ← "${l.quote}"`) }
      else { ungrounded++; console.log(`  ✗ UNSUPPORTED — "${l.principle}"`) }
      if (l.unfalsifiable) console.log(`  ✗ UNFALSIFIABLE — "${l.principle}"`)
    }
    const unfalsifiable = a.lines.filter((l) => l.unfalsifiable).length
    console.log(`  → ${grounded}/${a.lines.length} grounded · ${ungrounded} unsupported · ${badQuotes} bad quotes · ${unfalsifiable} unfalsifiable`)
    results.push({ name: input.name, bare: input.bare, abstained: false, lineCount, principles, grounded, ungrounded, badQuotes, unfalsifiable, audited: a.lines.length })
  }

  // ── Pre-registered verdicts ─────────────────────────────────────────────────────────────────────
  const bareFired = results.filter((r) => r.bare && !r.abstained)
  const totalLines = results.reduce((s, r) => s + (Number(r.audited) || 0), 0)
  const totalGrounded = results.reduce((s, r) => s + (Number(r.grounded) || 0), 0)
  const totalBadQuotes = results.reduce((s, r) => s + (Number(r.badQuotes) || 0), 0)
  const totalUnfalsifiable = results.reduce((s, r) => s + (Number(r.unfalsifiable) || 0), 0)
  const groundedPct = totalLines ? Math.round((totalGrounded / totalLines) * 100) : 100

  console.log(`\n${'═'.repeat(78)}\nPRE-REGISTERED VERDICTS`)
  console.log(`  P1 NO INVENTION (0 of ${BARE.length} bare ideas emit a rule): ${bareFired.length} fired → ${bareFired.length === 0 ? 'PASS' : 'FAIL'}`)
  if (bareFired.length) console.log(`     fired on: ${bareFired.map((r) => r.name).join(', ')}`)
  console.log(`  P2 GROUNDED (≥90% of lines, 0 bad quotes):  ${groundedPct}% of ${totalLines} lines, ${totalBadQuotes} bad quotes → ${groundedPct >= 90 && totalBadQuotes === 0 ? 'PASS' : 'FAIL'}`)
  console.log(`  P3 CHECKABLE (0 unfalsifiable virtues):     ${totalUnfalsifiable} → ${totalUnfalsifiable === 0 ? 'PASS' : 'FAIL'}`)
  writeFileSync('probe-principles.json', JSON.stringify({ results, groundedPct, totalLines }, null, 2))
  console.log(`\nfull output → apps/worker/probe-principles.json`)
  console.log(`TOTAL COST: ${cost.toFixed(2)}¢`)
  process.exit(0)
})()
