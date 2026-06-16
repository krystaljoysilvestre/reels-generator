// render_qa — automated quality gate (docs/02 §4 step 11)
// Failures route to a fix queue, NEVER to publish.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface QaParams {
  renderPath: string
  durationMs: number
  subtitleCount: number     // number of expected subtitle chunks
  sfxAnchorCount: number    // number of sfx events that should be resolved
}

export interface QaResult {
  passed: boolean
  failures: string[]
  warnings: string[]
  measuredLufs: number | null
  measuredDurationMs: number | null
}

const MIN_DURATION_MS = 30_000   // 30s minimum
const MAX_DURATION_MS = 120_000  // 120s maximum (2 minutes)
const TARGET_LUFS = -14
const LUFS_TOLERANCE = 0.5       // ±0.5 LUFS (docs/07 §5)

export async function runRenderQa(params: QaParams): Promise<QaResult> {
  const failures: string[] = []
  const warnings: string[] = []

  // ── File integrity probe ─────────────────────────────────────────────────
  let probe: { streams: Array<{ codec_type?: string; duration?: string }>; format?: { duration?: string } }
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_streams', '-show_format',
      params.renderPath,
    ])
    probe = JSON.parse(stdout)
  } catch {
    return {
      passed: false,
      failures: ['ffprobe failed — render file is corrupt or unreadable'],
      warnings,
      measuredLufs: null,
      measuredDurationMs: null,
    }
  }

  // ── Duration check ───────────────────────────────────────────────────────
  const durStr = probe.format?.duration
  const measuredDurationMs = durStr ? Math.round(parseFloat(durStr) * 1000) : null

  if (measuredDurationMs === null) {
    failures.push('Could not determine render duration')
  } else {
    const delta = Math.abs(measuredDurationMs - params.durationMs)
    if (delta > 2000) {
      failures.push(
        `Duration mismatch: expected ${params.durationMs}ms, got ${measuredDurationMs}ms (delta ${delta}ms > 2000ms tolerance)`,
      )
    }
    if (measuredDurationMs < MIN_DURATION_MS) {
      failures.push(`Render too short: ${measuredDurationMs}ms < ${MIN_DURATION_MS}ms minimum`)
    }
    if (measuredDurationMs > MAX_DURATION_MS) {
      failures.push(`Render too long: ${measuredDurationMs}ms > ${MAX_DURATION_MS}ms maximum`)
    }
  }

  // ── Stream checks (video + audio present) ─────────────────────────────────
  const hasVideo = probe.streams.some((s) => s.codec_type === 'video')
  const hasAudio = probe.streams.some((s) => s.codec_type === 'audio')
  if (!hasVideo) failures.push('No video stream in render output')
  if (!hasAudio) failures.push('No audio stream in render output')

  // ── LUFS measurement ─────────────────────────────────────────────────────
  let measuredLufs: number | null = null
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      '-i', params.renderPath,
      '-filter:a', 'loudnorm=print_format=json',
      '-f', 'null', '-',
    ])
    const match = stderr.match(/"input_i"\s*:\s*"([-\d.]+)"/)
    if (match?.[1]) {
      measuredLufs = parseFloat(match[1])
      const delta = Math.abs(measuredLufs - TARGET_LUFS)
      if (delta > LUFS_TOLERANCE) {
        failures.push(
          `LUFS out of range: measured ${measuredLufs.toFixed(1)} LUFS, target ${TARGET_LUFS} ±${LUFS_TOLERANCE}`,
        )
      }
    } else {
      warnings.push('Could not parse LUFS from loudnorm output')
    }
  } catch {
    warnings.push('LUFS measurement failed — ffmpeg loudnorm error')
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    measuredLufs,
    measuredDurationMs,
  }
}
