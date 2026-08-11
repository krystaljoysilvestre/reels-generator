/**
 * Render one real still per caption preset, through the actual Remotion composition.
 *
 * This is the proof that the preset table and SubtitleOverlay agree with the caption system
 * reference — not a re-implementation of the overlay in a preview page, but the same code path
 * that burns captions into a finished reel. Point it at any scene image.
 *
 *   pnpm --filter @reels/worker exec tsx scripts/caption-preset-stills.ts <image> <outDir> [9:16|16:9]
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CAPTION_PRESETS, pickEmphasis, type CaptionPreset } from '@reels/core'
import { renderCaptionPresetStill } from '@reels/render/remotion/render-remotion'

const [imageArg, outArg, aspectArg = '9:16'] = process.argv.slice(2)
if (!imageArg || !outArg) {
  console.error('usage: caption-preset-stills.ts <image> <outDir> [9:16|16:9]')
  process.exit(1)
}

const image = resolve(imageArg)
const outDir = resolve(outArg)
mkdirSync(outDir, { recursive: true })

const vertical = aspectArg !== '16:9'
const width = vertical ? 1080 : 1920
const height = vertical ? 1920 : 1080
const safeZonePct = vertical ? 18 : 8

// A real chunk with real per-word timings, frozen mid-line so the accent word is lit and the
// word-by-word presets are caught part-way through their reveal — the state a viewer sees most.
const CHUNK = {
  text: 'not forever, just for one second?',
  startMs: 0,
  endMs: 2400,
  words: [
    { text: 'not', startMs: 0, endMs: 190 },
    { text: 'forever,', startMs: 240, endMs: 810 },
    { text: 'just', startMs: 1000, endMs: 1180 },
    { text: 'for', startMs: 1220, endMs: 1320 },
    { text: 'one', startMs: 1390, endMs: 1550 },
    { text: 'second?', startMs: 1600, endMs: 2400 },
  ],
}
// Freeze while the line's LANDING word is being spoken — the moment the accent, pill or
// highlighter is on screen. Freezing earlier shows a line with no accent yet, which is correct
// behaviour and a useless proof sheet.
const landing = CHUNK.words[pickEmphasis(CHUNK.words)]!
const AT_MS = Math.round((landing.startMs + landing.endMs) / 2)

const presets = Object.keys(CAPTION_PRESETS) as CaptionPreset[]
const started = Date.now()

for (const [i, preset] of presets.entries()) {
  const outputPath = join(outDir, `${String(i + 1).padStart(2, '0')}-${preset}.jpeg`)
  await renderCaptionPresetStill({
    imagePath: image,
    captionStyle: CAPTION_PRESETS[preset],
    subtitle: CHUNK,
    atMs: AT_MS,
    width,
    height,
    safeZonePct,
    outputPath,
  })
  console.log(`${String(i + 1).padStart(2, ' ')}/20  ${preset.padEnd(9)} → ${outputPath}`)
}

console.log(`\n${presets.length} stills at ${width}×${height} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
process.exit(0)
