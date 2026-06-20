import { readFileSync, writeFileSync } from 'node:fs'

// Seeds the Presets shelf: generates audibly-distinct background beds across niches + moods
// (ElevenLabs Music), uploads each to R2, and rewrites packages/core/src/audio/preset-beds.data.ts.
// Run once: apps/worker/node_modules/.bin/tsx apps/worker/scripts/seed-preset-beds.ts
// Re-running regenerates the whole library.

const REPO = '/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator'
const DATA_FILE = `${REPO}/packages/core/src/audio/preset-beds.data.ts`
const LENGTH_MS = 30_000

// ~3 DISTINCT variations per niche so each channel gets a varied pool to draw from per reel.
// Niche + moodTags drive ranking; the niche label groups them. ALL beds are flat/loopable
// (type 'low_drone', no build), instrumental, and steady — so they loop under narration and the
// mixer's volume envelope (not the track) provides any peak emphasis. Each prompt is audibly
// different. The shared INSTRUMENTAL + SEAMLESS-LOOP constraint is appended at generation time.
const BEDS = [
  // Horror
  { id: 'horror-dread', niche: 'Horror', mood: 'Dread', type: 'low_drone', moodTags: ['dread', 'dark', 'slow', 'sparse'], prompt: 'slow dread-soaked low drone, deep sub-bass, sparse and distant, cold and ominous, no melody' },
  { id: 'horror-creeping', niche: 'Horror', mood: 'Creeping', type: 'low_drone', moodTags: ['creeping', 'dissonant', 'tense', 'eerie'], prompt: 'creeping dissonant low strings, sustained unease, slow and steady, unsettling, no percussion' },
  { id: 'horror-haunting', niche: 'Horror', mood: 'Haunting', type: 'low_drone', moodTags: ['haunting', 'eerie', 'fragile', 'unsettling'], prompt: 'haunting sparse bell-like tones over a dark ambient hum, fragile and unsettling, slow and steady' },
  // Thriller
  { id: 'thriller-tension', niche: 'Thriller', mood: 'Tension', type: 'low_drone', moodTags: ['tense', 'dark', 'cinematic', 'steady'], prompt: 'tense sustained string bed, steady low pulse, ongoing unease, dark and cinematic, no percussion' },
  { id: 'thriller-pursuit', niche: 'Thriller', mood: 'Pursuit', type: 'low_drone', moodTags: ['urgent', 'driving', 'intense', 'steady'], prompt: 'driving steady low synth pulse, urgent and propulsive, consistent momentum, no big hits' },
  { id: 'thriller-suspense', niche: 'Thriller', mood: 'Suspense', type: 'low_drone', moodTags: ['suspense', 'cold', 'restrained', 'ominous'], prompt: 'cold suspended pad, faint steady pulse, restrained dread, minimal and tense, no melody' },
  // True crime
  { id: 'truecrime-unease', niche: 'True crime', mood: 'Unease', type: 'low_drone', moodTags: ['ominous', 'cold', 'mysterious', 'tense'], prompt: 'cold investigative ambient bed, minimal sustained pad, faint steady low pulse, restrained and ominous' },
  { id: 'truecrime-investigation', niche: 'True crime', mood: 'Investigation', type: 'low_drone', moodTags: ['methodical', 'tense', 'sparse', 'serious'], prompt: 'sparse methodical bed, steady ticking low pulse, serious and tense, investigative, no melody' },
  { id: 'truecrime-revelation', niche: 'True crime', mood: 'Grim', type: 'low_drone', moodTags: ['grim', 'heavy', 'dark', 'somber'], prompt: 'grim somber sustained low strings, heavy and dark, steady and ongoing, no percussion' },
  // Mystery
  { id: 'mystery-intrigue', niche: 'Mystery', mood: 'Intrigue', type: 'low_drone', moodTags: ['mysterious', 'curious', 'hazy', 'soft'], prompt: 'curious hazy ambient, soft mallet tones, gentle ongoing suspense, dreamlike and steady' },
  { id: 'mystery-clues', niche: 'Mystery', mood: 'Clues', type: 'low_drone', moodTags: ['inquisitive', 'light', 'curious', 'gentle'], prompt: 'light inquisitive bed, soft plucked tones, gentle steady pulse, curious and lightly playful-mysterious' },
  { id: 'mystery-shadows', niche: 'Mystery', mood: 'Shadows', type: 'low_drone', moodTags: ['murky', 'shadowy', 'mysterious', 'restrained'], prompt: 'murky shadowy pad, slow and steady, mysterious and restrained, low and ongoing' },
  // Wellness
  { id: 'wellness-calm', niche: 'Wellness', mood: 'Calm', type: 'low_drone', moodTags: ['calm', 'warm', 'airy', 'gentle'], prompt: 'warm calming ambient pads, airy and soft, gentle and steady, meditative, no percussion' },
  { id: 'wellness-serene', niche: 'Wellness', mood: 'Serene', type: 'low_drone', moodTags: ['serene', 'floating', 'peaceful', 'soft'], prompt: 'serene floating ambient, soft sine pads and gentle bells, peaceful and weightless, steady' },
  { id: 'wellness-grounding', niche: 'Wellness', mood: 'Grounding', type: 'low_drone', moodTags: ['grounding', 'warm', 'deep', 'slow'], prompt: 'grounding deep warm drone, slow steady pad, soothing, low and soft' },
  // Inspirational
  { id: 'inspirational-uplift', niche: 'Inspirational', mood: 'Uplift', type: 'low_drone', moodTags: ['hopeful', 'warm', 'uplifting', 'bright'], prompt: 'warm hopeful sustained pads, bright and uplifting, steady and ongoing, gentle and emotional' },
  { id: 'inspirational-glow', niche: 'Inspirational', mood: 'Glow', type: 'low_drone', moodTags: ['warm', 'gentle', 'hopeful', 'tender'], prompt: 'gentle warm glow, soft piano motif over warm pad, tender and hopeful, steady and understated' },
  { id: 'inspirational-steady', niche: 'Inspirational', mood: 'Resolve', type: 'low_drone', moodTags: ['confident', 'warm', 'motivational', 'steady'], prompt: 'confident warm pads, motivational and steady, bright and ongoing, no big hits' },
  // Vlog
  { id: 'vlog-bright', niche: 'Vlog', mood: 'Bright', type: 'low_drone', moodTags: ['light', 'bright', 'mellow', 'neutral'], prompt: 'light bright lo-fi bed, soft mellow keys, easygoing and warm, steady gentle groove' },
  { id: 'vlog-sunny', niche: 'Vlog', mood: 'Sunny', type: 'low_drone', moodTags: ['sunny', 'upbeat', 'light', 'fresh'], prompt: 'sunny upbeat bed, soft warm keys and light plucks, fresh and friendly, steady' },
  { id: 'vlog-chill', niche: 'Vlog', mood: 'Chill', type: 'low_drone', moodTags: ['chill', 'smooth', 'warm', 'relaxed'], prompt: 'chill laid-back lo-fi, smooth warm chords, relaxed and cozy, steady' },
  // Comedy
  { id: 'comedy-playful', niche: 'Comedy', mood: 'Playful', type: 'low_drone', moodTags: ['playful', 'light', 'quirky', 'fun'], prompt: 'playful quirky light bed, bouncy plucked tones, whimsical and fun, lighthearted and steady' },
  { id: 'comedy-goofy', niche: 'Comedy', mood: 'Goofy', type: 'low_drone', moodTags: ['goofy', 'bouncy', 'silly', 'upbeat'], prompt: 'goofy bouncy bed, comedic pizzicato and light woodwind-like tones, silly and upbeat, steady' },
  { id: 'comedy-cheeky', niche: 'Comedy', mood: 'Cheeky', type: 'low_drone', moodTags: ['cheeky', 'jaunty', 'light', 'fun'], prompt: 'cheeky jaunty bed, swing-y light plucks, mischievous and fun, breezy and steady' },
  // Hype
  { id: 'hype-drive', niche: 'Hype', mood: 'Drive', type: 'low_drone', moodTags: ['energetic', 'bold', 'driving', 'steady'], prompt: 'driving energetic steady pulse, bold low synth, consistent momentum, modern, no big hits' },
  { id: 'hype-power', niche: 'Hype', mood: 'Power', type: 'low_drone', moodTags: ['powerful', 'big', 'bold', 'steady'], prompt: 'powerful steady low synth groove, big and bold, confident and consistent, modern' },
  { id: 'hype-momentum', niche: 'Hype', mood: 'Momentum', type: 'low_drone', moodTags: ['steady', 'driving', 'energetic', 'modern'], prompt: 'steady driving modern bed, pulsing synth, forward momentum, energetic and sleek' },
  // Tech
  { id: 'tech-pulse', niche: 'Tech', mood: 'Pulse', type: 'low_drone', moodTags: ['minimal', 'steady', 'modern', 'sleek'], prompt: 'minimal modern tech bed, steady soft pulse, clean synth pad, sleek and understated' },
  { id: 'tech-circuit', niche: 'Tech', mood: 'Circuit', type: 'low_drone', moodTags: ['precise', 'clean', 'futuristic', 'steady'], prompt: 'precise clean futuristic bed, soft arpeggiated synth, steady and bright, understated' },
  { id: 'tech-data', niche: 'Tech', mood: 'Data', type: 'low_drone', moodTags: ['cool', 'minimal', 'floating', 'modern'], prompt: 'cool minimal ambient tech, floating synth pads, calm and modern, spacious and steady' },
] as const

void (async () => {
  // Load .env.local (ELEVENLABS_API_KEY + R2 creds) before importing providers.
  for (const line of readFileSync(`${REPO}/.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }

  const { generateMusic, uploadBuffer } = await import('@reels/providers')

  const out: Array<Record<string, unknown>> = []
  // Hard constraints on EVERY bed: no voices (would fight the narration) + loopable + background-level.
  const CONSTRAINT = ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
    ' Seamless loop: consistent texture and steady volume throughout, no intro or outro, no big hits.' +
    ' Sits quietly in the background under a speaking voice.'

  for (const b of BEDS) {
    process.stdout.write(`generating ${b.id}… `)
    const { audio } = await generateMusic({ prompt: b.prompt + '.' + CONSTRAINT, lengthMs: LENGTH_MS })
    const path = `audio/presets/${b.id}.mp3`
    await uploadBuffer(path, audio, 'audio/mpeg')
    out.push({ id: b.id, niche: b.niche, mood: b.mood, path, type: b.type, moodTags: b.moodTags })
    console.log(`ok (${audio.length} bytes) → ${path}`)
  }

  const content =
    `import type { PresetBed } from './preset-beds.js'\n\n` +
    `// AUTO-GENERATED by apps/worker/scripts/seed-preset-beds.ts — do not edit by hand.\n` +
    `export const PRESET_BEDS: PresetBed[] = ${JSON.stringify(out, null, 2)}\n`
  writeFileSync(DATA_FILE, content)
  console.log(`\nwrote ${out.length} beds → ${DATA_FILE}`)
})()
