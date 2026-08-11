import { describe, it, expect } from 'vitest'
import {
  contrastRatio, luminanceOf, needsScrim, needsWash, scrimAlphaFor, shadowAlphaFor,
  effectiveBackdrop, residualShortfall, SCRIM_BASE_ALPHA, SHADOW_BASE_ALPHA, ACCENT_PALETTE,
} from './legibility.js'

const band = (peak: number) => ({ luminance: peak, peakLuminance: peak })

// The three regimes the ladder is built around: leave it alone, deepen the shadow, spend picture.
const DARK = band(0.05)   // Edge's night city
const MID = band(0.4)     // a lit interior
const FLAT_BRIGHT = band(0.72) // a white studio wall

describe('caption legibility', () => {
  it('measures contrast the way WCAG does', () => {
    expect(contrastRatio(luminanceOf('#ffffff'), luminanceOf('#000000'))).toBeCloseTo(21, 0)
    expect(contrastRatio(luminanceOf('#ffffff'), luminanceOf('#ffffff'))).toBeCloseTo(1, 5)
  })

  describe('the ladder — cheapest device first', () => {
    it('touches nothing over dark footage', () => {
      expect(shadowAlphaFor(DARK)).toBe(SHADOW_BASE_ALPHA)
      expect(needsScrim({ baseColor: '#ffffff', band: DARK, hasBackplate: false })).toBe(false)
    })

    it('deepens only the glyph shadow over a lit interior — no picture spent', () => {
      expect(shadowAlphaFor(MID)).toBeGreaterThan(SHADOW_BASE_ALPHA)
      expect(needsWash(MID)).toBe(false)
      expect(needsScrim({ baseColor: '#ffffff', band: MID, hasBackplate: false })).toBe(false)
    })

    it('spends picture only when a shadow cannot carry the frame', () => {
      expect(needsWash(FLAT_BRIGHT)).toBe(true)
      expect(needsScrim({ baseColor: '#ffffff', band: FLAT_BRIGHT, hasBackplate: false })).toBe(true)
    })

    it('never reaches past a wash into a letterbox', () => {
      const alpha = scrimAlphaFor({ baseColor: '#ffffff', accentColor: '#E8B04B', band: FLAT_BRIGHT })
      expect(alpha).toBeLessThanOrEqual(0.68)
      // …and says what it could not close, rather than paying for it with the image.
      expect(residualShortfall({ baseColor: '#ffffff', band: FLAT_BRIGHT, alpha })).toBeGreaterThan(0)
    })
  })

  it('gives gradient type the wash earlier — an outline is all a shadow can give it', () => {
    // chrome's palest stop on a lit interior: a shadow separates a solid fill, not a pale ramp.
    expect(needsScrim({ baseColor: '#bfe4ff', band: MID, hasBackplate: false })).toBe(false)
    expect(needsScrim({ baseColor: '#bfe4ff', band: MID, hasBackplate: false, isGradient: true })).toBe(true)
  })

  it('leaves a preset with its own panel completely alone', () => {
    // A bar or lower third decides its own contrast; the footage behind it never reaches the type.
    expect(needsScrim({ baseColor: '#ffffff', band: band(0.95), hasBackplate: true })).toBe(false)
  })

  it('keeps the design’s scrim value when the frame is kind', () => {
    expect(scrimAlphaFor({ baseColor: '#ffffff', accentColor: '#E8B04B', band: DARK })).toBe(SCRIM_BASE_ALPHA)
  })

  it('deepens the wash instead of repainting the accent', () => {
    // The accent is an input here, never an output — nothing in this module returns a colour.
    const alpha = scrimAlphaFor({ baseColor: '#ffffff', accentColor: '#E8B04B', band: band(0.5) })
    expect(alpha).toBeGreaterThan(SCRIM_BASE_ALPHA)
  })

  it('counts a panel as its own backdrop and a scrim as a partial one', () => {
    expect(effectiveBackdrop(band(0.9), 'bar')).toBeLessThan(0.05)
    const scrimmed = effectiveBackdrop(band(0.9), 'scrim', 0.62)
    expect(scrimmed).toBeLessThan(0.9)
    expect(scrimmed).toBeGreaterThan(0)
    expect(effectiveBackdrop(band(0.9), undefined)).toBe(0.9)
  })

  it('holds the palette as a closed set of real preset accents', () => {
    expect(new Set(ACCENT_PALETTE).size).toBe(ACCENT_PALETTE.length)
    for (const hex of ACCENT_PALETTE) expect(hex).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
