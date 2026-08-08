// Channel-idea utilization report (2026-08-07).
//
// Answers one question about a channel idea BEFORE anyone commits to it: of everything the creator
// wrote, what does the engine actually use — and how hard?
//
// It runs the real production derivation (channel.v1, the same prompt the wizard calls), then sorts
// every derived field by HOW it is consumed downstream, because the difference matters enormously:
//
//   TIER 1 — HARD SWITCH        the value selects a code path (writer identity, genre module, chain).
//                               Get it wrong and a different program runs.
//   TIER 2 — STRUCTURED DATA    the value is injected into prompts as its own labelled field, so the
//                               model can't miss it (tone axes, world bible).
//   TIER 3 — FREE TEXT          the ENTIRE niche description is pasted verbatim into the planner,
//                               writer and gate as one line: `Niche: <everything you wrote>`. Read,
//                               but with no dedicated weight and no validation. Anything in the idea
//                               that no field captured survives ONLY here.
//
// Then a second pass maps the creator's own sentences onto those destinations, so the residue — the
// parts that live only in Tier 3 — is visible instead of assumed.
//
// Reads nothing from and writes nothing to the DB. This does not create a channel.
//
// Usage (cwd apps/worker):
//   IDEA_FILE=/tmp/idea.txt CHANNEL_NAME='My Channel' pnpm exec tsx scripts/channel-idea-utilization.ts
//   LANGS=english PLATFORMS=youtube_shorts,tiktok  (defaults: english / tiktok+youtube_shorts+facebook_reels)
// Cost: ~3-5¢ (one derivation + one mapping call).
import '../src/env.js'
import { z } from 'zod'
import { readFileSync } from 'node:fs'

void (async () => {
  const { llmCall } = await import('@reels/providers')
  // channel.v1 isn't re-exported through prompts-bridge (the worker never derives channels — the web
  // wizard does), so import the module directly, exactly as apps/web's derive route does.
  const { buildChannelDerivationPrompt, ChannelDerivationSchema, CHANNEL_V1_VERSION } = await import(
    '@reels/core/prompts/channel.v1'
  )

  const file = process.env['IDEA_FILE']
  if (!file) throw new Error('IDEA_FILE=<path to the channel idea text> is required')
  const niche = readFileSync(file, 'utf8').trim()
  const name = process.env['CHANNEL_NAME'] ?? 'Untitled Channel'
  const languages = (process.env['LANGS'] ?? 'english').split(',').map((s) => s.trim())
  const platforms = (process.env['PLATFORMS'] ?? 'tiktok,youtube_shorts,facebook_reels').split(',').map((s) => s.trim())

  let cost = 0
  console.log(`\nCHANNEL: ${name}`)
  console.log(`IDEA: ${niche.length} chars, ${niche.split(/\n+/).filter(Boolean).length} paragraphs/lines`)
  console.log(`LANGUAGES: ${languages.join(', ')}   PLATFORMS: ${platforms.join(', ')}\n`)

  // ── 1. The real derivation ────────────────────────────────────────────────────────────────────
  const prompt = buildChannelDerivationPrompt({ name, nicheDescription: niche, languages, targetPlatforms: platforms as never })
  const derived = await llmCall({
    templateVersion: CHANNEL_V1_VERSION,
    schema: ChannelDerivationSchema,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.userMessage }],
    temperature: 0.7,
    maxTokens: 2500,
  })
  cost += derived.costCents
  const d = derived.data

  // Where each derived field is consumed. Hand-maintained against the pipeline — if a consumer moves,
  // fix it here; a stale map is worse than none.
  const TIER1: [string, unknown, string][] = [
    ['genreCategory', d.genreCategory, 'picks the WRITER IDENTITY (its questions, taboos, registers, selection lens), the mechanics library, the element palette, the scene-prompt genre module, and the default gate rubric'],
    ['narrativeStyle', d.narrativeStyle ?? '(none)', 'style layer biasing the planner\'s element + mechanic choices (story-styles.v1)'],
    ['narrativeVoice', d.narrativeVoice ?? '(none)', 'the narrator\'s written sound in the writer (NOT the TTS voice)'],
    ['presentation', d.presentation || '(none — each story decides)', 'narrator perspective bias the story analyzer reasons from'],
    ['targetSeconds', d.targetSeconds, `→ targetWords (~2.5 w/s) — the length contract handed to the writer`],
    ['stylePreset', `${String(d.stylePreset).slice(0, 90)}…`, 'prepended to EVERY scene image prompt for the life of the channel'],
    ['captionPreset', d.captionPreset, 'the burned-in caption animation the renderer uses'],
    ['audioMood.type', d.audioMood.type, 'the shape of the music bed the mixer aligns to the reel\'s peak'],
    ['voiceSearchKeyword', d.voiceSearchKeyword, 'matches/recommends ElevenLabs narrator voices'],
  ]
  const TIER2: [string, unknown, string][] = [
    ['toneConfig', JSON.stringify(d.toneConfig), 'injected into planner AND writer as "Tone calibration (0–10 scales)"'],
    ['worldBible', JSON.stringify(d.worldBible), 'injected into planner ("ideas must fit this world"), writer, and scene prompts'],
    ['audioMood.prompt', d.audioMood.prompt, 'the text-to-music brief for the signature bed'],
    ['tagline', d.tagline, 'shown in the UI — NOT read by any story prompt'],
  ]

  console.log('══ TIER 1 — HARD SWITCHES (these select code paths) ══')
  for (const [k, v, why] of TIER1) console.log(`  ${k.padEnd(20)} ${String(v)}\n${' '.repeat(22)}↳ ${why}`)
  console.log('\n══ TIER 2 — STRUCTURED PROMPT DATA (own labelled field, cannot be missed) ══')
  for (const [k, v, why] of TIER2) console.log(`  ${k.padEnd(20)} ${String(v)}\n${' '.repeat(22)}↳ ${why}`)
  console.log('\n══ TIER 3 — FREE TEXT ══')
  console.log(`  nicheDescription     your ENTIRE ${niche.length}-char idea, pasted verbatim as one line`)
  console.log(`  ${' '.repeat(20)} ↳ planner system prompt ("Niche: …"), writer system prompt, gate system prompt`)
  console.log(`  ${' '.repeat(20)} ↳ no weighting, no validation, no per-claim enforcement`)
  console.log('\n══ NOT DERIVED AT ALL ══')
  console.log('  tasteRubric          empty → the gate falls back to the GENRE DEFAULT rubric, not your bar')
  console.log('  destination          no channel-level "where every story leaves the viewer" exists;')
  console.log('                       the planner re-invents emotionalDestination per reel')
  if (d.clarifyingQuestions.length) {
    console.log('\n══ THE WIZARD WOULD ASK YOU ══')
    for (const q of d.clarifyingQuestions) console.log(`  · ${q.question}  (e.g. ${q.examples})\n    → appended to the idea as: "${q.prefix} <your answer>"`)
  }

  // ── 2. Map the creator's own sentences onto those destinations ────────────────────────────────
  const MapSchema = z.object({
    claims: z.array(
      z.object({
        text: z.string(), // the creator's own words, quoted
        lands: z.enum(['tier1', 'tier2', 'tier3_only']),
        field: z.string(), // the field it landed in, or '' for tier3_only
        note: z.string(),
      }),
    ),
  })
  const mapped = await llmCall({
    templateVersion: 'channel-utilization-map.v0-tool',
    schema: MapSchema,
    system: `You audit how much of a creator's channel description survives into a structured channel profile. For each meaningful CLAIM the creator made, decide where it ended up. Be strict: a claim only "lands" in a field if that field's VALUE actually encodes it. A claim that is merely compatible with the profile, or that is only implicitly present because the whole description is pasted into prompts, is tier3_only. Do not be generous — the point of this audit is to find what got lost.`,
    messages: [
      {
        role: 'user',
        content: `THE CREATOR WROTE:
${niche}

THE DERIVED PROFILE:
TIER 1 (hard switches): ${JSON.stringify({ genreCategory: d.genreCategory, narrativeStyle: d.narrativeStyle, narrativeVoice: d.narrativeVoice, presentation: d.presentation, targetSeconds: d.targetSeconds, captionPreset: d.captionPreset, stylePreset: d.stylePreset, voiceSearchKeyword: d.voiceSearchKeyword, audioMoodType: d.audioMood.type })}
TIER 2 (structured data): ${JSON.stringify({ toneConfig: d.toneConfig, worldBible: d.worldBible, audioMoodPrompt: d.audioMood.prompt, tagline: d.tagline })}
TIER 3: the full description text, pasted verbatim into the planner/writer/gate prompts with no structure.

For every distinct claim in the description — subject matter, audience, purpose, format, structure, tone, look, sound, constraints — output where it landed.

OUTPUT (JSON only):
{ "claims": [ { "text": "the creator's own words, quoted briefly", "lands": "tier1" | "tier2" | "tier3_only", "field": "the field name, or '' ", "note": "one short clause" } ] }`,
      },
    ],
    temperature: 0.2,
    maxTokens: 2500,
  })
  cost += mapped.costCents

  const claims = mapped.data.claims
  const t3 = claims.filter((c) => c.lands === 'tier3_only')
  console.log('\n══ YOUR WORDS → WHERE THEY LANDED ══')
  for (const c of claims) {
    const tag = c.lands === 'tier3_only' ? 'FREE TEXT ONLY' : c.lands.toUpperCase()
    console.log(`  [${tag.padEnd(14)}] ${c.field ? c.field.padEnd(18) : ''.padEnd(18)} "${c.text.slice(0, 80)}"`)
    if (c.note) console.log(`  ${' '.repeat(37)}${c.note}`)
  }
  console.log(`\n  ${claims.length - t3.length}/${claims.length} claims captured by a structured field · ${t3.length} survive only as free text`)

  console.log(`\nTOTAL COST: ${cost.toFixed(2)}¢`)
  process.exit(0)
})()
