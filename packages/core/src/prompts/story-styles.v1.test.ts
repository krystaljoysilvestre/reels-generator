import { describe, it, expect } from 'vitest'
import {
  STORY_STYLES,
  STYLE_VALUES,
  stylesForGenre,
  resolveStyle,
  renderStyleForPlanner,
  renderStyleTellingForWriter,
} from './story-styles.v1.js'
import { GENRE_MODULE_VALUES } from './scenes.v1.js'

describe('STORY_STYLES catalog', () => {
  it('covers every genre module (general = no styles)', () => {
    for (const g of GENRE_MODULE_VALUES) expect(STORY_STYLES[g]).toBeDefined()
    expect(Object.keys(STORY_STYLES.general)).toHaveLength(0)
    expect(Object.keys(STORY_STYLES.horror).length).toBeGreaterThanOrEqual(3)
  })
  it('STYLE_VALUES is the flat union of all style ids', () => {
    expect(STYLE_VALUES).toContain('urban_legend')
    expect(STYLE_VALUES).toContain('aita')
    expect(new Set(STYLE_VALUES).size).toBe(STYLE_VALUES.length) // no dupes
  })
})

describe('stylesForGenre', () => {
  it('lists a genre\'s styles with labels', () => {
    const horror = stylesForGenre('horror')
    expect(horror.find((s) => s.id === 'urban_legend')?.label).toBe('Urban legend')
  })
  it('is empty for general', () => {
    expect(stylesForGenre('general')).toEqual([])
  })
})

describe('resolveStyle', () => {
  it('resolves a valid (genre, style)', () => {
    expect(resolveStyle('horror', 'psychological')?.label).toBe('Psychological')
  })
  it('returns null for empty/unset → pure genre', () => {
    expect(resolveStyle('horror', '')).toBeNull()
    expect(resolveStyle('horror', undefined)).toBeNull()
  })
  it('returns null (graceful) when the style does not belong to the genre', () => {
    expect(resolveStyle('drama', 'urban_legend')).toBeNull() // horror style on a drama channel
    expect(resolveStyle('horror', 'nonsense')).toBeNull()
  })
})

describe('renderers scale with influence', () => {
  const spec = STORY_STYLES.horror.urban_legend!
  it('planner render reflects the influence lead + never claims to own mechanics', () => {
    expect(renderStyleForPlanner(spec, 'light')).toContain('Lightly borrow from')
    expect(renderStyleForPlanner(spec, 'full')).toContain('Fully commit to')
    expect(renderStyleForPlanner(spec, 'medium')).toMatch(/does not override|tilts/i)
  })
  it('writer render carries the telling conventions', () => {
    expect(renderStyleTellingForWriter(spec, 'medium')).toContain(spec.conventions[0]!)
  })
})
