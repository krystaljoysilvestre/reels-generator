// One-off: re-render every scene image for a reel with its CURRENT channel stylePreset.
// Use after changing a channel's visual style so an existing storyboard reflects the new look.
// Clears each scene's imageAssetId (so generateImages treats them as pending) then re-runs the step;
// generateImages reads channel.stylePreset live and its inputHash includes the new prompt, so each
// scene genuinely re-renders. Old image assets are left orphaned (harmless for a one-off).
//
//   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/rerender-reel-images.ts <reelId>

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const reelId = process.argv[2]
  if (!reelId) throw new Error('Usage: rerender-reel-images.ts <reelId>')

  const { getDb, scenes } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { generateImages } = await import('../pipeline/steps/generate-images.js')

  const db = getDb()
  const updated = await db.update(scenes).set({ imageAssetId: null }).where(eq(scenes.reelId, reelId)).returning()
  console.log(`Cleared image links on ${updated.length} scenes for reel ${reelId.slice(0, 8)} — re-rendering…`)

  await generateImages(reelId)
  console.log('Done. Reload the storyboard to see the new look.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
