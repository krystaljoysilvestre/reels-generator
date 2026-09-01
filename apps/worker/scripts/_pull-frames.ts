import '../src/env.js'
void (async () => {
  const { downloadBuffer } = await import('@reels/providers')
  const { getDb, scenes, assets } = await import('@reels/db')
  const { asc, eq } = await import('drizzle-orm')
  const fs = await import('node:fs/promises')
  const [reelId, out] = process.argv.slice(2)
  if (!reelId || !out) throw new Error('usage: _pull-frames <reelId> <outputDir>')
  const db = getDb()
  const rows = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
  })
  await fs.mkdir(out, { recursive: true })
  for (const scene of rows) {
    if (!scene.imageAssetId) throw new Error(`scene ${scene.idx} has no image asset`)
    const asset = await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
    if (!asset) throw new Error(`scene ${scene.idx} image asset not found`)
    const buf = await downloadBuffer(asset.storageKey)
    await fs.writeFile(`${out}/scene${scene.idx}.webp`, buf)
    console.log(`scene${scene.idx}.webp ${(buf.length / 1024).toFixed(0)}KB`)
  }
  process.exit(0)
})()
