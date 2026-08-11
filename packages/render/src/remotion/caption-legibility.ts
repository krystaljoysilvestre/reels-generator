// Measure the strip of picture a caption will sit on, and adapt the caption to it.
//
// Runs once per reel, immediately before the render, on the frames the reel has already
// generated. It costs one cheap ffmpeg crop per sampled frame and no API call at all.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  needsScrim, relativeLuminance, scrimAlphaFor, shadowAlphaFor, residualShortfall,
  contrastRatio, luminanceOf, SCRIM_BASE_ALPHA, SHADOW_BASE_ALPHA, type BandReading,
} from '@reels/core/captions/legibility'
import type { CaptionStyle } from './types.js'

const execFileAsync = promisify(execFile)

// Enough frames to catch a bright scene without paying for every one of a 43-scene long-form.
const MAX_SAMPLES = 12

/**
 * Mean colour of one rectangle of an image, via a crop scaled to a single pixel. Returns null
 * rather than throwing: a caption that cannot be measured keeps the preset's own look.
 */
async function meanColor(
  imagePath: string,
  crop: { w: string; h: string; x: string; y: string },
): Promise<[number, number, number] | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-v', 'error',
        '-i', imagePath,
        '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=1:1`,
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-frames:v', '1', '-',
      ],
      { encoding: 'buffer', maxBuffer: 1024 },
    )
    if (stdout.length < 3) return null
    return [stdout[0]!, stdout[1]!, stdout[2]!]
  } catch {
    return null
  }
}

/**
 * The caption band as a fraction of the frame, matching where SubtitleOverlay puts it. Expressed
 * in ffmpeg's `iw`/`ih` terms so it works whatever the source frame's resolution is.
 */
function bandCrop(style: CaptionStyle, safeZonePct: number) {
  const safe = safeZonePct > 0 ? safeZonePct : 12.5
  const heightFrac = 0.22 // roughly two lines of the largest preset, with room around them
  if (style.position === 'center') {
    return { w: 'iw', h: `ih*${heightFrac}`, x: '0', y: `ih*${(1 - heightFrac) / 2}` }
  }
  const insetFrac = (style.position === 'bottom'
    ? Math.max(safe, style.bottomInsetPct ?? 0)
    : safe) / 100
  const y = style.position === 'top'
    ? `ih*${insetFrac}`
    : `ih*${Math.max(0, 1 - insetFrac - heightFrac)}`
  return { w: 'iw', h: `ih*${heightFrac}`, x: '0', y }
}

export interface LegibilityResult {
  style: CaptionStyle
  /** Human-readable log lines — this changes what ships, so it should never be silent. */
  notes: string[]
}

/**
 * Adapt a caption style to the footage it will be burned onto: swap the accent for the nearest
 * palette colour that survives the frames, and give a plateless preset a scrim when the picture
 * is too bright to hold the type. Returns the style unchanged when nothing needs doing, or when
 * measurement fails.
 */
export async function adaptCaptionToFootage(args: {
  captionStyle: CaptionStyle
  imagePaths: string[]
  safeZonePct: number
}): Promise<LegibilityResult> {
  const { captionStyle, imagePaths, safeZonePct } = args
  const notes: string[] = []
  if (captionStyle.enabled === false || imagePaths.length === 0) return { style: captionStyle, notes }

  // Sample evenly across the reel so one bright opening frame doesn't stand for the whole thing.
  const step = Math.max(1, Math.ceil(imagePaths.length / MAX_SAMPLES))
  const sampled = imagePaths.filter((_, i) => i % step === 0).slice(0, MAX_SAMPLES)
  const crop = bandCrop(captionStyle, safeZonePct)

  const readings = (await Promise.all(sampled.map((p) => meanColor(p, crop))))
    .filter((c): c is [number, number, number] => c !== null)
    .map(relativeLuminance)

  if (readings.length === 0) {
    notes.push('[captions] could not measure the caption band; keeping the preset as-is')
    return { style: captionStyle, notes }
  }

  const band: BandReading = {
    luminance: readings.reduce((a, b) => a + b, 0) / readings.length,
    // The brightest sampled frame, not the mean: one accent has to survive every scene, and a
    // caption that vanishes for two shots out of twelve is still a caption that vanishes.
    peakLuminance: Math.max(...readings),
  }

  let style = captionStyle
  const hadBackplate = Boolean(style.backplate && style.backplate !== 'none')

  // A panel already decides its own contrast — the footage behind a bar or a lower third does not
  // reach the type at all, so those presets are left entirely alone.
  if (style.backplate === 'bar' || style.backplate === 'block') return { style, notes }

  const brightness = `band peaks at ${(band.peakLuminance * 100).toFixed(0)}% luminance`

  // 1. THE GLYPH SHADOW — always tried first, because it costs no picture. It darkens a few pixels
  //    around each letter and is invisible as a shape, where a wash darkens a region of the frame.
  const shadowAlpha = shadowAlphaFor(band)
  if (shadowAlpha > (style.shadowAlpha ?? SHADOW_BASE_ALPHA)) {
    // A preset drawn with no shadow at all gets the soft one rather than staying bare: on a lit
    // frame "no shadow" is not a look, it is an unreadable caption.
    const promoted = style.shadow === 'none' ? 'soft' as const : style.shadow
    style = { ...style, shadow: promoted, shadowAlpha }
    notes.push(
      `[captions] ${style.preset}: ${brightness} — glyph shadow deepened ${SHADOW_BASE_ALPHA} → ${shadowAlpha}` +
      (promoted !== captionStyle.shadow ? ` (and turned on; the preset ships without one)` : ''),
    )
  }

  // 2. THE WASH — only for footage bright enough that the shadow cannot carry it. This is the
  //    design's own first rule applied to the frames rather than to the dark mock the presets were
  //    drawn against, and it is what rescues chrome, whose gradient line has no plate at all.
  // For gradient type the palest stop is what has to survive, not the (unused) flat colour.
  const effectiveBase = style.gradient?.from ?? style.color
  if (needsScrim({ baseColor: effectiveBase, band, hasBackplate: hadBackplate, isGradient: Boolean(style.gradient) })) {
    style = { ...style, backplate: 'scrim', scrimPct: style.scrimPct ?? 46 }
    notes.push(`[captions] ${style.preset}: ${brightness} — added a scrim; a deeper shadow alone won't hold this frame`)
  }

  // 3. Deepen that wash until the preset's OWN accent lands as drawn. The accent is never
  //    reassigned; see the note in @reels/core/captions/legibility for the measurement that
  //    ruled that out.
  if (style.backplate === 'scrim') {
    const alpha = scrimAlphaFor({ baseColor: effectiveBase, accentColor: style.highlightColor, band })
    if (alpha > (style.scrimAlpha ?? SCRIM_BASE_ALPHA)) {
      const before = contrastRatio(luminanceOf(style.highlightColor), band.peakLuminance * (1 - SCRIM_BASE_ALPHA * 0.62))
      style = { ...style, scrimAlpha: alpha }
      notes.push(
        `[captions] ${style.preset}: accent ${style.highlightColor} read ${before.toFixed(1)}:1 here — scrim deepened ${SCRIM_BASE_ALPHA} → ${alpha} so it keeps its own colour`,
      )
    }
    const short = residualShortfall({ baseColor: effectiveBase, band, alpha: style.scrimAlpha ?? SCRIM_BASE_ALPHA })
    if (short > 0) {
      notes.push(
        `[captions] ${style.preset}: still ${short.toFixed(1)} short of the reading bar on the brightest frame — ` +
        `left there deliberately, since closing it needs a wash heavy enough to letterbox the shot`,
      )
    }
  }

  return { style, notes }
}
