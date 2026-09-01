import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { mixAudio, type StemPaths } from './mix-audio.js'
import { findImpactMs } from './audio-analysis.js'
import type { Timings } from '@reels/core'

const execFileAsync = promisify(execFile)

async function hasFfmpeg(): Promise<boolean> {
  try { await execFileAsync('ffmpeg', ['-version']); return true } catch { return false }
}
const ffmpegAvailable = await hasFfmpeg()

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}
async function durationSec(p: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p])
  return parseFloat(stdout.trim())
}
async function meanVolumeDb(p: string, startSec: number, lengthSec: number): Promise<number> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-ss', String(startSec), '-i', p, '-t', String(lengthSec), '-af', 'volumedetect', '-f', 'null', '-',
  ])
  const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)
  return match ? parseFloat(match[1]!) : -Infinity
}

describe.skipIf(!ffmpegAvailable)('mixAudio stems', () => {
  let dir: string
  const DUR = 3

  const timings: Timings = {
    durationMs: DUR * 1000,
    scenes: [],
    subtitles: [],
    sfxEvents: [],
    music: { type: 'low_drone', startAnchorMs: 0, peakAnchorMs: 2500 },
    silenceDrop: null,
    warnings: [],
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mixstems-'))
    // voiceover + ambient + music: steady tones; sfx premix: a burst at 1.0s over silence.
    const tone = (freq: number, path: string, duration = DUR) =>
      execFileAsync('ffmpeg', ['-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${duration}:sample_rate=44100`, '-ac', '1', '-y', path])
    await tone(220, join(dir, 'vox.wav'))
    await tone(220, join(dir, 'vox-short.wav'), 2)
    await tone(120, join(dir, 'amb.wav'))
    await tone(80, join(dir, 'music.wav'))
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-f', 'lavfi', '-i', 'sine=frequency=900:duration=0.12:sample_rate=44100',
      '-filter_complex', `[1]adelay=1000|1000[b];[0][b]amix=inputs=2:normalize=0,atrim=0:${DUR}[a]`,
      '-map', '[a]', '-ac', '1', '-y', join(dir, 'sfx.wav'),
    ])
  })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('writes 4 equal-length stems + the final mix, with the burst present in the sfx stem', async () => {
    const stemPaths: StemPaths = {
      voice: join(dir, 's_voice.m4a'),
      music: join(dir, 's_music.m4a'),
      sfx: join(dir, 's_sfx.m4a'),
      ambient: join(dir, 's_ambient.m4a'),
    }
    const out = join(dir, 'mix.m4a')
    await mixAudio({
      voiceoverPath: join(dir, 'vox.wav'),
      ambientPath: join(dir, 'amb.wav'),
      sfxPremixedPath: join(dir, 'sfx.wav'),
      musicPack: [{ id: 't', path: join(dir, 'music.wav'), type: 'low_drone', peakFrac: 0, moodTags: [] }],
      timings,
      outputPath: out,
      musicType: 'low_drone',
      musicMoodTags: [],
      stemPaths,
    })

    // Final mix + all 4 stems exist (the music-path graph's asplit taps all connected → no ffmpeg error).
    expect(await fileExists(out)).toBe(true)
    for (const p of Object.values(stemPaths)) expect(await fileExists(p)).toBe(true)

    // Durations all ≈ the reel length.
    for (const p of Object.values(stemPaths)) expect(await durationSec(p)).toBeGreaterThan(DUR - 0.4)

    // The burst is audible in the sfx stem near 1.0s (proves the sfx layer was tapped correctly).
    const impact = await findImpactMs(stemPaths.sfx)
    expect(impact).not.toBeNull()
    expect(impact!).toBeGreaterThanOrEqual(850)
    expect(impact!).toBeLessThanOrEqual(1200)
  })

  it('keeps the directed ending layer audible until the short terminal fade', async () => {
    const stemPaths: StemPaths = {
      voice: join(dir, 'e_voice.m4a'),
      music: join(dir, 'e_music.m4a'),
      sfx: join(dir, 'e_sfx.m4a'),
      ambient: join(dir, 'e_ambient.m4a'),
    }
    await mixAudio({
      // The voice ends at 2s while the directed ending continues to 3s. This is the production shape
      // that previously truncated the sidechain output (and therefore the music stem) at voice end.
      voiceoverPath: join(dir, 'vox-short.wav'),
      ambientPath: join(dir, 'amb.wav'),
      sfxPremixedPath: join(dir, 'sfx.wav'),
      musicPack: [{ id: 't', path: join(dir, 'music.wav'), type: 'low_drone', peakFrac: 0, moodTags: [] }],
      timings: {
        ...timings,
        ending: { startMs: 1400, voiceEndMs: 2000, endMs: 3000, focus: 'music', shape: 'resolve' },
      },
      outputPath: join(dir, 'ending_mix.m4a'),
      musicType: 'low_drone',
      musicMoodTags: [],
      stemPaths,
    })
    // 2.3–2.7s is inside the held ending, before the final 220ms safety fade.
    expect(await meanVolumeDb(stemPaths.music, 2.3, 0.4)).toBeGreaterThan(-55)
  })
})
