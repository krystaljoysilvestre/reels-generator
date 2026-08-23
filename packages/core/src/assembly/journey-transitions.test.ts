import { describe, it, expect } from 'vitest'
import { validateJourneyTiling, validateJourneyTransitions } from './story-bible.js'
import type { JourneyLeg } from '../types/story-bible.js'

const leg = (o: Partial<JourneyLeg>): JourneyLeg => ({
  span: 'x',
  locationLabel: '',
  locationEntityId: null,
  present: [],
  visible: [],
  isReflection: false,
  ...o,
})

describe('validateJourneyTiling', () => {
  it('accepts verbatim ordered coverage', () => {
    expect(validateJourneyTiling('One. Two.', [leg({ span: 'One.' }), leg({ span: 'Two.' })])).toEqual([])
  })

  it('finds a missing prefix and trailing narration', () => {
    expect(validateJourneyTiling('In 1917, one. Two. Three.', [leg({ span: 'one.' }), leg({ span: 'Two.' })])).toEqual([
      'Journey leaves uncovered narration before leg 1.',
      'Journey leaves trailing narration uncovered.',
    ])
  })
})

describe('validateJourneyTransitions', () => {
  it('empty journey → no issues', () => {
    expect(validateJourneyTransitions([])).toEqual([])
  })

  it('legal: approaching → inside (a normal cut, no explicit entering leg) → no issue', () => {
    const j = [
      leg({ occupancyState: 'approaching', locationEntityId: null, locationLabel: 'hallway' }),
      leg({ occupancyState: 'inside', locationEntityId: 'restroom' }),
    ]
    expect(validateJourneyTransitions(j)).toEqual([])
  })

  it('legal: inside A → leaving A → transit → inside B → no issue', () => {
    const j = [
      leg({ occupancyState: 'inside', locationEntityId: 'restroom' }),
      leg({ occupancyState: 'leaving', locationEntityId: 'restroom' }),
      leg({ occupancyState: 'approaching', locationEntityId: null }),
      leg({ occupancyState: 'inside', locationEntityId: 'lavatory' }),
    ]
    expect(validateJourneyTransitions(j)).toEqual([])
  })

  it('illegal: inside A → inside B with no leaving/transit leg → one teleport issue', () => {
    const j = [
      leg({ occupancyState: 'inside', locationEntityId: 'cubicle' }),
      leg({ occupancyState: 'inside', locationEntityId: 'classroom' }),
    ]
    const issues = validateJourneyTransitions(j)
    expect(issues.length).toBe(1)
    expect(issues[0]).toContain('teleport')
  })

  it('same location inside → inside → no issue (a cut within one room)', () => {
    const j = [
      leg({ occupancyState: 'inside', locationEntityId: 'restroom' }),
      leg({ occupancyState: 'inside', locationEntityId: 'restroom' }),
    ]
    expect(validateJourneyTransitions(j)).toEqual([])
  })

  it('conservative: missing occupancyState is never flagged', () => {
    const j = [leg({ locationEntityId: 'a' }), leg({ locationEntityId: 'b' })]
    expect(validateJourneyTransitions(j)).toEqual([])
  })
})
