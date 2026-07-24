// Phase B ear A/B — hear the register RANGE appear (the founder's "leans calm" cure). Generates real beds
// with the PRODUCTION music-prompt (buildMusicPrompt) so this is faithful to what reels get:
//   • one OLD monoculture bed (rising_tension) — what EVERY register used to sound like (the 5 old presets
//     were all shades of dread), plus an OLD bed for the two biggest-contrast registers;
//   • one NEW bed per register from its Phase B mood (measured / warm / wondrous / driving / dread).
// Beds are bare (no narration) on purpose — Phase B is about the bed's CHARACTER, judged by ear.
// Usage: pnpm --filter worker exec tsx scripts/ear-register-range.ts   (cwd apps/worker). ~$0.50–0.80.
import '../src/env.js'
void (async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const exec = promisify(execFile)
  const { generateMusic } = await import('@reels/providers')
  const { buildMusicPrompt, MUSIC_MOODS } = await import('@reels/core')

  const OUT = `${process.env.HOME}/Desktop/phase-b-sound`
  mkdirSync(OUT, { recursive: true })
  const LEN = 22_000

  type MoodKey = keyof typeof MUSIC_MOODS
  const bed = async (name: string, moodKey: MoodKey, niche: string): Promise<number> => {
    const m = MUSIC_MOODS[moodKey]
    const prompt = buildMusicPrompt({ toneIntensity: 5, nicheDescription: niche, moodTags: m.moodTags, moodPrompt: m.prompt, musicType: m.type, peakFrac: 0.6, loops: false })
    const res = await generateMusic({ prompt, lengthMs: LEN })
    // Eleven Music → mp3; transcode to m4a for consistent playback.
    const mp3 = join(OUT, `.${name}.mp3`)
    writeFileSync(mp3, res.audio)
    await exec('ffmpeg', ['-i', mp3, '-c:a', 'aac', '-b:a', '192k', '-y', join(OUT, `${name}.m4a`)])
    await exec('rm', ['-f', mp3])
    console.log(`  ✓ ${name}.m4a  [${moodKey} · ${m.type}] ${res.costCents}¢`)
    return res.costCents
  }

  // register → (new Phase B mood, niche, whether to also render its OLD tense bed for a direct pair)
  const REGISTERS: { id: string; newMood: MoodKey; niche: string; alsoOld?: boolean }[] = [
    { id: 'documentary', newMood: 'measured', niche: 'documentary reconstructions of real historical events', alsoOld: true },
    { id: 'drama-warm', newMood: 'warm', niche: 'intimate family drama, true emotional stories' },
    { id: 'childrens', newMood: 'wondrous', niche: "children's bedtime stories, gentle and magical" },
    { id: 'energetic-howto', newMood: 'driving', niche: 'fitness how-to, motivational fast tips', alsoOld: true },
    { id: 'horror', newMood: 'slow_dread', niche: 'creepypasta horror, unsettling encounters' },
  ]
  const OLD_MONOCULTURE: MoodKey = 'rising_tension' // the "everything sounded tense" before

  let cost = 0
  console.log(`\n── OLD (the monoculture — what every register used to get) ──`)
  cost += await bed('OLD-monoculture', OLD_MONOCULTURE, 'generic narrated reel')

  console.log(`\n── NEW (each register's Phase B bed) ──`)
  for (const r of REGISTERS) {
    cost += await bed(`NEW-${r.id}`, r.newMood, r.niche)
    if (r.alsoOld) cost += await bed(`OLD-${r.id}`, OLD_MONOCULTURE, r.niche)
  }

  console.log(`\n→ ${OUT}/  (OLD-* = the old tense monoculture; NEW-* = register-appropriate)`)
  console.log(`  Listen for: does each NEW bed sound like ITS register (documentary measured, energetic driving,`)
  console.log(`  children's warm/wondrous, horror still tense)? And how same-y the OLD ones are by comparison.`)
  console.log(`\ntotal cost: ${cost}¢ ($${(cost / 100).toFixed(2)})`)
  process.exit(0)
})()
