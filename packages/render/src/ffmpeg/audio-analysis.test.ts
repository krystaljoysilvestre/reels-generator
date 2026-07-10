import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { findImpactMs } from './audio-analysis.js'

const execFileAsync = promisify(execFile)

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'])
    return true
  } catch {
    return false
  }
}

const ffmpegAvailable = await hasFfmpeg()

describe.skipIf(!ffmpegAvailable)('findImpactMs', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'audio-analysis-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  // Build a 3s mostly-silent clip with a short tone burst at a known offset.
  async function makeClipWithBurstAt(burstMs: number, path: string): Promise<void> {
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
      '-f', 'lavfi', '-i', 'sine=frequency=800:duration=0.03:sample_rate=16000',
      '-filter_complex',
      `[1]adelay=${burstMs}|${burstMs}[t];[0][t]amix=inputs=2:normalize=0,atrim=0:3[out]`,
      '-map', '[out]', '-ac', '1', '-ar', '16000', '-y', path,
    ])
  }

  it('locates the transient near its true offset', async () => {
    const path = join(dir, 'burst-2000.wav')
    await makeClipWithBurstAt(2000, path)
    const impact = await findImpactMs(path)
    expect(impact).not.toBeNull()
    expect(impact!).toBeGreaterThanOrEqual(1900)
    expect(impact!).toBeLessThanOrEqual(2120)
  })

  it('returns null for a fully silent clip (no transient to align)', async () => {
    const path = join(dir, 'silence.wav')
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '2', '-ac', '1', '-ar', '16000', '-y', path,
    ])
    expect(await findImpactMs(path)).toBeNull()
  })

  it('returns null when ffmpeg cannot read the file', async () => {
    expect(await findImpactMs(join(dir, 'does-not-exist.wav'))).toBeNull()
  })
})
