// A/B a "worn world" texture clause in the channel style DNA, on REAL scenes of an existing reel.
// Re-rolls each scene's exact stored prompt (text→image, no reference conditioning — this previews the
// LOOK direction, not continuity) once per variant, saves the renders locally, and logs the spend
// (generateImageFal returns FAL_IMAGE_COST_CENTS per image).
// Usage: pnpm --filter worker exec tsx scripts/style-texture-ab.ts <reelId> <outDir> <idx> [idx...]
import '../src/env.js'

// Texture DNA candidates — observable materials/surfaces only (per style-preset rules: no mood words,
// no time of day). Worded at SURFACES so people/wardrobe stay clean.
const VARIANTS: Record<string, string> = {
  baseline: '',
  worn: 'well-used lived-in surfaces with visible age, scuffed paint, faint water stains along edges, worn fixtures, smudged glass, thin grime settled into grout lines and corners',
  decayed: 'aged heavily-used surfaces, rust-streaked metal fixtures, peeling paint, stained yellowed walls, cracked tile with darkened grout, corroded taps and hinges, grime built up in seams and corners',
}

void (async () => {
  const [reelId, outDir, ...idxArgs] = process.argv.slice(2)
  if (!reelId || !outDir || idxArgs.length === 0) {
    console.error('usage: style-texture-ab <reelId> <outDir> <idx> [idx...]')
    process.exit(1)
  }
  const { getDb, reels, scenes, assets, channels } = await import('@reels/db')
  const { generateImageFal, downloadBuffer, assembleNegativePrompt } = await import('@reels/providers')
  const { eq, and } = await import('drizzle-orm')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  mkdirSync(outDir, { recursive: true })

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) { console.error('reel not found'); process.exit(1) }
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) { console.error('channel not found'); process.exit(1) }
  const dna = channel.stylePreset.trim()
  const negative = assembleNegativePrompt({ genreCategory: channel.genreCategory })

  let totalCents = 0
  for (const idxArg of idxArgs) {
    const idx = Number(idxArg)
    const s = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, idx)) })
    if (!s?.imageAssetId) { console.error(`scene ${idx}: no image`); continue }
    const a = await db.query.assets.findFirst({ where: eq(assets.id, s.imageAssetId) })
    const stored = (a?.meta as Record<string, unknown> | null)?.prompt
    if (typeof stored !== 'string' || !stored.startsWith(dna)) {
      console.error(`scene ${idx}: stored prompt missing or does not start with channel DNA — skipping`)
      continue
    }

    // The live image, for reference (no cost).
    writeFileSync(join(outDir, `s${idx}-live.webp`), await downloadBuffer(a!.storageKey))

    for (const [name, clause] of Object.entries(VARIANTS)) {
      const prompt = clause ? stored.replace(dna, `${dna}, ${clause}`) : stored
      const key = `style-previews/tex-${reelId.slice(0, 8)}-s${idx}-${name}.webp`
      const r = await generateImageFal({ prompt, negativePrompt: negative, reelId: 'style-texture-ab', storageKey: key, aspect: '9:16' })
      totalCents += r.costCents ?? 0
      writeFileSync(join(outDir, `s${idx}-${name}.webp`), await downloadBuffer(key))
      console.log(`  ✓ s${idx} ${name.padEnd(8)} (${r.costCents ?? 0}¢)`)
    }
  }
  console.log(`DONE · ~${totalCents}¢ total`)
  process.exit(0)
})()
