import { describe, it, expect } from 'vitest'
import {
  computeTimings,
  outroTailMs,
  endingTailMs,
  AlignmentLengthError,
  SceneCoverageError,
  type ComputeTimingsInput,
  type SceneSpan,
} from './compute-timings.js'
import type { AlignedChar } from '../types/timings.js'
import type { AudioScript } from '../types/audio-script.js'

// ── Fixture helpers ───────────────────────────────────────────────────────────

// Build a synthetic alignment where each code point gets evenly-spaced ms.
function syntheticAlignment(narration: string, totalMs = 10000): AlignedChar[] {
  const cps = Array.from(narration)
  const msPerCp = totalMs / cps.length
  return cps.map((ch, i) => ({
    ch,
    startMs: Math.round(i * msPerCp),
    endMs: Math.round((i + 1) * msPerCp),
  }))
}

function silentAudioScript(): AudioScript {
  return {
    ambient: { packTags: ['province_night'], evolution: null },
    sfx: [],
    silenceDrop: null,
    music: null,
  }
}

function singleScene(narration: string): SceneSpan[] {
  return [{ idx: 1, narrationText: narration, tier: 'still' }]
}

// ── F1: Taglish code-switch SFX placement ────────────────────────────────────
describe('F1 — Taglish code-switch SFX placement', () => {
  it('places SFX on an English word mid-Tagalog narration', () => {
    const narration = "Tapos biglang nag-ring 'yung phone ko sa lamesa."
    const alignment = syntheticAlignment(narration, 6000)
    const audioScript: AudioScript = {
      ...silentAudioScript(),
      sfx: [{ anchor: 'phone', offsetMs: 0, prompt: 'phone ringing', volumeDb: -8, impactAtEnd: false }],
    }
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 6000,
      scenes: singleScene(narration),
      audioScript,
      twistAnchor: 'phone',
    }
    const result = computeTimings(input)

    expect(result.sfxEvents).toHaveLength(1)
    const ev = result.sfxEvents[0]!
    // SFX should be at the start of "phone" in the narration
    const phoneIdx = Array.from(narration).findIndex((_, i) =>
      narration.slice(i, i + 5) === 'phone',
    )
    const expectedMs = alignment[phoneIdx]!.startMs
    expect(ev.atMs).toBe(expectedMs)
    expect(result.warnings).toHaveLength(0)
  })
})

// ── F1b: Sustained SFX span (endAnchor → endMs) ──────────────────────────────
describe('F1b — sustained SFX span resolution', () => {
  const narration = 'Naglakad ako papunta sa banyo. Binuksan ko ang pinto at pumasok ako.'

  function inputWith(sfx: AudioScript['sfx']): ComputeTimingsInput {
    return {
      narration,
      alignment: syntheticAlignment(narration, 10000),
      durationMs: 10000,
      scenes: singleScene(narration),
      audioScript: { ...silentAudioScript(), sfx },
      twistAnchor: 'pinto',
    }
  }

  it('resolves endAnchor to the END of the end phrase and carries endMs on the event', () => {
    const result = computeTimings(inputWith([
      { anchor: 'Naglakad', endAnchor: 'Binuksan ko ang pinto', offsetMs: 0, prompt: 'slow heartbeat, seamless loop', volumeDb: -9, impactAtEnd: false },
    ]))
    expect(result.sfxEvents).toHaveLength(1)
    const ev = result.sfxEvents[0]!
    expect(ev.endMs).toBeDefined()
    expect(ev.endMs!).toBeGreaterThan(ev.atMs)
    // The span ends at the END of the endAnchor phrase, not its start.
    const endIdx = narration.indexOf('Binuksan ko ang pinto') + 'Binuksan ko ang pinto'.length - 1
    expect(ev.endMs).toBe(syntheticAlignment(narration, 10000)[endIdx]!.endMs)
    expect(result.warnings).toHaveLength(0)
  })

  it('rescues a case-mismatched endAnchor via the fuzzy pass (LLM lowercases sentence starts)', () => {
    const result = computeTimings(inputWith([
      { anchor: 'Naglakad', endAnchor: 'binuksan ko ang pinto', offsetMs: 0, prompt: 'loop', volumeDb: -9, impactAtEnd: false },
    ]))
    expect(result.sfxEvents).toHaveLength(1)
    expect(result.sfxEvents[0]!.endMs).toBeDefined()
    expect(result.warnings).toHaveLength(0)
  })

  it('degrades to a one-shot (no endMs) with a warning when endAnchor is unresolvable', () => {
    const result = computeTimings(inputWith([
      { anchor: 'Naglakad', endAnchor: 'this text is not in the narration', offsetMs: 0, prompt: 'loop', volumeDb: -9, impactAtEnd: false },
    ]))
    expect(result.sfxEvents).toHaveLength(1)
    expect(result.sfxEvents[0]!.endMs).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('endAnchor'))).toBe(true)
  })

  it('degrades to a one-shot when endAnchor resolves BEFORE the start anchor', () => {
    const result = computeTimings(inputWith([
      { anchor: 'pumasok', endAnchor: 'Naglakad', offsetMs: 0, prompt: 'loop', volumeDb: -9, impactAtEnd: false },
    ]))
    expect(result.sfxEvents).toHaveLength(1)
    expect(result.sfxEvents[0]!.endMs).toBeUndefined()
    expect(result.warnings.some((w) => w.includes('endAnchor'))).toBe(true)
  })
})

// ── F1c: Climax ring-out room (§4.7) ─────────────────────────────────────────
describe('F1b — outro tail (§4.65)', () => {
  const narration = 'Naglakad ako sa madilim na pasilyo. May nakatayo sa dulo.'
  // exactOptionalPropertyTypes: only SET genreCategory when there is one
  const baseTailInput = (genreCategory?: string): ComputeTimingsInput => ({
    narration,
    alignment: syntheticAlignment(narration, 10000),
    durationMs: 10000,
    scenes: singleScene(narration),
    audioScript: silentAudioScript(),
    twistAnchor: '',
    ...(genreCategory ? { genreCategory } : {}),
  })

  it('holds the closing image past the last spoken word', () => {
    const r = computeTimings(baseTailInput())
    expect(r.durationMs).toBe(10000 + outroTailMs(undefined))
    // the tail is a held FINAL FRAME: the last scene owns it, so the visual keeps playing
    expect(r.scenes[r.scenes.length - 1]!.endMs).toBe(r.durationMs)
  })

  it('gives each genre its own room to breathe (comedy buttons out; wonder lingers)', () => {
    const comedy = computeTimings(baseTailInput('comedy')).durationMs
    const informational = computeTimings(baseTailInput('informational')).durationMs
    const fairytale = computeTimings(baseTailInput('fairytale')).durationMs
    expect(comedy).toBeLessThan(informational)
    expect(informational).toBeLessThan(fairytale)
    expect(outroTailMs('comedy')).toBe(800)
  })

  it('caps the tail and falls back for an unknown or empty genre', () => {
    expect(outroTailMs('not-a-genre')).toBe(outroTailMs(undefined))
    expect(outroTailMs('')).toBe(outroTailMs(undefined))
    for (const g of ['horror', 'comedy', 'drama', 'fairytale', 'childrens', 'informational', 'general']) {
      expect(outroTailMs(g)).toBeLessThanOrEqual(3000)
      expect(outroTailMs(g)).toBeGreaterThan(0)
    }
  })

  it('subsumes the ring-out: a normal end-hit no longer needs its own extension', () => {
    // Same end-anchored loud hit as F1c, but on a reel long enough that tail + narration already
    // give the hit its decay room — the ring-out must not stack a second extension on top.
    const long = 'Naglakad ako sa madilim na pasilyo at tumigil. May nakatayo sa dulo.'
    const r = computeTimings({
      narration: long,
      alignment: syntheticAlignment(long, 20000),
      durationMs: 20000,
      scenes: singleScene(long),
      audioScript: { ...silentAudioScript(), sfx: [{ anchor: 'pasilyo', offsetMs: 0, prompt: 'bang', volumeDb: 6, impactAtEnd: false }] },
      twistAnchor: '',
      genreCategory: 'horror',
    })
    expect(r.durationMs).toBe(20000 + outroTailMs('horror'))
    expect(r.warnings.some((w) => w.includes('ring-out'))).toBe(false)
  })

  it('resolves explicit ending intent without a genre-authored duration', () => {
    const input = baseTailInput('informational')
    input.audioScript = {
      ...input.audioScript,
      ending: { anchor: 'May nakatayo sa dulo.', focus: 'music', shape: 'resolve' },
    }
    const r = computeTimings(input)
    const expectedStart = input.alignment[narration.indexOf('May nakatayo')]!.startMs
    expect(r.ending).toEqual({
      startMs: expectedStart,
      voiceEndMs: 10_000,
      endMs: 10_000 + endingTailMs('resolve', 'music'),
      focus: 'music',
      shape: 'resolve',
    })
    expect(r.durationMs).toBe(12_600)
    expect(r.outroTailMs).toBeUndefined()
  })

  it('gives a resolve enough post-voice hold to land before its terminal release', () => {
    expect(endingTailMs('button', 'music')).toBe(650)
    expect(endingTailMs('resolve', 'music')).toBe(2600)
    expect(endingTailMs('ring_out', 'music')).toBe(3000)
    // Silence remains a deliberate short hold, not generic dead air.
    expect(endingTailMs('resolve', 'silence')).toBe(900)
  })

  it('caps an explicitly intentional silent hold', () => {
    const input = baseTailInput()
    input.audioScript = {
      ...input.audioScript,
      ending: { anchor: 'May nakatayo sa dulo.', focus: 'silence', shape: 'ring_out' },
    }
    const r = computeTimings(input)
    expect(r.durationMs).toBe(10_900)
    expect(r.ending?.voiceEndMs).toBe(10_000)
  })
})

describe('F1c — climax ring-out room', () => {
  // A loud hit anchored on the LAST word → little room after it → reel extends so the tail can decay.
  it('extends the reel when a loud climax hit lands at the very end', () => {
    const narration = 'Naglakad ako sa madilim na pasilyo. May nakatayo sa dulo.'
    const alignment = syntheticAlignment(narration, 10000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 10000,
      scenes: singleScene(narration),
      audioScript: { ...silentAudioScript(), sfx: [{ anchor: 'sa dulo', offsetMs: 0, prompt: 'sudden bang', volumeDb: 6, impactAtEnd: false }] },
      twistAnchor: 'sa dulo',
    }
    const r = computeTimings(input)
    expect(r.durationMs).toBeGreaterThan(10000)               // extended
    const hitAt = r.sfxEvents[0]!.atMs
    expect(r.durationMs - hitAt).toBeGreaterThanOrEqual(6999) // ~RING_OUT_MS of room after the hit
    expect(r.scenes[r.scenes.length - 1]!.endMs).toBe(r.durationMs) // last scene holds through the tail
    expect(r.warnings.some((w) => w.includes('ring-out'))).toBe(true)
  })

  it('does NOT extend when the loud hit is mid-story (tail rings out over what follows)', () => {
    const narration = 'May malakas na putok. Tapos tumakbo ako palabas ng gusali papunta sa kalsada nang mabilis.'
    const alignment = syntheticAlignment(narration, 12000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 12000,
      scenes: singleScene(narration),
      audioScript: { ...silentAudioScript(), sfx: [{ anchor: 'putok', offsetMs: 0, prompt: 'bang', volumeDb: 6, impactAtEnd: false }] },
      twistAnchor: 'putok',
    }
    const r = computeTimings(input)
    // plenty of room after an early hit → no ring-out extension; the outro tail (§4.65) still applies
    expect(r.durationMs).toBe(12000 + outroTailMs(undefined))
  })

  it('does NOT extend for a quiet end cue (only a real hit triggers ring-out)', () => {
    const narration = 'Tahimik na tahimik. Umuwi na ako.'
    const alignment = syntheticAlignment(narration, 8000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 8000,
      scenes: singleScene(narration),
      audioScript: { ...silentAudioScript(), sfx: [{ anchor: 'Umuwi na ako', offsetMs: 0, prompt: 'soft footstep', volumeDb: -8, impactAtEnd: false }] },
      twistAnchor: 'Umuwi na ako',
    }
    const r = computeTimings(input)
    // quiet cue, reflective ending → no ring-out; only the outro tail extends it
    expect(r.durationMs).toBe(8000 + outroTailMs(undefined))
  })
})

// ── F2: Pause + punctuation chunking ─────────────────────────────────────────
describe('F2 — subtitle chunking', () => {
  it('breaks on sentence punctuation', () => {
    const narration = 'Una, narinig ko ang hagik. Pangalawa, nakita ko ang anino.'
    const alignment = syntheticAlignment(narration, 8000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 8000,
      scenes: singleScene(narration),
      audioScript: silentAudioScript(),
      twistAnchor: '',
    }
    const result = computeTimings(input)
    // Should not have a single chunk covering all 10 words
    expect(result.subtitles.length).toBeGreaterThan(1)
    // No chunk exceeds 84 chars
    for (const chunk of result.subtitles) {
      expect(chunk.text.length).toBeLessThanOrEqual(84)
    }
  })

  it('no chunk exceeds 7 words', () => {
    const narration = 'isa dalawa tatlo apat lima anim pito walo siyam sampu labing-isa'
    const alignment = syntheticAlignment(narration, 10000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 10000,
      scenes: singleScene(narration),
      audioScript: silentAudioScript(),
      twistAnchor: '',
    }
    const result = computeTimings(input)
    for (const chunk of result.subtitles) {
      const wordCount = chunk.text.trim().split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(7)
    }
  })
})

// ── F3: Music peak = twist ─────────────────────────────────────────────────────
describe('F3 — music peak anchor fallback', () => {
  it('uses twistAnchor when peakAnchor is empty', () => {
    const narration = 'Nagtataka ako. Pero alam ko na kung sino siya.'
    const alignment = syntheticAlignment(narration, 8000)
    const twistAnchor = 'alam ko na'
    const twistIdx = Array.from(narration).findIndex((_, i) =>
      narration.slice(i, i + twistAnchor.length) === twistAnchor,
    )
    const expectedPeakMs = alignment[twistIdx]!.startMs

    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 8000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        music: { type: 'riser_sting', startAnchor: '', peakAnchor: '', moodTags: ['climax'] },
      },
      twistAnchor,
    }
    const result = computeTimings(input)
    expect(result.music).not.toBeNull()
    expect(result.music!.peakAnchorMs).toBe(expectedPeakMs)
    expect(result.warnings).toHaveLength(0)
  })

  it('falls back to 0.8 × duration when both anchors unresolvable', () => {
    const narration = 'Maiksi lang ito.'
    const alignment = syntheticAlignment(narration, 5000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 5000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        music: { type: 'low_drone', startAnchor: '', peakAnchor: '', moodTags: [] },
      },
      twistAnchor: 'XXXXXXXXXX', // won't match
    }
    const result = computeTimings(input)
    expect(result.music!.peakAnchorMs).toBe(Math.round(0.8 * 5000))
    expect(result.warnings.some((w) => w.includes('fallback'))).toBe(true)
  })

  it('defaults the build start LATE when startAnchor is empty (act structure, not a whole-reel crawl)', () => {
    // A ~160s reel with the peak at 80%: the build must NOT start at t=0 — the bed holds flat and rises
    // over at most the final 45s into the peak.
    const narration = 'Ito ay isang mahabang kwento ng katatakutan na may mahabang narration na tumatagal. '.repeat(10).trim()
    const durationMs = 160_000
    const alignment = syntheticAlignment(narration, durationMs)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        music: { type: 'low_drone', startAnchor: '', peakAnchor: '', moodTags: ['dread'] },
      },
      twistAnchor: '',
    }
    const result = computeTimings(input)
    const peak = result.music!.peakAnchorMs // 0.8 × duration fallback
    expect(result.music!.startAnchorMs).toBe(peak - 45_000) // build spans the final 45s, not the whole reel
    expect(result.music!.startAnchorMs).toBeGreaterThan(0)
    expect(result.music!.startAnchorMs).toBeLessThan(peak)
  })

  it('build-start default respects the 55%-of-peak floor on short reels', () => {
    // Peak at 4000ms on a 5s reel: peak−45s would be negative, so the floor (0.55 × peak) wins.
    const narration = 'Maiksi lang ito.'
    const alignment = syntheticAlignment(narration, 5000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 5000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        music: { type: 'low_drone', startAnchor: '', peakAnchor: '', moodTags: [] },
      },
      twistAnchor: '',
    }
    const result = computeTimings(input)
    const peak = result.music!.peakAnchorMs
    expect(result.music!.startAnchorMs).toBe(Math.round(0.55 * peak))
  })
})

// ── F4: Silence drop ─────────────────────────────────────────────────────────
describe('F4 — silence drop', () => {
  it('resolves silence drop to correct ms', () => {
    const narration = 'Huminto ang kanyang paghinga.'
    const alignment = syntheticAlignment(narration, 4000)
    const anchor = 'Huminto'
    const anchorIdx = 0 // starts at beginning
    const expectedAtMs = alignment[anchorIdx]!.startMs

    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 4000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        silenceDrop: { anchor, durationMs: 1200 },
      },
      twistAnchor: '',
    }
    const result = computeTimings(input)
    expect(result.silenceDrop).not.toBeNull()
    expect(result.silenceDrop!.atMs).toBe(expectedAtMs)
    expect(result.silenceDrop!.durationMs).toBe(1200)
  })

  it('clamps silenceDrop.durationMs when it would exceed reel end', () => {
    const narration = 'Katapusan.'
    const alignment = syntheticAlignment(narration, 2000)
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 2000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        silenceDrop: { anchor: 'Katapusan', durationMs: 5000 }, // 5s > 2s reel
      },
      twistAnchor: '',
    }
    const result = computeTimings(input)
    // atMs = start of "Katapusan" ≈ 0ms; durationMs should be clamped
    expect(result.silenceDrop!.durationMs).toBeLessThanOrEqual(2000)
  })
})

// ── F5: Scene tiling ──────────────────────────────────────────────────────────
describe('F5 — scene tiling', () => {
  it('produces gapless cut points from contiguous scenes', () => {
    const part1 = 'Isang gabi, narinig ko ang ingay. '
    const part2 = 'Lumabas ako ng silid.'
    const narration = part1 + part2
    const alignment = syntheticAlignment(narration, 6000)
    const scenes: SceneSpan[] = [
      { idx: 1, narrationText: part1.trim(), tier: 'video' },
      { idx: 2, narrationText: part2.trim(), tier: 'still' },
    ]
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 6000,
      scenes,
      audioScript: silentAudioScript(),
      twistAnchor: '',
    }
    const result = computeTimings(input)
    expect(result.scenes).toHaveLength(2)
    // Strictly increasing
    expect(result.scenes[1]!.startMs).toBeGreaterThan(result.scenes[0]!.startMs)
    // Gapless: scene[0].endMs === scene[1].startMs
    expect(result.scenes[0]!.endMs).toBe(result.scenes[1]!.startMs)
    // Last endMs === durationMs, which now includes the outro tail (§4.65)
    expect(result.scenes[1]!.endMs).toBe(result.durationMs)
    expect(result.scenes[1]!.endMs).toBe(6000 + outroTailMs(undefined))
  })

  it('throws SceneCoverageError when scenes have a gap', () => {
    const narration = 'Simula hanggang dulo ng kwento.'
    const alignment = syntheticAlignment(narration, 5000)
    // Intentionally skip the middle
    const scenes: SceneSpan[] = [
      { idx: 1, narrationText: 'Simula', tier: 'still' },
      { idx: 2, narrationText: 'dulo ng kwento.', tier: 'still' },
    ]
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 5000,
      scenes,
      audioScript: silentAudioScript(),
      twistAnchor: '',
    }
    expect(() => computeTimings(input)).toThrow(SceneCoverageError)
  })
})

// ── F6: Code-point safety (ñ in Doña) ─────────────────────────────────────────
describe('F6 — code-point safety', () => {
  it('handles non-ASCII characters without offset drift', () => {
    const narration = 'Pumunta kami kay Doña Petra.'
    const alignment = syntheticAlignment(narration, 5000)
    // ñ is a single code point — Array.from correctly splits it
    expect(Array.from(narration).length).toBe(alignment.length)

    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 5000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        sfx: [{ anchor: 'Doña', offsetMs: 0, prompt: 'footsteps', volumeDb: -10, impactAtEnd: false }],
      },
      twistAnchor: '',
    }
    // Should not throw — ñ handled as one code point
    const result = computeTimings(input)
    expect(result.sfxEvents).toHaveLength(1)
    expect(result.sfxEvents[0]!.atMs).toBeGreaterThanOrEqual(0)
  })
})

// ── F7: Negative SFX offset clamp ────────────────────────────────────────────
describe('F7 — negative offset clamp', () => {
  it('clamps negative atMs to 0 and adds a warning', () => {
    const narration = 'Nagsimula na.'
    const alignment = syntheticAlignment(narration, 2000)
    // The word "Nagsimula" starts at ~0ms; offset of -400 would go negative
    const input: ComputeTimingsInput = {
      narration,
      alignment,
      durationMs: 2000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        sfx: [{ anchor: 'Nagsimula', offsetMs: -400, prompt: 'thud', volumeDb: -6, impactAtEnd: false }],
      },
      twistAnchor: '',
    }
    const result = computeTimings(input)
    expect(result.sfxEvents[0]!.atMs).toBeGreaterThanOrEqual(0)
    expect(result.warnings.some((w) => w.includes('clamped'))).toBe(true)
  })
})

// ── F8: No music ─────────────────────────────────────────────────────────────
describe('F8 — no music', () => {
  it('returns null music when audioScript.music is null', () => {
    const narration = 'Walang musika dito.'
    const input: ComputeTimingsInput = {
      narration,
      alignment: syntheticAlignment(narration, 3000),
      durationMs: 3000,
      scenes: singleScene(narration),
      audioScript: silentAudioScript(), // music: null
      twistAnchor: '',
    }
    const result = computeTimings(input)
    expect(result.music).toBeNull()
    // Should never throw — silence is a valid score
  })
})

// ── AlignmentLengthError ──────────────────────────────────────────────────────
describe('AlignmentLengthError', () => {
  it('throws when alignment.length !== narration code points', () => {
    const narration = 'Tatlong salita lang.'
    const badAlignment = syntheticAlignment('shorter', 3000) // wrong length
    expect(() =>
      computeTimings({
        narration,
        alignment: badAlignment,
        durationMs: 3000,
        scenes: singleScene(narration),
        audioScript: silentAudioScript(),
        twistAnchor: '',
      }),
    ).toThrow(AlignmentLengthError)
  })
})

// ── AnchorResolutionError ─────────────────────────────────────────────────────
// An unresolvable SFX/silence anchor must NOT fail the render — the annotator sometimes mis-quotes an
// anchor (casing/punctuation), so a single bad sound cue is dropped with a warning and the reel still renders.
describe('unresolvable SFX anchor is soft (dropped, not thrown)', () => {
  it('drops the SFX cue + warns when the anchor is absent', () => {
    const narration = 'Hindi dito matatagpuan ang hinahanap.'
    const result = computeTimings({
      narration,
      alignment: syntheticAlignment(narration, 5000),
      durationMs: 5000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        sfx: [{ anchor: 'WALANG_GANITO', offsetMs: 0, prompt: 'x', volumeDb: 0, impactAtEnd: false }],
      },
      twistAnchor: '',
    })
    expect(result.sfxEvents).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('SFX anchor unresolvable'))).toBe(true)
  })

  it('drops the SFX cue + warns when the anchor is ambiguous', () => {
    const narration = 'oo oo oo'  // "oo" appears 3 times
    const result = computeTimings({
      narration,
      alignment: syntheticAlignment(narration, 3000),
      durationMs: 3000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        sfx: [{ anchor: 'oo', offsetMs: 0, prompt: 'x', volumeDb: 0, impactAtEnd: false }],
      },
      twistAnchor: '',
    })
    expect(result.sfxEvents).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('SFX anchor unresolvable'))).toBe(true)
  })
})

// ── Punctuation-tolerant matching (gpt-4o swaps quote/dash/whitespace variants when copying) ──────────
describe('punctuation-tolerant anchor + scene matching', () => {
  it('resolves an SFX anchor whose apostrophe is curly when the narration has a straight one', () => {
    const narration = "Tapos biglang nag-ring 'yung phone ko."   // straight apostrophe
    const alignment = syntheticAlignment(narration, 6000)
    const result = computeTimings({
      narration,
      alignment,
      durationMs: 6000,
      scenes: singleScene(narration),
      audioScript: {
        ...silentAudioScript(),
        sfx: [{ anchor: '’yung phone', offsetMs: 0, prompt: 'ring', volumeDb: -8, impactAtEnd: false }], // curly ’
      },
      twistAnchor: '',
    })
    expect(result.sfxEvents).toHaveLength(1)
    const straightIdx = narration.indexOf("'yung phone")
    expect(result.sfxEvents[0]!.atMs).toBe(alignment[straightIdx]!.startMs)
  })

  it('tiles scenes when scene text uses an en-dash where the narration has a hyphen', () => {
    const narration = 'Umuwi ako, nag-ring yung phone, tahimik lahat.'  // hyphen
    const alignment = syntheticAlignment(narration, 6000)
    const result = computeTimings({
      narration,
      alignment,
      durationMs: 6000,
      scenes: [
        { idx: 1, narrationText: 'Umuwi ako, nag–ring yung phone,', tier: 'video' }, // en-dash –
        { idx: 2, narrationText: 'tahimik lahat.', tier: 'still' },
      ],
      audioScript: silentAudioScript(),
      twistAnchor: '',
    })
    expect(result.scenes).toHaveLength(2)
    expect(result.scenes[0]!.startMs).toBe(0)
    expect(result.scenes[0]!.endMs).toBe(result.scenes[1]!.startMs)
  })
})
