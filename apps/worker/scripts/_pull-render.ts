import '../src/env.js'
void (async () => {
  const { downloadBuffer } = await import('@reels/providers')
  const { getDb, reels } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const fs = await import('node:fs/promises')
  const [reelId, out] = process.argv.slice(2)
  if (!reelId || !out) throw new Error('usage: _pull-render <reelId> <outputDir>')
  await fs.mkdir(out, { recursive: true })
  const files = [
    ['render.mp4', `reels/${reelId}/render.mp4`],
    ['thumbnail.jpg', `reels/${reelId}/thumbnail.jpg`],
    ['mix.m4a', `reels/${reelId}/mix.m4a`],
    ['voice.m4a', `reels/${reelId}/stems/voice.m4a`],
    ['music.m4a', `reels/${reelId}/stems/music.m4a`],
    ['sfx.m4a', `reels/${reelId}/stems/sfx.m4a`],
    ['ambient.m4a', `reels/${reelId}/stems/ambient.m4a`],
  ] as const
  for (const [name, key] of files) {
    const buf = await downloadBuffer(key)
    await fs.writeFile(`${out}/${name}`, buf)
    console.log(`${name} ${(buf.length / 1048576).toFixed(1)}MB`)
  }
  const reel = await getDb().query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (reel?.musicKey) {
    const buf = await downloadBuffer(reel.musicKey)
    await fs.writeFile(`${out}/music-source.mp3`, buf)
    console.log(`music-source.mp3 ${(buf.length / 1048576).toFixed(1)}MB`)
  }
  process.exit(0)
})()
