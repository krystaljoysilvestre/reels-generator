// Style-shifted alternates for trailer beats 3, 5, 8 — same focal point + light zone
// as the photoreal originals so they stay drop-in swaps.
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/.env.local', 'utf8')
const FAL_KEY = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim()
const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad/trailer'
const NANO = 'fal-ai/gemini-25-flash-image'

const ALTS = [
  {
    slug: 'beat3-alexandria-oil',
    prompt:
      'Classical oil painting, full-bleed vertical, no frame or border: the Great Library of Alexandria alive — endless marble columns receding into depth as the single focal point, thousands of scrolls, scholars tiny among great shafts of golden sunlight pouring from high windows at upper center. Heavy visible brushstrokes, impasto texture, rich ochre and bronze palette, warm golden light against cool marble shadow, deliberately painted not photographic, museum oil-on-canvas quality, no text, no watermark',
  },
  {
    slug: 'beat5-dragon-anime',
    prompt:
      'Gorgeous anime key visual, cel-shaded with painterly backgrounds, full-bleed vertical: an immense dragon wing sweeping across the top of the frame and eclipsing the camera as the single focal point, below it golden glowing mountain peaks splitting a sea of clouds at sunset. Warm fire-lit wing membrane against cool high-altitude sky, prestige anime film style, deliberately stylized and non-photorealistic, sense of diving beneath the wings, no text, no watermark',
  },
  {
    slug: 'beat8-suitcase-watercolor',
    prompt:
      'Hand-painted storybook watercolor illustration, full-bleed vertical, cold-press paper texture with visible pigment blooms and soft pencil linework: an old leather suitcase lying open on a desk in a dim room, and inside it a miniature spiral galaxy spinning, its light swelling upward and outward toward the viewer as if pulling you in — the galaxy in the suitcase is the single focal point — a pair of hands silhouetted at the frame edges. Warm galactic core against cool washed shadow, gentle washes, illustration not a photograph, no text, no watermark',
  },
]

for (const a of ALTS) {
  const res = await fetch(`https://fal.run/${NANO}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: a.prompt, aspect_ratio: '2:3', num_images: 1 }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) { console.error(`${a.slug}: ${res.status} ${await res.text()}`); continue }
  const data = await res.json()
  const img = await fetch(data.images[0].url, { signal: AbortSignal.timeout(60_000) })
  const buf = Buffer.from(await img.arrayBuffer())
  writeFileSync(`${OUT}/${a.slug}.png`, buf)
  console.log(`${a.slug}: ${buf.length} bytes`)
}
console.log('done')
