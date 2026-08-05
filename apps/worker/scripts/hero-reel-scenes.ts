// Download a reel's scene images for the gate-2 visual review.
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-scenes.ts <reelId> <outDir>
import '../src/env.js'
void (async () => {
  const { getDb, assets } = await import('@reels/db')
  const { eq, asc } = await import('drizzle-orm')
  const { downloadBuffer } = await import('@reels/providers')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const db = getDb()
  const reelId = process.argv[2]
  const out = process.argv[3]
  if (!reelId || !out) throw new Error('Usage: hero-reel-scenes.ts <reelId> <outDir>')
  mkdirSync(out, { recursive: true })
  const rows = await db.query.assets.findMany({ where: eq(assets.reelId, reelId), orderBy: [asc(assets.createdAt)] })
  for (const a of rows) console.log(`${a.kind}  ${a.costCents}¢  ${a.storageKey}`)
  const images = rows.filter((a) => a.kind === 'image')
  for (const img of images) {
    const name = img.storageKey.split('/').slice(-2).join('-')
    writeFileSync(`${out}/${name}`, await downloadBuffer(img.storageKey))
  }
  console.log(`\ndownloaded ${images.length} images → ${out}`)
  process.exit(0)
})()
