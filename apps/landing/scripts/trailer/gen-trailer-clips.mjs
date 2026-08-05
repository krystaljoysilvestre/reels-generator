// Trailer motion pass: 8 beats → Kling v2.5 Turbo Pro i2v, 5s each (trimmed to 3s at assembly).
// Chosen stills per founder G-A1 verdict "all B": beats 3/5/8 use the style-shifted alternates.
// Motion encodes the expanding-frame arc; style-preservation is pinned in every prompt because
// Kling will otherwise "photorealize" a painting/anime/watercolor source.
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/.env.local', 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
const T = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad/trailer'
const MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
const HEADERS = { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' }

const BEATS = [
  { n: 1, src: 'beat1-closet.jpg', prompt: 'Held stillness, almost no movement: the pale light in the closet gap breathes slightly brighter, dust motes drift slowly through it, a curtain edge stirs once. Camera locked, the faintest push-in. Photoreal cinematic, film grain preserved. Oppressive quiet dread.' },
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
  const buf = readFileSync(`${T}/${p}`)
  const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

const ids = []
for (const b of BEATS) {
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
  writeFileSync(`${T}/clip-beat${b.n}.mp4`, buf)
  console.log(`beat ${b.n} → clip-beat${b.n}.mp4 (${(buf.length/1e6).toFixed(1)}MB)`)
}
console.log('motion pass done')
