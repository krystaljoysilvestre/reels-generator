import type { SubtitleChunk } from '../types/timings.js'
import { TimingsSchema } from '../types/timings.js'
import { CaptionStyleSchema } from '../types/channel.js'

// SubRip (.srt) serialization of the subtitle chunks we already compute for the burned-in overlay.
//
// Why this exists: burned captions answer mute-autoplay in a feed. Long-form is watched with sound on,
// where a platform-native caption TRACK is strictly better — the viewer can turn it off, resize it,
// or auto-translate it, and YouTube indexes the text for search. Same timings, different delivery.
//
// Chunk-level (not per-word) is deliberate: SRT has no per-word cue concept, and a player showing one
// word at a time is unreadable. The per-word timings stay for the animated overlay.

function formatTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const h = Math.floor(clamped / 3_600_000)
  const m = Math.floor((clamped % 3_600_000) / 60_000)
  const s = Math.floor((clamped % 60_000) / 1000)
  const millis = clamped % 1000
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`
}

/**
 * Serialize subtitle chunks to SubRip. Returns '' when there is nothing to caption, so callers can
 * skip the upload without a special case.
 *
 * Cues must be non-overlapping and forward-ordered or players misbehave, so chunks are sorted by start
 * and any overlap is trimmed against the next cue's start. A cue left with no positive duration after
 * trimming is dropped rather than emitted as a zero-length cue.
 */
export function subtitlesToSrt(chunks: SubtitleChunk[]): string {
  const ordered = [...chunks]
    .filter((c) => c.text.trim().length > 0 && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  const cues: string[] = []
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i]!
    const next = ordered[i + 1]
    const endMs = next ? Math.min(cur.endMs, next.startMs) : cur.endMs
    if (endMs <= cur.startMs) continue
    // SRT is newline-delimited, so a chunk containing newlines would silently split into a
    // malformed cue; collapse all whitespace to single spaces.
    const text = cur.text.replace(/\s+/g, ' ').trim()
    cues.push(`${cues.length + 1}\n${formatTimestamp(cur.startMs)} --> ${formatTimestamp(endMs)}\n${text}`)
  }

  return cues.length ? `${cues.join('\n\n')}\n` : ''
}

/**
 * The caption track to ship alongside an upload, or null for none.
 *
 * Deliberately the COMPLEMENT of burned captions rather than an addition: a channel that burns words
 * into the picture and also ships a CC track shows the same line twice for any viewer with captions
 * enabled. So a reel gets exactly one caption delivery — burned in, or platform-native.
 *
 * Takes the raw jsonb columns and validates here, so both publish paths (worker auto-gate and the web
 * route) get the same answer instead of each re-deriving it.
 */
export function resolveSidecarSrt(timings: unknown, captionStyle: unknown): string | null {
  const style = CaptionStyleSchema.safeParse(captionStyle)
  if (!style.success || style.data.enabled !== false) return null // captions are burned → no sidecar

  const parsed = TimingsSchema.safeParse(timings)
  if (!parsed.success) return null

  const srt = subtitlesToSrt(parsed.data.subtitles)
  return srt || null
}
