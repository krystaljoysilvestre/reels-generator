// One-time: render a thumbnail for each onboarding style preset, on a single neutral safe scene, and
// upload it to its stable R2 key (stylePresetThumbKey). Run once (re-run to refresh). The onboarding
// gallery then serves these via /api/asset — zero per-user image cost.
//
//   pnpm --filter worker exec tsx src/scripts/render-style-presets.ts
//   (or, from repo root:  ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/render-style-presets.ts)

import '../env.js'

// Neutral, atmospheric, SAFE scene — reads across every style for an apples-to-apples comparison.
const SAMPLE_SCENE = 'a lone figure standing at the end of a dim hallway, seen from behind, a doorway ahead'
const CONCURRENCY = 4

async function main() {
  // Dynamic import AFTER env is loaded, so provider clients see the keys.
  const {
    generateImage, assembleImagePrompt, assembleNegativePrompt, SCENE_IMAGE_QUALITY,
  } = await import('@reels/providers')
  const { STYLE_PRESETS, stylePresetThumbKey } = await import('@reels/core')

  let totalCents = 0
  let ok = 0

  async function render(p: (typeof STYLE_PRESETS)[number]) {
    try {
      const r = await generateImage({
        prompt: assembleImagePrompt(SAMPLE_SCENE, p.stylePreset),
        negativePrompt: assembleNegativePrompt(),
        storageKey: stylePresetThumbKey(p.id),
        reelId: 'style-presets',
        sceneIdx: 0,
        quality: SCENE_IMAGE_QUALITY,
      })
      totalCents += r.costCents ?? 0
      ok++
      console.log(`  ✓ ${p.id.padEnd(16)} → ${r.asset.storageKey} (${r.costCents ?? 0}¢)`)
    } catch (e) {
      console.log(`  ✗ ${p.id.padEnd(16)} FAILED: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Optional preset-id args refresh only those thumbnails (after a DNA edit) instead of all of them.
  const only = process.argv.slice(2)
  const presets = only.length ? STYLE_PRESETS.filter((p) => only.includes(p.id)) : [...STYLE_PRESETS]
  if (only.length && presets.length !== only.length) {
    const known = new Set(presets.map((p) => p.id))
    console.error(`Unknown preset id(s): ${only.filter((id) => !known.has(id)).join(', ')}`)
    process.exit(1)
  }

  console.log(`Rendering ${presets.length} preset thumbnail(s) (concurrency ${CONCURRENCY})…`)
  for (let i = 0; i < presets.length; i += CONCURRENCY) {
    await Promise.all(presets.slice(i, i + CONCURRENCY).map(render))
  }
  console.log(`Done: ${ok}/${presets.length} ok · ~${totalCents}¢ total`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
