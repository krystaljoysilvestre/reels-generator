import { describe, it, expect } from 'vitest'
import { retileToNarration } from './scene-tiling.js'

// Taglish with dialogue, straight quotes, and an ellipsis — the exact shape that made the LLM drop chars.
const NARRATION =
  'Naglakad ako sa CR. Sabi ko: "Balikan mo na." May sumagot agad. "Nakuha mo?" Natahimik ako... May babae sa tabi ko.'

describe('retileToNarration', () => {
  it('returns exact, gapless spans for an already-clean split', () => {
    const texts = [
      'Naglakad ako sa CR.',
      ' Sabi ko: "Balikan mo na."',
      ' May sumagot agad.',
      ' "Nakuha mo?" Natahimik ako... May babae sa tabi ko.',
    ]
    const out = retileToNarration(NARRATION, texts)!
    expect(out).not.toBeNull()
    expect(out.join('')).toBe(NARRATION) // gapless + verbatim
    expect(out.length).toBe(4)
  })

  it('absorbs a dropped middle span into the preceding scene (gap → still tiles)', () => {
    // The LLM dropped "May sumagot agad." entirely between scenes 2 and 3.
    const texts = [
      'Naglakad ako sa CR.',
      ' Sabi ko: "Balikan mo na."',
      ' "Nakuha mo?" Natahimik ako... May babae sa tabi ko.',
    ]
    const out = retileToNarration(NARRATION, texts)!
    expect(out.join('')).toBe(NARRATION) // no gap in the output
    expect(out[1]).toContain('May sumagot agad.') // the dropped text folded into scene 2
  })

  it('fixes punctuation drift (curly quotes in the LLM text) by slicing the real narration', () => {
    const texts = [
      'Naglakad ako sa CR.',
      ' Sabi ko: “Balikan mo na.”', // curly quotes — not verbatim
      ' May sumagot agad.',
      ' “Nakuha mo?” Natahimik ako... May babae sa tabi ko.',
    ]
    const out = retileToNarration(NARRATION, texts)!
    expect(out.join('')).toBe(NARRATION) // output is the real (straight-quote) text
    expect(out[1]).toContain('"Balikan mo na."') // straight quotes, from the narration
  })

  it('covers leading text before the first located scene (scene 1 starts at 0)', () => {
    const texts = [' Sabi ko: "Balikan mo na."', ' May sumagot agad. "Nakuha mo?" Natahimik ako... May babae sa tabi ko.']
    const out = retileToNarration(NARRATION, texts)!
    expect(out.join('')).toBe(NARRATION)
    expect(out[0]!.startsWith('Naglakad ako sa CR.')).toBe(true) // absorbed the leading sentence
  })

  it('returns null when a scene head cannot be located (invented text)', () => {
    const texts = ['Naglakad ako sa CR.', 'Ito ay wala talaga sa kuwento na ito.']
    expect(retileToNarration(NARRATION, texts)).toBeNull()
  })

  it('returns null on out-of-order scene starts', () => {
    const texts = [' "Nakuha mo?" Natahimik ako', 'Naglakad ako sa CR.'] // second starts before first
    expect(retileToNarration(NARRATION, texts)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(retileToNarration(NARRATION, [])).toBeNull()
  })
})
