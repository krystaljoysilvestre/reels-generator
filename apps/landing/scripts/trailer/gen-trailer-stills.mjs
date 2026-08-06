// Trailer "Every Story Begins Here" — 8 beat stills (G-A1 contact sheet).
// Light-signature discipline: every beat's dominant light source sits center/upper-center,
// warm core against cool surround, exactly ONE focal point (the founder's thumbnail test).
import { readFileSync, writeFileSync } from 'node:fs'
import { REPO, STILLS, ensureDirs } from './paths.mjs'

const env = readFileSync(`${REPO}/.env.local`, 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
if (!FAL_KEY) throw new Error('FAL_KEY not found')
const OUT = STILLS
ensureDirs()

const NANO = 'fal-ai/gemini-25-flash-image'
const FLUX = 'fal-ai/flux-2-pro'

const BEATS = [
  {
    n: 1, slug: 'closet', model: FLUX,
    prompt:
      'Cinematic vertical frame, a dark child\'s bedroom at night, absolute stillness: the closet door slightly ajar at center with a faint pale-warm glow spilling through the crack — the glowing crack is the single focal point. Toys as dim silhouettes, cool moonless darkness everywhere else, one warm sliver of light. Dread held in silence. Photoreal cinema, film grain, no people, no text, no watermark',
  },
  {
    n: 2, slug: 'earth', model: NANO,
    prompt:
      'Cinematic vertical frame from deep space: Earth suspended, the sun erupting a brilliant flare at upper center, ribbons of green and violet aurora wrapping the planet\'s curve — the aurora-wrapped Earth is the single focal point. Tiny satellite silhouettes drifting. Warm solar core against cool cosmos. Epic scale, photoreal space cinematography, no text, no watermark',
  },
  {
    n: 3, slug: 'alexandria', model: NANO,
    prompt:
      'Cinematic vertical frame, the Great Library of Alexandria alive: endless marble columns receding into depth — the endless columns are the single focal point — thousands of scrolls on shelves, scholars tiny among shafts of golden sunlight pouring from high windows at upper center. Warm golden light against cool marble shadow. Massive scale, painterly-real historical epic, no text, no watermark',
  },
  {
    n: 4, slug: 'neon', model: FLUX,
    prompt:
      'Cinematic vertical frame racing down a neon canyon: rain-slick megacity street between towering buildings converging at upper center — the neon canyon is the single focal point — gigantic glowing holograms, flying vehicles as streaks of light, heavy rain. Warm neon core against cool blue rain and shadow. Cinematic sci-fi, motion energy, no text, no watermark',
  },
  {
    n: 5, slug: 'dragon', model: NANO,
    prompt:
      'Cinematic vertical frame in the sky: an immense dragon wing sweeping across the top of the frame, eclipsing the camera — the wing is the single focal point — below it golden glowing mountain peaks splitting a sea of clouds at sunset. Warm fire-lit wing membrane against cool high-altitude sky. Epic fantasy cinema, sensation of diving beneath the wings, no text, no watermark',
  },
  {
    n: 6, slug: 'eye', model: FLUX,
    prompt:
      'Cinematic vertical frame in the deep ocean darkness: one enormous impossible eye opening at center, its bioluminescent iris glowing gold — the eye is the single focal point — a tiny diver\'s light hovering before it for scale. Warm-gold bioluminescent core against abyssal blue-black cold. Silent awe and dread, photoreal underwater cinema, no text, no watermark',
  },
  {
    n: 7, slug: 'saturn', model: NANO,
    prompt:
      'Cinematic vertical frame above Saturn: a tiny lone astronaut floating in the lower foreground against the colossal ringed planet — the tiny human against the vast planet is the single focal point — the rings catching warm light across center frame, billions of stars behind. Warm ringlight against deep cool cosmos. Overwhelming scale, photoreal space cinema, no text, no watermark',
  },
  {
    n: 8, slug: 'suitcase', model: NANO,
    prompt:
      'Cinematic vertical frame in a dim noir office at night: an old leather suitcase lying open on a desk, and inside it a miniature spiral galaxy spinning, its light swelling upward and outward toward the camera as if pulling you in — the galaxy in the suitcase is the single focal point — a detective\'s hands silhouetted at the frame edges. Warm galactic core against cool noir shadow. Magical-realism cinema, no text, no watermark',
  },
]

// ── Beat 1, cut 3 (2026-08-06) ────────────────────────────────────────────────────────────────
// The original beat 1 was a horror image ("oppressive quiet dread", photoreal) opening a film whose
// first line is "Every story begins with a single question" — the register argued with the narration.
// This is the same SHOT (closet ajar at centre, light through the crack, the glow as the only focal
// point, so the fadewhite into beat 2 still works) in a different visual language: wonder, not dread.
// Described by attributes rather than by naming a studio — providers filter studio names, and the
// attributes reproduce the look more reliably.
const ROOM =
  "Vertical frame, a child's bedroom at night rendered as a 3D animated feature film: the tall closet door stands slightly ajar at centre and warm golden light spills through the crack — the glowing gap is the single focal point, and something wonderful is plainly on the other side. Soft global illumination, rounded stylised forms, warm rim light along the door edge, subsurface glow in the quilt and the plush toys, richly detailed wood grain and knitted bedding, shallow depth of field, gentle bloom. Cool blue moonlight in the corners against the warm core. Toys and picture books resting in soft shadow, the corner of a small bed at the frame edge. Absolute stillness, held breath, quiet wonder and anticipation — inviting, never frightening. No people, no text, no watermark"

BEATS.push(
  { n: 1, slug: 'room-flux', model: FLUX, prompt: ROOM },
  { n: 1, slug: 'room-nano', model: NANO, prompt: ROOM },
)

// Regenerate a single shot without re-paying for the other seven:
//   node gen-trailer-stills.mjs room-flux room-nano
const ONLY = process.argv.slice(2)
const QUEUE = ONLY.length ? BEATS.filter((b) => ONLY.includes(b.slug)) : BEATS
if (ONLY.length && QUEUE.length !== ONLY.length) {
  throw new Error(`unknown slug(s): ${ONLY.filter((s) => !BEATS.some((b) => b.slug === s)).join(', ')}`)
}
console.log(`generating ${QUEUE.length} of ${BEATS.length}: ${QUEUE.map((b) => b.slug).join(', ')}`)

for (const b of QUEUE) {
  const input =
    b.model === FLUX
      ? { prompt: b.prompt, image_size: { width: 832, height: 1248 }, num_images: 1 }
      : { prompt: b.prompt, aspect_ratio: '2:3', num_images: 1 }
  const res = await fetch(`https://fal.run/${b.model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) { console.error(`beat ${b.n} ${b.slug}: ${res.status} ${await res.text()}`); continue }
  const data = await res.json()
  const url = data.images?.[0]?.url
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  const buf = Buffer.from(await img.arrayBuffer())
  const ext = img.headers.get('content-type')?.includes('webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg'
  writeFileSync(`${OUT}/beat${b.n}-${b.slug}.${ext}`, buf)
  console.log(`beat ${b.n} ${b.slug}: ${buf.length} bytes`)
}
console.log('done')
