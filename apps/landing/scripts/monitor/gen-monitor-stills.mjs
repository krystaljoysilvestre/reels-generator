// The Director's Monitor — 5 landscape stills for the landing page's "The cut" section.
//
// One horror story told across six scenes, all six generated here.
//
// The plan expected scene 03 to reuse the trailer's closet still (beat1-closet.jpg) for free. It
// doesn't: that frame is portrait, centre-composed and graded teal for a different film, so it
// broke both disciplines below at once. Re-shooting it in this register cost 7c and is the reason
// the six frames read as one house.
//
// Two composition disciplines, both load-bearing:
//   1. LIGHT SIGNATURE (inherited from the trailer) — one dominant warm source, one focal point,
//      warm core against cool surround. It is what makes six separate generations read as one house.
//   2. LEFT OF CENTRE — the monitor's right ~28% sits under the Director's Notebook panel, so the
//      subject must live in the left two-thirds or the panel covers the shot.
//
// PROVENANCE: marketing assets, not product-pipeline output. Don't relabel them (see channels.tsx).
//
//   node gen-monitor-stills.mjs              # all five
//   node gen-monitor-stills.mjs doorknob     # re-roll one
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { REPO, STILLS } from '../trailer/paths.mjs'

const env = readFileSync(`${REPO}/.env.local`, 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
if (!FAL_KEY) throw new Error('FAL_KEY not found')

const OUT = `${STILLS}/monitor`
mkdirSync(OUT, { recursive: true })

const FLUX = 'fal-ai/flux-2-pro'

// Appended to every prompt. This clause — not per-shot wording — is what holds the six frames
// together as one location on one night.
const HOUSE =
  'Same suburban house, same night, unbroken visual register: photoreal cinema, low contrast, ' +
  'deep blue-grey shadows, one warm practical light source as the only warm note, heavy grain, ' +
  'shallow depth of field, absolute stillness. Empty frame — no people, no faces, no figures, ' +
  'no gore, no blood, nothing overtly monstrous: the dread is in what is implied. ' +
  'Composition: the subject and the light sit LEFT OF CENTRE, the right third of the frame quiet ' +
  'and empty. No text, no watermark, no letterboxing'

const SCENES = [
  {
    slug: 'door',
    prompt:
      'Cinematic wide frame looking down a dark interior hallway toward a closed front door left of centre, ' +
      'a single warm lamp throwing one pool of light across the floorboards in front of it — the lit door is ' +
      'the single focal point. Coats on a hook, a hall table in shadow, the rest of the corridor falling to ' +
      'blue-black. Quiet, safe, ordinary — a house that has not been frightened yet. ' +
      HOUSE,
  },
  {
    slug: 'window',
    prompt:
      'Cinematic wide frame of a living-room window at night from inside, rain running down the glass, ' +
      'the window left of centre lit only by a cold streetlamp far outside — three faint pale handprint ' +
      'smudges on the outside of the glass are the single focal point, only just readable. An armchair and ' +
      'a dead lamp in the dark foreground. Rain, glass, and the wrongness of the marks. ' +
      HOUSE,
  },
  {
    slug: 'closet',
    prompt:
      'Cinematic wide frame inside a child\'s bedroom at night: a tall closet door standing open a hand\'s ' +
      'width, left of centre, one warm sliver of light escaping the gap and falling across the floor — the ' +
      'lit gap is the single focal point, and the inside of the closet stays pure black. Toys and a small ' +
      'bed in cool shadow. A door that should be shut. ' +
      HOUSE,
  },
  {
    slug: 'doorknob',
    prompt:
      'Cinematic extreme close-up filling the frame: an old brass doorknob left of centre, caught mid-turn, ' +
      'one warm highlight raking across the metal — the turning knob is the single focal point. Behind it, ' +
      'out of focus, a slack door chain hanging loose against dark painted wood. Macro detail, scratched ' +
      'lacquer, dust. Held breath. ' +
      HOUSE,
  },
  {
    slug: 'nightlight',
    prompt:
      'Cinematic wide frame down a long, very dark upstairs hallway: a small child\'s nightlight glowing warm ' +
      'at floor level, left of centre — the tiny glow is the single focal point and the only light in the ' +
      'frame. A bedroom door ajar beside it, the carpet and walls barely readable, the far end of the hall ' +
      'pure black. Overwhelming darkness against one small warm light. ' +
      HOUSE,
  },
  {
    slug: 'stairs',
    prompt:
      'Cinematic wide frame at the foot of a wooden staircase in darkness, the stairs rising left of centre ' +
      'into black — one single tread catches a warm sliver of light and is the single focal point, dust ' +
      'settling through the beam. The banister a silhouette, the top of the stairs invisible. Something has ' +
      'just stopped happening. ' +
      HOUSE,
  },
]

const ONLY = process.argv.slice(2)
const QUEUE = ONLY.length ? SCENES.filter((s) => ONLY.includes(s.slug)) : SCENES
if (ONLY.length && QUEUE.length !== ONLY.length) {
  throw new Error(`unknown slug(s): ${ONLY.filter((s) => !SCENES.some((x) => x.slug === s)).join(', ')}`)
}
console.log(`generating ${QUEUE.length} of ${SCENES.length}: ${QUEUE.map((s) => s.slug).join(', ')}`)

for (const s of QUEUE) {
  const res = await fetch(`https://fal.run/${FLUX}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: s.prompt,
      image_size: { width: 1248, height: 702 },
      num_images: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    console.error(`${s.slug}: ${res.status} ${await res.text()}`)
    continue
  }
  const data = await res.json()
  const url = data.images?.[0]?.url
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  const buf = Buffer.from(await img.arrayBuffer())
  const ext = img.headers.get('content-type')?.includes('webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg'
  writeFileSync(`${OUT}/${s.slug}.${ext}`, buf)
  console.log(`${s.slug}: ${buf.length} bytes`)
}
console.log('done')
