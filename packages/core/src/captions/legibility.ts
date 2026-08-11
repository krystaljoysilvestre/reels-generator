// Keeping a caption readable over the footage it actually sits on.
//
// A preset's accent is chosen for the preset, not for the reel. Over dark footage the palette
// works; over a bright frame — a white office, an overcast sky, snow — a pale accent has nothing
// to hold it and the word the line lands on disappears into the picture. chrome is the extreme
// case: its whole line is a cool-to-warm gradient with no plate behind it, so on a bright frame
// there is no caption at all, just a faint shimmer.
//
// The design's own first rule is the answer: "Contrast from a scrim — a soft gradient wash behind
// the line, not a heavy stroke choking every glyph." So legibility here is bought the way the
// design buys it: a wash when the line needs one, and an accent drawn FROM THE SAME PALETTE
// rather than an arbitrary high-contrast colour. Nothing invents a hue the system doesn't own.
//
// All of this is measured per reel and costs nothing — see measureCaptionBand in the render
// package, which reads the frames the reel already generated.

/**
 * The design's accent palette — every colour any preset uses. Four families sharing one chroma.
 * Kept as the system's record of what an accent may be; nothing here reassigns one (see below).
 */
export const ACCENT_PALETTE = [
  '#E8B04B', // gold
  '#F4C24E', // amber
  '#F4D24E', // yellow
  '#C4E070', // lime
  '#B8E04B', // acid lime
  '#A9C4A0', // sage
  '#5FB6A6', // teal
  '#7FB2E8', // blue
  '#4CC5FF', // cyan
  '#F0806E', // coral
  '#F2A177', // apricot
  '#F0A79B', // blush
  '#E8564B', // red
  '#C05149', // brick
] as const

// WCAG's large-text threshold, for the question WCAG is actually about: can you read the words?
// Captions are always large text — the smallest preset here is 49px on a 1080-wide frame — so 3:1
// is the right bar, not the 4.5:1 body-copy one. This governs the SCRIM decision.
const MIN_TEXT_CONTRAST = 3

// The accent is a different question, and holding it to the reading bar is wrong. The line's
// legibility is already bought by the scrim and the shadow; the accent only has to be SEEN as
// accented among white words, and hue does much of that work that a luminance ratio can't see.
// Held at 3:1, the only palette colours that survive a lit frame are the yellows and limes — so
// coral, brick and teal presets all collapsed onto the same yellow, which is a house style by
// accident and exactly the monoculture this system is built to avoid.
const MIN_ACCENT_CONTRAST = 2
// An accent also has to read as an accent: too close to the base colour and it stops being one.
const MIN_ACCENT_SEPARATION = 1.45

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance, 0–1. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG contrast ratio between two luminances, 1–21. */
export function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export function luminanceOf(hex: string): number {
  const rgb = parseHex(hex)
  return rgb ? relativeLuminance(rgb) : 0
}

export interface BandReading {
  /** Mean relative luminance of the caption band across the reel's frames, 0–1. */
  luminance: number
  /** The brightest frame's band luminance — the worst case a single accent has to survive. */
  peakLuminance: number
}

/**
 * The luminance a caption is actually drawn against, once its own backplate is accounted for.
 * A scrim or plate darkens the footage before any text lands on it, so judging contrast against
 * the raw frame would swap accents that were never in trouble.
 */
export function effectiveBackdrop(band: BandReading, backplate: string | undefined, scrimAlpha?: number): number {
  switch (backplate) {
    // Opaque-enough panels: the footage behind them stops mattering.
    case 'bar': return 0.02
    case 'block': return 0.02
    // The wash reaches its alpha at the frame edge and fades to nothing at `scrimPct`, so where
    // the text actually sits it has removed roughly a third of the footage's luminance — not all
    // of it. Overstating the scrim would leave accents judged against a frame darker than the one
    // that ships.
    case 'scrim': return band.peakLuminance * (1 - (scrimAlpha ?? SCRIM_BASE_ALPHA) * 0.62)
    default: return band.peakLuminance
  }
}

// ── WHY THE ACCENT IS NOT SWAPPED ─────────────────────────────────────────────────────────────
// The obvious version of "choose a smarter accent per reel" is to score the palette against the
// measured footage and take the best colour. It was built and measured against the three finished
// reels, and it fails in a specific, instructive way: against any one backdrop the palette splits
// into "clears the bar" and "doesn't", so every preset in trouble funnels into whichever colour is
// nearest the survivors. On the bright Crossroads frames, twelve of twenty presets landed on the
// SAME colour — #F4D24E at one threshold, #C05149 at another. A rule meant to protect the palette
// was deleting it: gold, teal, blue and coral presets all rendering the same hue is a house style
// arrived at by accident, and visual monoculture is the thing this system is most explicitly built
// to avoid.
//
// It is also the wrong lever on its own terms. sable's gold IS sable; repainting it brick because
// one scene is lit does not make it a legible sable, it makes it not-sable.
//
// So the ground moves instead of the colour. The design's own first rule — "contrast from a scrim,
// not a heavy stroke" — already says how: deepen the wash until the preset's own palette lands as
// drawn. Identity survives, legibility is bought, and no reel is pushed off-palette.

/** How dark the scrim reaches at the frame edge. The design's own value; the floor here. */
export const SCRIM_BASE_ALPHA = 0.62
// Past this a wash stops being a wash and becomes a letterbox. Measured, not guessed: solving for
// WCAG 3:1 on a lit frame asks for ~0.88, and at that value the render is a black slab with the
// picture behind it — worse than the problem. The cap holds the wash soft and the shortfall is
// reported instead of being paid for with the image.
const SCRIM_MAX_ALPHA = 0.68

// ── THE LADDER: local device first, regional device only for the extreme ──────────────────────
// WCAG contrast cannot see a glyph shadow, so solving for it alone pushes straight to a wash —
// and a wash darkens picture. But a shadow darkens only the few pixels around each letter: it is
// invisible as a shape and it is the exact device the design uses ("legibility comes from a soft
// scrim, no 12px black outlines choking every glyph" — a shadow is neither a stroke nor a box).
// So brightness is answered in order of how little of the image it costs:
//
//   band < 0.25   dark footage — nothing at all. The preset ships as drawn.
//   0.25 … 0.55   deepen the glyph shadow. No wash: the shadow carries these frames.
//   > 0.55        shadow at full, AND a wash — the only case worth spending picture on.
//
// The thresholds are craft, not a derivation, and they are stated here so they can be argued with.
const SHADOW_RAMP_START = 0.25
const SHADOW_RAMP_END = 0.55
/** The design's own shadow alpha, and the floor here. */
export const SHADOW_BASE_ALPHA = 0.45
const SHADOW_MAX_ALPHA = 0.8

/**
 * How dark this footage needs the glyph shadow. Returns the design's own value for footage that
 * doesn't need help, ramping to SHADOW_MAX_ALPHA as the band brightens.
 */
export function shadowAlphaFor(band: BandReading): number {
  const t = (band.peakLuminance - SHADOW_RAMP_START) / (SHADOW_RAMP_END - SHADOW_RAMP_START)
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  const alpha = SHADOW_BASE_ALPHA + (SHADOW_MAX_ALPHA - SHADOW_BASE_ALPHA) * clamped
  return Math.round(alpha * 100) / 100
}

/** Bright enough that the glyph shadow alone won't carry it, and a wash is worth the picture. */
export function needsWash(band: BandReading): boolean {
  return band.peakLuminance > SHADOW_RAMP_END
}

/**
 * The scrim alpha this footage needs, so that base text clears the reading bar and the preset's
 * own accent still reads as an accent. Returns the design's default when the frame is already
 * kind to the caption.
 *
 * The scrim's fade means the text sits over roughly two-thirds of the edge alpha, so that is what
 * is solved for — see effectiveBackdrop.
 */
export function scrimAlphaFor(args: { baseColor: string; accentColor: string; band: BandReading }): number {
  const { baseColor, accentColor, band } = args
  const baseLum = luminanceOf(baseColor)
  const accentLum = luminanceOf(accentColor)

  for (let alpha = SCRIM_BASE_ALPHA; alpha <= SCRIM_MAX_ALPHA + 1e-9; alpha += 0.02) {
    // Alpha at the text, not at the frame edge: the wash has faded by the time it gets there.
    const backdrop = band.peakLuminance * (1 - alpha * 0.62)
    const textOk = contrastRatio(baseLum, backdrop) >= MIN_TEXT_CONTRAST
    const accentOk = contrastRatio(accentLum, backdrop) >= MIN_ACCENT_CONTRAST
    if (textOk && accentOk) return Math.round(alpha * 100) / 100
  }
  return SCRIM_MAX_ALPHA
}

/**
 * What the caption still falls short by once the wash is as deep as it is allowed to get. Zero when
 * nothing is left on the table. Surfaced so a frame the system cannot fully rescue is a logged fact
 * rather than a silent compromise.
 */
export function residualShortfall(args: { baseColor: string; band: BandReading; alpha: number }): number {
  const backdrop = args.band.peakLuminance * (1 - args.alpha * 0.62)
  const got = contrastRatio(luminanceOf(args.baseColor), backdrop)
  return got >= MIN_TEXT_CONTRAST ? 0 : Math.round((MIN_TEXT_CONTRAST - got) * 10) / 10
}

/**
 * Does this line need a wash to sit on at all? Only asked of presets that have no backplate — the
 * design's answer to a bright frame is a scrim, not a heavier stroke.
 */
export function needsScrim(args: {
  baseColor: string
  band: BandReading
  hasBackplate: boolean
  /**
   * True for gradient type, which takes the wash more readily. A shadow works by darkening the
   * pixels AROUND a glyph, which separates a solid fill well — but a gradient line's palest stop is
   * nearly the colour of a lit wall, so an outline is all the shadow can give it and the letters
   * still read as a shimmer. chrome was drawn for an arcade; on a lit frame it needs the ground.
   */
  isGradient?: boolean
}): boolean {
  if (args.hasBackplate) return false
  const inTrouble = contrastRatio(luminanceOf(args.baseColor), args.band.peakLuminance) < MIN_TEXT_CONTRAST
  // Normally BOTH: the type has to be in trouble AND the frame bright enough that a deeper shadow
  // won't do. Either test alone put a wash on frames a shadow could have carried on its own.
  return inTrouble && (args.isGradient === true || needsWash(args.band))
}
