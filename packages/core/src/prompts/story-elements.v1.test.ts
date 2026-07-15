import { describe, it, expect } from 'vitest'
import {
  elementFingerprint,
  formatRecentElements,
  renderElementPalette,
  StoryElementsSchema,
  type StoryElements,
} from './story-elements.v1.js'
import { GENRE_MODULE_VALUES } from './scenes.v1.js'

const base: StoryElements = {
  structure: 'cold_open',
  role: 'security guard',
  setting: 'parking basement',
  anchor: 'the CCTV feed',
  trigger: 'a sound with no source',
  turn: 'spatial contradiction',
  aftereffect: 'a contaminated routine',
  tensionCurve: 'calm→unease→dread→still',
}

describe('elementFingerprint', () => {
  it('is stable and built from structure|setting|trigger|turn', () => {
    expect(elementFingerprint(base)).toBe(
      'cold open | parking basement | a sound with no source | spatial contradiction',
    )
  })

  it('normalizes case + punctuation so near-identical shapes collide', () => {
    const a = elementFingerprint({ structure: 'cold_open', setting: 'CR/bathroom', trigger: 'A sound.', turn: 'spatial' })
    const b = elementFingerprint({ structure: 'COLD OPEN', setting: 'cr bathroom', trigger: 'a  sound', turn: 'Spatial' })
    expect(a).toBe(b)
  })

  it('ignores role + anchor (they ride the differ-rule, not the hard key)', () => {
    const diffRoleAnchor = elementFingerprint({ ...base, role: 'nurse', anchor: 'a mirror' } as StoryElements)
    expect(diffRoleAnchor).toBe(elementFingerprint(base))
  })

  it('distinguishes a genuinely different shape', () => {
    expect(elementFingerprint({ ...base, turn: 'identity contradiction' })).not.toBe(elementFingerprint(base))
  })
})

describe('formatRecentElements', () => {
  it('reports the young-catalog case', () => {
    expect(formatRecentElements([])).toMatch(/nothing yet/i)
  })
  it('lists fingerprints + distinct roles + distinct anchors', () => {
    const out = formatRecentElements([base, { ...base, role: 'nurse', anchor: 'a mirror' } as StoryElements])
    expect(out).toContain('security guard')
    expect(out).toContain('nurse')
    expect(out).toContain('the CCTV feed')
    expect(out).toContain('a mirror')
  })
})

describe('renderElementPalette', () => {
  it('is non-empty for every genre and stays describe-not-prescribe', () => {
    for (const g of GENRE_MODULE_VALUES) {
      const p = renderElementPalette(g)
      expect(p.length).toBeGreaterThan(0)
      expect(p).toContain('structure')
      expect(p).toMatch(/not a form|describe|not instructions/i)
    }
  })
})

describe('StoryElementsSchema', () => {
  it('accepts a full record and one with pov/anchor omitted', () => {
    expect(StoryElementsSchema.safeParse(base).success).toBe(true)
    const { anchor: _a, ...noAnchor } = base
    expect(StoryElementsSchema.safeParse({ ...noAnchor }).success).toBe(true)
  })
  it('rejects a record missing a required dimension', () => {
    const { turn: _t, ...noTurn } = base
    expect(StoryElementsSchema.safeParse(noTurn).success).toBe(false)
  })
})
