// One-time: render a thumbnail for each onboarding style preset, on a single neutral safe scene, and
// upload it to its stable R2 key (stylePresetThumbKey). Run once (re-run to refresh). The onboarding
// gallery then serves these via /api/asset — zero per-user image cost.
//
//   pnpm --filter worker exec tsx src/scripts/render-style-presets.ts
//   (or, from repo root:  ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/render-style-presets.ts)

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

// Neutral, atmospheric, SAFE scene — reads across every style for an apples-to-apples comparison.
const SAMPLE_SCENE = 'a lone figure standing at the end of a dim hallway, seen from behind, a doorway ahead'
const CONCURRENCY = 4

async function main() {
  // Dynamic import AFTER env is loaded, so provider clients see the keys.
  const {
    generateImage, assembleImagePrompt, assembleNegativePrompt, FalEngineSchema,
    SCENE_IMAGE_MODEL_ID, SCENE_IMAGE_GUIDANCE, SCENE_IMAGE_STEPS,
  } = await import('@reels/providers')
  const { STYLE_PRESETS, stylePresetThumbKey } = await import('@reels/core')

  const engine = FalEngineSchema.parse({ imageModelId: SCENE_IMAGE_MODEL_ID })
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
        engine,
        guidanceScale: SCENE_IMAGE_GUIDANCE,
        numInferenceSteps: SCENE_IMAGE_STEPS,
      })
      totalCents += r.costCents ?? 0
      ok++
      console.log(`  ✓ ${p.id.padEnd(16)} → ${r.asset.storageKey} (${r.costCents ?? 0}¢)`)
    } catch (e) {
      console.log(`  ✗ ${p.id.padEnd(16)} FAILED: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`Rendering ${STYLE_PRESETS.length} preset thumbnails (concurrency ${CONCURRENCY})…`)
  for (let i = 0; i < STYLE_PRESETS.length; i += CONCURRENCY) {
    await Promise.all(STYLE_PRESETS.slice(i, i + CONCURRENCY).map(render))
  }
  console.log(`Done: ${ok}/${STYLE_PRESETS.length} ok · ~${totalCents}¢ total`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
