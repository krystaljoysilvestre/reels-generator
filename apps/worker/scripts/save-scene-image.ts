// Download a scene's current image to a local file (A/B preservation). Usage: save-scene-image <reelId> <idx> <outPath>
import '../src/env.js'
void (async () => {
  const [reelId, idxArg, outPath] = process.argv.slice(2)
  const { getDb, scenes, assets } = await import('@reels/db')
  const { downloadBuffer } = await import('@reels/providers')
  const { eq, and } = await import('drizzle-orm')
  const { writeFileSync } = await import('node:fs')
  const db = getDb()
  const s = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId!), eq(scenes.idx, Number(idxArg))) })
  if (!s?.imageAssetId) { console.error('no image'); process.exit(1) }
  const a = await db.query.assets.findFirst({ where: eq(assets.id, s.imageAssetId) })
  const buf = await downloadBuffer(a!.storageKey)
  writeFileSync(outPath!, buf)
  console.log(`saved ${a!.storageKey} (${buf.length} bytes, provider=${a!.provider}) -> ${outPath}`)
  const meta = (a!.meta ?? {}) as Record<string, unknown>
  console.log(`qaPass=${meta.qaPass} qaIssues=${(meta.qaIssues as string[] | undefined)?.length ?? 0}`)
})()
