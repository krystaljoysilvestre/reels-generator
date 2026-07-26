// Phase C SPIKE — Channel Audio Identity: can the mechanism produce "one channel, many stories"?
//
// The load-bearing unknown BEFORE any Audio Bible schema/architecture: does any available lever give a
// channel a recognizable sonic identity across reels (coherence) without making every reel sound the same
// (repetition)? Founder's ear decides; pre-registered outcomes in the plan (graduate → spec, or park).
//
// FINDING (2026-07-24): the `seed` identity lever the research flagged is UNAVAILABLE on our path —
// ElevenLabs `/v1/music` returns 422 "seed cannot be used with prompt" (seed is a composition_plan-only
// feature). So the seeded-bespoke arm is dropped; the two levers that actually work are tested:
//   baseline  — today's production behavior: bespoke bed per reel from the shared PALETTE prompt. Identity
//               comes only from the palette text; each reel is an independent Eleven Music take.
//   signature — ONE bed generated from the palette (no per-reel tilt), REUSED for every reel. Reuse IS the
//               consistency (identical bed) — the strongest identity + lowest cost; in production the mixer's
//               envelope + SFX + narration differentiate reels. The ear question: is one bed under every reel
//               acceptable, or too same-y?
// Faithful to production: prompts via buildMusicPrompt (the real composer), beds via generateMusic.
//
// Usage: pnpm --filter worker exec tsx scripts/spike-channel-identity.ts   (cwd apps/worker). ~4 beds ≈ 25¢.
import '../src/env.js'
void (async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const exec = promisify(execFile)
  const { generateMusic } = await import('@reels/providers')
  const { buildMusicPrompt, MUSIC_MOODS } = await import('@reels/core')

  const OUT = `${process.env.HOME}/Desktop/phase-c-identity`
  mkdirSync(OUT, { recursive: true })
  const LEN = 22_000

  // ── The synthetic channel: a history-stories channel with a DISTINCTIVE palette (recognizability needs
  // character — a generic "cinematic bed" can't be identified as anyone's). Plays the audioMood.prompt role.
  const CHANNEL_PALETTE =
    'The channel signature: warm analog string quartet over soft felt piano, with a faint vinyl/tape texture underneath — organic, slightly nostalgic chamber sound, never synthetic, never percussion-led.'
  const NICHE = 'true stories from history, told with warmth and wonder'

  type MoodKey = keyof typeof MUSIC_MOODS
  const REELS: { id: string; mood: MoodKey }[] = [
    { id: '1-hopeful', mood: 'hopeful' },     // a triumph story
    { id: '2-sorrowful', mood: 'sorrowful' }, // a tragedy
    { id: '3-wondrous', mood: 'wondrous' },   // a curiosity/wonder story
  ]

  const reelPrompt = (mood: MoodKey): string => {
    const m = MUSIC_MOODS[mood]
    return buildMusicPrompt({
      audioMood: { prompt: CHANNEL_PALETTE, type: m.type, moodTags: [] },
      toneIntensity: 4, nicheDescription: NICHE, moodTags: m.moodTags, moodPrompt: m.prompt, musicType: m.type, peakFrac: 0.6, loops: false,
    })
  }
  const signaturePrompt = (): string =>
    buildMusicPrompt({
      audioMood: { prompt: CHANNEL_PALETTE, type: 'drone_swell', moodTags: [] },
      toneIntensity: 4, nicheDescription: NICHE, moodTags: ['warm', 'nostalgic'], musicType: 'drone_swell', peakFrac: 0.6, loops: false,
    })

  const bed = async (name: string, prompt: string): Promise<number> => {
    if (existsSync(join(OUT, `${name}.m4a`))) { console.log(`  · ${name}.m4a exists — skip`); return 0 }
    const res = await generateMusic({ prompt, lengthMs: LEN })
    const mp3 = join(OUT, `.${name}.mp3`)
    writeFileSync(mp3, res.audio)
    await exec('ffmpeg', ['-i', mp3, '-c:a', 'aac', '-b:a', '192k', '-y', join(OUT, `${name}.m4a`)])
    await exec('rm', ['-f', mp3])
    console.log(`  ✓ ${name}.m4a  ${res.costCents}¢`)
    return res.costCents
  }

  let cost = 0
  console.log(`⚗ Phase C identity spike · channel="${NICHE}" · baseline (palette) vs signature (reuse)\n`)

  console.log(`── BASELINE (today: bespoke per reel from the shared palette — how much identity do we already have?) ──`)
  for (const r of REELS) cost += await bed(`baseline-${r.id}`, reelPrompt(r.mood))

  console.log(`\n── SIGNATURE (one palette bed, reused for EVERY reel) ──`)
  cost += await bed(`signature-bed`, signaturePrompt())

  console.log(`\n→ ${OUT}/`)
  console.log(`
THE EAR TEST (identity is a taste judgment — no automated verdict):
  1. Play baseline-1/2/3 back to back: do they sound like ONE channel's three stories, or three strangers?
     (This is what a channel sounds like TODAY — identity from the shared palette only.)
  2. Play signature-bed, and imagine it under all three stories (the mixer + SFX + narration differ per reel):
     is one recurring bed a recognizable channel signature, or too same-y?
The question for Phase C: is the palette-only identity (baseline) already enough? Does a reused signature bed
add enough recognizability to be worth a per-channel bed (identity + cost win), or lose too much per-story fit?
Note: the "seed" lever is OUT (ElevenLabs 422s seed+prompt — composition_plan-only); recorded in the finding.`)
  console.log(`\ntotal cost this run: ${cost}¢`)
  process.exit(0)
})()
