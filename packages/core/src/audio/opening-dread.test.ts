import { describe, it, expect } from 'vitest'
import { buildOpeningDreadCue, pickDreadEndAnchor } from './opening-dread.js'

const NARRATION = 'Akala ko best friend ko yung kausap ko sa CR. Hindi pala. May babae sa tabi ko. Nakangiti.'

describe('buildOpeningDreadCue', () => {
  it('anchors a sustained dread bed on the first words, ending at the climax line', () => {
    const cue = buildOpeningDreadCue({ narration: NARRATION, endAnchor: 'May babae sa tabi ko' })
    expect(cue).not.toBeNull()
    expect(cue!.anchor).toBe('Akala ko best friend ko') // first 5 words
    expect(NARRATION.includes(cue!.anchor)).toBe(true)
    expect(cue!.endAnchor).toBe('May babae sa tabi ko')
    expect(cue!.impactAtEnd).toBe(false)
    expect(cue!.volumeDb).toBeLessThan(0)
    expect(cue!.prompt).toMatch(/loop/i)
    expect(cue!.prompt).not.toMatch(/voice|scream|laugh/i)
  })

  it('returns null with no end anchor or too-short narration', () => {
    expect(buildOpeningDreadCue({ narration: NARRATION, endAnchor: '' })).toBeNull()
    expect(buildOpeningDreadCue({ narration: 'too short here', endAnchor: 'x' })).toBeNull()
  })

  it('returns null when the opening anchor would coincide with the end anchor', () => {
    expect(buildOpeningDreadCue({ narration: NARRATION, endAnchor: 'Akala ko best friend ko' })).toBeNull()
  })
})

describe('pickDreadEndAnchor', () => {
  it('prefers the climax hit anchor', () => {
    const end = pickDreadEndAnchor({
      sfx: [{ anchor: 'footsteps line', impactAtEnd: false }, { anchor: 'the reveal', impactAtEnd: true }],
      music: { peakAnchor: 'the peak line' },
    })
    expect(end).toBe('the reveal')
  })
  it('falls back to the music peak anchor, then null', () => {
    expect(pickDreadEndAnchor({ sfx: [], music: { peakAnchor: 'the peak line' } })).toBe('the peak line')
    expect(pickDreadEndAnchor({ sfx: [], music: null })).toBeNull()
  })
})
