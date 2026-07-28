// One-time: render the onboarding style-preset thumbnails and upload them to their stable R2 keys
// (stylePresetThumbKey). Run once; re-run to refresh. The onboarding gallery serves these via
// /api/asset — zero per-user image cost.
//
// Thumbnails are rendered PER GENRE: each genre previews its own looks on its own sample scene
// (SAMPLE_SCENES in core), because one shared scene meant a cooking or kids' channel compared its
// styles on a horror-coded hallway. Within a genre the scene is held constant, so the only thing
// the creator is comparing is the style.
//
//   pnpm --filter worker exec tsx src/scripts/render-style-presets.ts
//   (or, from repo root:  ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/render-style-presets.ts)
//
// With no args it renders every genre. Pass genre ids to refresh only those:
//   … render-style-presets.ts horror childrens

import '../env.js'

const CONCURRENCY = 4

async function main() {
  // Dynamic import AFTER env is loaded, so provider clients see the keys.
  const {
    generateImage, assembleImagePrompt, assembleNegativePrompt, SCENE_IMAGE_QUALITY,
  } = await import('@reels/providers')
  const { presetsForGenre, stylePresetThumbKey, sampleSceneForGenre } = await import('@reels/core')
  const { GENRE_MODULE_VALUES } = await import('@reels/core/prompts/scenes.v1')

  let totalCents = 0
  let ok = 0
  const failed: string[] = []

  interface Job { genre: string; presetId: string; stylePreset: string; scene: string }

  async function render(j: Job) {
    const label = `${j.genre}/${j.presetId}`
    try {
      const r = await generateImage({
        prompt: assembleImagePrompt(j.scene, j.stylePreset),
        negativePrompt: assembleNegativePrompt(),
        storageKey: stylePresetThumbKey(j.presetId, j.genre),
        reelId: 'style-presets',
        sceneIdx: 0,
        quality: SCENE_IMAGE_QUALITY,
      })
      totalCents += r.costCents ?? 0
      ok++
      console.log(`  ✓ ${label.padEnd(30)} → ${r.asset.storageKey} (${r.costCents ?? 0}¢)`)
    } catch (e) {
      failed.push(label)
      console.log(`  ✗ ${label.padEnd(30)} FAILED: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Optional genre args refresh only those galleries (after a scene or DNA edit) instead of all of them.
  const only = process.argv.slice(2)
  const known = new Set<string>(GENRE_MODULE_VALUES)
  const unknown = only.filter((g) => !known.has(g))
  if (unknown.length) {
    console.error(`Unknown genre(s): ${unknown.join(', ')}`)
    console.error(`Known genres: ${[...known].join(', ')}`)
    process.exit(1)
  }
  const genres: string[] = only.length ? only : [...GENRE_MODULE_VALUES]

  const jobs: Job[] = genres.flatMap((genre) => {
    const scene = sampleSceneForGenre(genre)
    return presetsForGenre(genre).map((p) => ({
      genre,
      presetId: p.id,
      stylePreset: p.stylePreset,
      scene,
    }))
  })

  console.log(
    `Rendering ${jobs.length} thumbnail(s) across ${genres.length} genre(s) ` +
      `(concurrency ${CONCURRENCY}, ~${jobs.length * 7}¢ at medium quality)…`,
  )
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    await Promise.all(jobs.slice(i, i + CONCURRENCY).map(render))
  }
  console.log(`Done: ${ok}/${jobs.length} ok · ~${totalCents}¢ total`)
  // A partial run leaves those cards falling back to the pre-genre thumbnail, so name them explicitly
  // rather than letting a green-looking summary hide the gaps.
  if (failed.length) {
    console.log(`Failed (${failed.length}) — re-run their genre to retry: ${failed.join(', ')}`)
    return 1
  }
  return 0
}

// Exit with main's code, not a blanket 0 — a partial render must not report success to a caller or CI.
main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1) })
