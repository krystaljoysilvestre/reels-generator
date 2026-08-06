// Trailer audio: 10 narration lines + a 33s cinematic bed + a heartbeat cue.
// Direct ElevenLabs API (brand-film asset, not a pipeline reel) — spend reported to the founder.
import { readFileSync, writeFileSync } from 'node:fs'
import { REPO, AUDIO, ensureDirs } from './paths.mjs'
const env = readFileSync(`${REPO}/.env.local`, 'utf8')
const KEY = env.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim()
if (!KEY) throw new Error('ELEVENLABS_API_KEY not found')
const OUT = AUDIO
ensureDirs()

const VOICE = 'JJCR1UICgHnHljtvu5uF'     // Don — Movie Trailer Narrator
const VOICE_ALT = 'ZGgk7KqsgEdrlwJ93DA8' // Cinematic Trailer (intense) — comparison on line 1

// The lines live in narration.mjs so the caption renderer can read them WITHOUT importing this file —
// importing this one would run its API calls at module load and spend money.
import { LINES } from './narration.mjs'

async function tts(text, voiceId, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`tts ${file}: ${res.status} ${(await res.text()).slice(0,200)}`)
  writeFileSync(`${OUT}/${file}`, Buffer.from(await res.arrayBuffer()))
  console.log(`${file} ok`)
}

// Regenerate one part without re-paying for the others:
//   node gen-trailer-audio.mjs music        # just the bed
//   node gen-trailer-audio.mjs vo sfx
const PARTS = process.argv.slice(2)
const want = (p) => PARTS.length === 0 || PARTS.includes(p)
const KNOWN = ['vo', 'music', 'sfx']
const bad = PARTS.filter((p) => !KNOWN.includes(p))
if (bad.length) throw new Error(`unknown part(s): ${bad.join(', ')} — expected ${KNOWN.join(' | ')}`)
console.log(`generating: ${KNOWN.filter(want).join(', ')}`)

let chars = 0
if (want('vo')) {
  for (const [n, text] of LINES) { await tts(text, VOICE, `vo${n}.mp3`); chars += text.length }
  await tts(LINES[0][1], VOICE_ALT, 'vo1-alt.mp3'); chars += LINES[0][1].length
}

// Music bed — one cinematic build peaking at the montage (~0:24), then a resolve long enough for
// cut 3's ending. The low sustained note at ~36s is the score holding through the half-second of air
// after the narrator says "Kendrix." — the pause must be felt, never silent.
// Written as music42.mp3; music36.mp3 (cut 1/2's bed) stays on disk for the A/B.
if (want('music')) {
  const musicRes = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Epic cinematic movie-trailer score, 42 seconds. Opens almost silent with a single low sustained note and one distant heartbeat-like pulse; slow mysterious strings enter with rising tension; steady build with deep braams and pulsing low percussion; a huge orchestral and choral peak with driving drums at around 24 seconds; then a drop to a shimmering sustained tone. At about 36 seconds a single low resonant note rings out and holds for two seconds, alone and unhurried. Then one final rising swell resolving into a long shimmering decay that fades to nothing by 42 seconds. Wondrous, awe-inspiring, never cheerful. Orchestral, no vocals, no lyrics.',
      music_length_ms: 42000,
      force_instrumental: true,
    }),
    signal: AbortSignal.timeout(240_000),
  })
  if (!musicRes.ok) throw new Error(`music: ${musicRes.status} ${(await musicRes.text()).slice(0,300)}`)
  writeFileSync(`${OUT}/music42.mp3`, Buffer.from(await musicRes.arrayBuffer()))
  console.log('music42.mp3 ok')
}

// Heartbeat cue for beat 1 (and the fallback for the pause, if the bed's low note doesn't land).
if (want('sfx')) {
  const sfxRes = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'a single slow deep human heartbeat thump in a silent dark room, close and intimate, subtle low frequency', duration_seconds: 3, prompt_influence: 0.6 }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!sfxRes.ok) console.error(`sfx: ${sfxRes.status}`)
  else { writeFileSync(`${OUT}/heartbeat.mp3`, Buffer.from(await sfxRes.arrayBuffer())); console.log('heartbeat.mp3 ok') }
}

console.log(`VO chars: ${chars}`)
