// Trailer "Every Story Begins Here" — 8 beat stills (G-A1 contact sheet).
// Light-signature discipline: every beat's dominant light source sits center/upper-center,
// warm core against cool surround, exactly ONE focal point (the founder's thumbnail test).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const env = readFileSync('/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/.env.local', 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
if (!FAL_KEY) throw new Error('FAL_KEY not found')
const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad/trailer'
mkdirSync(OUT, { recursive: true })

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

for (const b of BEATS) {
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
