import { describe, it, expect } from 'vitest'
import { subtitlesToSrt, resolveSidecarSrt } from './srt.js'
import { CAPTION_PRESETS } from '../types/channel.js'
import type { SubtitleChunk } from '../types/timings.js'

const chunk = (text: string, startMs: number, endMs: number): SubtitleChunk => ({ text, startMs, endMs, words: [] })

describe('subtitlesToSrt', () => {
  it('emits numbered cues with SubRip timestamps', () => {
    const srt = subtitlesToSrt([chunk('Hello there', 0, 2500), chunk('Second line', 2500, 5000)])
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nHello there\n\n' +
        '2\n00:00:02,500 --> 00:00:05,000\nSecond line\n',
    )
  })

  it('formats hours for long-form durations', () => {
    const srt = subtitlesToSrt([chunk('Late cue', 3_723_456, 3_725_000)])
    expect(srt).toContain('01:02:03,456 --> 01:02:05,000')
  })

  it('returns empty string when there is nothing to caption', () => {
    expect(subtitlesToSrt([])).toBe('')
    expect(subtitlesToSrt([chunk('   ', 0, 1000)])).toBe('')
  })

  it('orders cues by start time and renumbers them', () => {
    const srt = subtitlesToSrt([chunk('second', 5000, 6000), chunk('first', 0, 1000)])
    expect(srt.indexOf('first')).toBeLessThan(srt.indexOf('second'))
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:01,000\nfirst')).toBe(true)
  })

  it('trims an overlapping cue against the next start', () => {
    const srt = subtitlesToSrt([chunk('a', 0, 3000), chunk('b', 2000, 4000)])
    expect(srt).toContain('00:00:00,000 --> 00:00:02,000')
  })

  it('drops a cue fully swallowed by the next one instead of emitting a zero-length cue', () => {
    const srt = subtitlesToSrt([chunk('swallowed', 1000, 3000), chunk('winner', 1000, 4000)])
    expect(srt).not.toContain('swallowed')
    expect(srt).toContain('winner')
  })

  it('collapses newlines so a chunk cannot break the cue format', () => {
    const srt = subtitlesToSrt([chunk('two\nlines', 0, 1000)])
    expect(srt).toContain('two lines')
  })
})

describe('resolveSidecarSrt', () => {
  const timings = {
    durationMs: 5000,
    scenes: [],
    subtitles: [chunk('Narration line', 0, 2000)],
    sfxEvents: [],
    music: null,
    silenceDrop: null,
    warnings: [],
  }

  it('ships a track when captions are NOT burned', () => {
    const srt = resolveSidecarSrt(timings, { ...CAPTION_PRESETS.clean, enabled: false })
    expect(srt).toContain('Narration line')
  })

  it('ships nothing when captions ARE burned — one delivery, never both', () => {
    expect(resolveSidecarSrt(timings, { ...CAPTION_PRESETS.clean, enabled: true })).toBeNull()
  })

  it('treats an absent toggle as burned (existing channels are unchanged)', () => {
    expect(resolveSidecarSrt(timings, CAPTION_PRESETS.clean)).toBeNull()
  })

  it('returns null on unusable timings or caption style rather than throwing', () => {
    expect(resolveSidecarSrt(null, { ...CAPTION_PRESETS.clean, enabled: false })).toBeNull()
    expect(resolveSidecarSrt(timings, null)).toBeNull()
  })

  it('returns null when captions are off but there is nothing to say', () => {
    const silent = { ...timings, subtitles: [] }
    expect(resolveSidecarSrt(silent, { ...CAPTION_PRESETS.clean, enabled: false })).toBeNull()
  })
})
