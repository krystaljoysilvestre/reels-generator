// Audio analysis helpers for placement. `findImpactMs` locates the loudest transient in an SFX clip so
// the mixer can align THAT to the anchor word — ElevenLabs doesn't guarantee a build-to-hit clip's impact
// lands at the clip's end, so end-alignment can miss the beat. Aligning the detected transient also lets
// the clip's ring-out tail play PAST the anchor for free.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SAMPLE_RATE = 16_000 // mono, downsampled — plenty for envelope/transient detection
const WINDOW_MS = 20
const WINDOW_SAMPLES = (SAMPLE_RATE * WINDOW_MS) / 1000 // 320 samples
// A riser can get loud before its hit, so we don't want "first loudest" — we take the LAST window within
// ~1 dB of the peak, i.e. the latest loudest transient (normally the impact itself).
const NEAR_PEAK_RATIO = 10 ** (-1 / 20) // -1 dB in linear amplitude ≈ 0.891
// 22s (the SFX cap) of mono s16le @16kHz ≈ 700 kB; 16 MB is a very safe ceiling.
const MAX_BUFFER = 16 * 1024 * 1024

/**
 * Returns the millisecond offset of the clip's dominant transient (the impact), or null if the clip is
 * silent or ffmpeg fails — callers fall back to clip length. Known limitation (fine for v1): a clip with
 * two near-equal transients (glass break … door slam) always returns the LATER one; if odd alignments
 * show up in listening, upgrade this to spectral-flux onset detection or "loudest after 60% of clip".
 */
export async function findImpactMs(path: string): Promise<number | null> {
  let pcm: Buffer
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'],
      { encoding: 'buffer', maxBuffer: MAX_BUFFER },
    )
    pcm = stdout as unknown as Buffer
  } catch {
    return null
  }

  const totalSamples = Math.floor(pcm.length / 2)
  if (totalSamples < WINDOW_SAMPLES) return null

  // Peak amplitude per window, tracking the global max in the same pass.
  const windowCount = Math.floor(totalSamples / WINDOW_SAMPLES)
  const peaks = new Float64Array(windowCount)
  let globalMax = 0
  for (let w = 0; w < windowCount; w++) {
    let peak = 0
    const base = w * WINDOW_SAMPLES * 2
    for (let i = 0; i < WINDOW_SAMPLES; i++) {
      const v = Math.abs(pcm.readInt16LE(base + i * 2))
      if (v > peak) peak = v
    }
    peaks[w] = peak
    if (peak > globalMax) globalMax = peak
  }
  if (globalMax === 0) return null // pure silence — no transient to align

  const threshold = globalMax * NEAR_PEAK_RATIO
  let lastLoud = 0
  for (let w = windowCount - 1; w >= 0; w--) {
    if (peaks[w]! >= threshold) {
      lastLoud = w
      break
    }
  }
  // Center of the chosen window.
  return Math.round(lastLoud * WINDOW_MS + WINDOW_MS / 2)
}
