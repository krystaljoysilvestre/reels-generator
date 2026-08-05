// Trailer audio: 10 narration lines + a 33s cinematic bed + a heartbeat cue.
// Direct ElevenLabs API (brand-film asset, not a pipeline reel) — spend reported to the founder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const env = readFileSync('/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/.env.local', 'utf8')
const KEY = env.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim()
if (!KEY) throw new Error('ELEVENLABS_API_KEY not found')
const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad/trailer/audio'
mkdirSync(OUT, { recursive: true })

const VOICE = 'JJCR1UICgHnHljtvu5uF'     // Don — Movie Trailer Narrator
const VOICE_ALT = 'ZGgk7KqsgEdrlwJ93DA8' // Cinematic Trailer (intense) — comparison on line 1

const LINES = [
  [1,  'Every story begins with a single question.'],
  [2,  'What if... everything you knew changed?'],
  [3,  'What if history remembered something different?'],
  [4,  'What if tomorrow arrived... too early?'],
  [5,  'What if legends were real?'],
  [6,  'What if something had been watching us all along?'],
  [7,  'What if we were never alone?'],
  [8,  'Every answer begins another story.'],
  [9,  'Every world begins with imagination.'],
  [10, 'Kendrix. Build stories people can’t stop watching.'],
]

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

let chars = 0
for (const [n, text] of LINES) { await tts(text, VOICE, `vo${n}.mp3`); chars += text.length }
await tts(LINES[0][1], VOICE_ALT, 'vo1-alt.mp3'); chars += LINES[0][1].length

// Music bed — one cinematic build peaking at the montage (~0:24).
const musicRes = await fetch('https://api.elevenlabs.io/v1/music', {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Epic cinematic movie-trailer score, 33 seconds. Opens almost silent with a single low sustained note and one distant heartbeat-like pulse; slow mysterious strings enter with rising tension; steady build with deep braams and pulsing low percussion; a huge orchestral and choral peak with driving drums at around 24 seconds; then a sudden drop to a single shimmering sustained tone and one final resonant hit. Wondrous, awe-inspiring, never cheerful. Orchestral, no vocals, no lyrics.',
    music_length_ms: 33000,
    force_instrumental: true,
  }),
  signal: AbortSignal.timeout(240_000),
})
if (!musicRes.ok) throw new Error(`music: ${musicRes.status} ${(await musicRes.text()).slice(0,300)}`)
writeFileSync(`${OUT}/music.mp3`, Buffer.from(await musicRes.arrayBuffer()))
console.log('music.mp3 ok')

// Heartbeat cue for beat 1.
const sfxRes = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'a single slow deep human heartbeat thump in a silent dark room, close and intimate, subtle low frequency', duration_seconds: 3, prompt_influence: 0.6 }),
  signal: AbortSignal.timeout(120_000),
})
if (!sfxRes.ok) console.error(`sfx: ${sfxRes.status}`)
else { writeFileSync(`${OUT}/heartbeat.mp3`, Buffer.from(await sfxRes.arrayBuffer())); console.log('heartbeat.mp3 ok') }

console.log(`VO chars: ${chars}`)
