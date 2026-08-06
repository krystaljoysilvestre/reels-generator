// Trailer motion pass: 8 beats → Kling v2.5 Turbo Pro i2v, 5s each (trimmed to 3s at assembly).
// Chosen stills per founder G-A1 verdict "all B": beats 3/5/8 use the style-shifted alternates.
// Motion encodes the expanding-frame arc; style-preservation is pinned in every prompt because
// Kling will otherwise "photorealize" a painting/anime/watercolor source.
import { readFileSync, writeFileSync } from 'node:fs'
import { REPO, STILLS, CLIPS, ensureDirs } from './paths.mjs'

ensureDirs()
const env = readFileSync(`${REPO}/.env.local`, 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
const IN = STILLS, OUT = CLIPS
const MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
const HEADERS = { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' }

const BEATS = [
  // Cut 3: the opening is no longer a horror image. Same shot, animated-feature language, wonder
  // instead of dread — and the style clause is MANDATORY here for the same reason beats 5 and 8 carry
  // one: Kling photorealizes a stylized source unless told not to, which would undo the whole point.
  { n: 1, src: 'beat1-room-nano.png', prompt: 'Held stillness, almost no movement: the warm golden light in the closet gap breathes slightly brighter, fine dust motes drift slowly through the beam, a plush toy\'s ear stirs once. Camera locked, the faintest push-in. Quiet wonder and anticipation — inviting, expectant, never frightening. CRITICAL: the 3D animated feature rendering stays perfectly consistent throughout — soft global illumination, rounded stylised forms, subsurface glow in the fabrics — never photorealistic, never converted to live action.' },
  { n: 2, src: 'beat2-earth.png', prompt: 'Majestic slow motion: green and violet auroras ripple and flow across the planet, the solar flare pulses and throws light, Earth rotates almost imperceptibly, tiny satellites drift. Camera pulls back slowly, revealing more space. Photoreal space cinematography.' },
  { n: 3, src: 'beat3-alexandria-oil.png', prompt: 'The camera pushes slowly forward down the great nave. The shaft of golden light drifts, dust swims in the beam, robed scholars shift and turn pages. CRITICAL: the heavy oil-painting brushstroke texture and impasto surface stay perfectly consistent throughout — this is a moving classical painting, never photorealistic.' },
  { n: 4, src: 'beat4-neon.jpg', prompt: 'Camera races forward down the neon canyon at speed, rain streaking past the lens, hologram light flickering across wet surfaces, vehicles blurring by as light streaks. Fast, kinetic, cinematic sci-fi. Photoreal.' },
  { n: 5, src: 'beat5-dragon-anime.png', prompt: 'The immense wing sweeps slowly across the frame as the camera dives beneath it toward the cloud sea; clouds drift, embers glow along the membrane, sunlight flares past the wing edge. CRITICAL: the cel-shaded anime art style and painterly background stay perfectly consistent throughout — never photorealistic.' },
  { n: 6, src: 'beat6-eye.jpg', prompt: 'The enormous eye opens wider with slow deliberate menace, the golden iris contracting, marine particles drifting through the beam of the tiny diver light which sways gently. Camera holds, almost still. Photoreal underwater cinema. Silent awe and dread.' },
  { n: 7, src: 'beat7-saturn.png', prompt: 'Vast serene drift: the lone astronaut rotates slowly in the foreground, Saturn hangs motionless while its rings catch and glint light, stars twinkle faintly. Camera pulls back very slowly, making the human smaller. Photoreal space cinema, overwhelming scale.' },
  { n: 8, src: 'beat8-suitcase-watercolor.png', prompt: 'The spiral galaxy inside the suitcase spins and its light swells outward, and the camera ACCELERATES FORWARD INTO the suitcase — diving into the galaxy, stars beginning to streak toward the viewer as the case fills the frame. CRITICAL: the hand-painted watercolor texture, pigment blooms and paper grain stay perfectly consistent throughout — never photorealistic.' },
]

const NEG = 'text, watermark, letterboxing, black bars, style change, photorealistic conversion, morphing, distortion, warping faces, camera shake, sudden cuts'

function dataUri(p) {
  const buf = readFileSync(`${IN}/${p}`)
  const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

// Re-shoot one beat without re-paying for the other seven (5s @ 7¢/s each):
//   node gen-trailer-clips.mjs 1
const ONLY = process.argv.slice(2).map(Number)
const QUEUE = ONLY.length ? BEATS.filter((b) => ONLY.includes(b.n)) : BEATS
if (ONLY.length && QUEUE.length !== ONLY.length) throw new Error(`unknown beat(s): ${ONLY.join(', ')}`)
console.log(`${QUEUE.length} clip(s) at ~35¢ each: beats ${QUEUE.map((b) => b.n).join(', ')}`)

const ids = []
for (const b of QUEUE) {
  const res = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ prompt: b.prompt, image_url: dataUri(b.src), duration: '5', negative_prompt: NEG }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) { console.error(`beat ${b.n} submit ${res.status}: ${(await res.text()).slice(0,200)}`); continue }
  const { request_id } = await res.json()
  ids.push([b, request_id])
  console.log(`beat ${b.n} queued ${request_id}`)
}

for (const [b, id] of ids) {
  const base = `https://queue.fal.run/fal-ai/kling-video/requests/${id}`
  let ok = false
  for (let i = 0; i < 96; i++) {
    const s = await fetch(`${base}/status`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) })
    const st = (await s.json()).status
    if (st === 'COMPLETED') { ok = true; break }
    if (st === 'FAILED' || st === 'ERROR') { console.error(`beat ${b.n}: ${st}`); break }
    await new Promise((r) => setTimeout(r, 5000))
  }
  if (!ok) continue
  const r = await fetch(base, { headers: HEADERS, signal: AbortSignal.timeout(30_000) })
  const url = (await r.json()).video?.url
  if (!url) { console.error(`beat ${b.n}: no url`); continue }
  const vid = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  const buf = Buffer.from(await vid.arrayBuffer())
  writeFileSync(`${OUT}/clip-beat${b.n}.mp4`, buf)
  console.log(`beat ${b.n} → clip-beat${b.n}.mp4 (${(buf.length/1e6).toFixed(1)}MB)`)
}
console.log('motion pass done')
