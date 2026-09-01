// Read-only loudness scan of a reel's generated music source.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-music-windows.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-music-windows <reelId>')
  const { getDb, reels } = await import('@reels/db')
  const { downloadBuffer } = await import('@reels/providers')
  const { eq } = await import('drizzle-orm')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const exec = promisify(execFile)

  const reel = await getDb().query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.musicKey) throw new Error('reel music source missing')
  const dir = await mkdtemp(join(tmpdir(), 'kendrix-music-scan-'))
  try {
    const source = join(dir, 'source')
    await writeFile(source, await downloadBuffer(reel.musicKey))
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', source,
    ])
    const durationSec = Number(stdout.trim())
    console.log(`source=${reel.musicKey} duration=${durationSec.toFixed(3)}s`)
    for (let startSec = 0; startSec + 4 <= durationSec; startSec += 4) {
      const { stderr } = await exec('ffmpeg', [
        '-hide_banner', '-ss', String(startSec), '-i', source, '-t', '4',
        '-af', 'volumedetect', '-f', 'null', '-',
      ])
      const mean = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? 'n/a'
      const max = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? 'n/a'
      console.log(`${startSec.toString().padStart(2, '0')}-${startSec + 4}s mean=${mean}dB max=${max}dB`)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  process.exit(0)
})()
