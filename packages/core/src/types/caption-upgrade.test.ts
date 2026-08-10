import { describe, expect, it } from 'vitest'
import { CaptionStyleSchema, resolveCaptionStyle, CAPTION_PRESETS } from './channel.js'

// The publish-bar audit (2026-08-10) found that replacing the caption presets in 352f3a1 remapped only the
// preset ID — the render step reads the stored RESOLVED style, so every channel created before that commit
// kept its old fontFamily / animation / stroke. These are the two halves of the fix, and BOTH have to hold:
// the look must actually change, and the creator's own overrides must survive it. A test that only asserted
// one would pass a build that either did nothing or wiped the creator's brand colour.

// Verbatim from the DB — the three channels whose reels prompted the audit.
const CROSSROADS = {
  preset: 'marker', mode: 'word', animation: 'marker',
  fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSizePx: 56,
  uppercase: false, italic: false, letterSpacingEm: 0,
  color: '#f4f4f4', activeColor: '#ffffff', highlightColor: '#0057b8',
  stroke: { color: '#000000', widthPx: 6 }, shadow: 'hard', position: 'bottom', rotationDeg: 0,
}
const EMBERLIGHT = {
  preset: 'elegant', mode: 'block', animation: 'fade',
  fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontSizePx: 40,
  uppercase: false, italic: true, letterSpacingEm: 0.18,
  color: '#ffffff', activeColor: '#ffffff', highlightColor: '#d9b46a',
  stroke: { color: '#000000', widthPx: 2 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
}

describe('legacy caption style upgrade', () => {
  it('moves a retired preset to its replacement', () => {
    expect(CaptionStyleSchema.parse(CROSSROADS).preset).toBe('notebook')
    expect(CaptionStyleSchema.parse(EMBERLIGHT).preset).toBe('halo')
  })

  it('actually changes the look — the half that was silently missing before', () => {
    const upgraded = CaptionStyleSchema.parse(EMBERLIGHT)
    // Proving the new preset LANDED rather than the old style persisting under a new name. Asserting only
    // that the preset id moved is what the shipped remap already did, and it changed nothing on screen.
    expect(upgraded.fontFamily).not.toBe(EMBERLIGHT.fontFamily)
    expect(upgraded.fontFamily).toBe(CAPTION_PRESETS.halo.fontFamily)
    expect(upgraded.fontWeight).toBe(CAPTION_PRESETS.halo.fontWeight)
    expect(upgraded.stroke.widthPx).toBe(CAPTION_PRESETS.halo.stroke.widthPx)
    expect(upgraded.uppercase).toBe(CAPTION_PRESETS.halo.uppercase)
  })

  it("keeps the creator's deliberate override and drops the old preset's default", () => {
    const upgraded = CaptionStyleSchema.parse(CROSSROADS)
    // #0057b8 differs from legacy `marker`'s own #ffe11a, so it is the creator's brand accent.
    expect(upgraded.highlightColor).toBe('#0057b8')
    expect(upgraded.color).toBe('#f4f4f4')

    // Emberlight stored `elegant`'s defaults unchanged, so it must adopt the replacement whole. If the
    // diff were taken against the NEW preset instead, this would wrongly come back as '#d9b46a' — the
    // channel keeping the very look it is supposed to be leaving.
    expect(CaptionStyleSchema.parse(EMBERLIGHT).highlightColor).toBe(CAPTION_PRESETS.halo.highlightColor)
  })

  it('carries a size override as a ratio, not a pixel count', () => {
    // A creator who scaled legacy `marker` (56px) up by a third meant the third; `notebook`'s base is 54.
    const scaled = CaptionStyleSchema.parse({ ...CROSSROADS, fontSizePx: Math.round(56 * 1.25) })
    expect(scaled.fontSizePx).toBe(Math.round(CAPTION_PRESETS.notebook.fontSizePx * (70 / 56)))
    // ...and an untouched size adopts the replacement's own base rather than carrying 56px across.
    expect(CaptionStyleSchema.parse(CROSSROADS).fontSizePx).toBe(CAPTION_PRESETS.notebook.fontSizePx)
  })

  it('preserves the captions-off switch, which belongs to the creator and not to any preset', () => {
    expect(CaptionStyleSchema.parse({ ...EMBERLIGHT, enabled: false }).enabled).toBe(false)
  })

  it('leaves a current preset untouched — resolution happens once, where the creator chose it', () => {
    // The no-regression case: a channel created today must not be re-resolved on every read, or a
    // deliberate tweak would be indistinguishable from a stale value.
    const current = resolveCaptionStyle('sable', { highlightColor: '#123456', fontScale: 1.2 })
    expect(CaptionStyleSchema.parse(current)).toEqual(current)
  })

  it('is idempotent — upgrading an upgraded style is a no-op', () => {
    const once = CaptionStyleSchema.parse(CROSSROADS)
    expect(CaptionStyleSchema.parse(once)).toEqual(once)
  })
})
