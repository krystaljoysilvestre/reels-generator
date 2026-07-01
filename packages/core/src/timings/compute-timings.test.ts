import { describe, it, expect } from 'vitest'
import {
  computeTimings,
  AlignmentLengthError,
  AnchorResolutionError,
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
    // Last endMs === durationMs
    expect(result.scenes[1]!.endMs).toBe(6000)
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
describe('AnchorResolutionError', () => {
  it('throws not_found when SFX anchor is absent', () => {
    const narration = 'Hindi dito matatagpuan ang hinahanap.'
    expect(() =>
      computeTimings({
        narration,
        alignment: syntheticAlignment(narration, 5000),
        durationMs: 5000,
        scenes: singleScene(narration),
        audioScript: {
          ...silentAudioScript(),
          sfx: [{ anchor: 'WALANG_GANITO', offsetMs: 0, prompt: 'x', volumeDb: 0, impactAtEnd: false }],
        },
        twistAnchor: '',
      }),
    ).toThrow(AnchorResolutionError)
  })

  it('throws ambiguous when SFX anchor matches multiple times', () => {
    const narration = 'oo oo oo'  // "oo" appears 3 times
    expect(() =>
      computeTimings({
        narration,
        alignment: syntheticAlignment(narration, 3000),
        durationMs: 3000,
        scenes: singleScene(narration),
        audioScript: {
          ...silentAudioScript(),
          sfx: [{ anchor: 'oo', offsetMs: 0, prompt: 'x', volumeDb: 0, impactAtEnd: false }],
        },
        twistAnchor: '',
      }),
    ).toThrow(AnchorResolutionError)
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
