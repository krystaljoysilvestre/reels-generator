import { describe, expect, it } from 'vitest'
import { armedFaultBoundaries, forcedFaultError, shouldInjectFault } from './fault-injection.js'

describe('armedFaultBoundaries', () => {
  it('is empty in the shipped state, so no boundary can fire', () => {
    expect(armedFaultBoundaries(undefined)).toEqual([])
    expect(armedFaultBoundaries('')).toEqual([])
    expect(armedFaultBoundaries('  ,  ')).toEqual([])
  })

  it('reads a comma-separated list with surrounding whitespace', () => {
    expect(armedFaultBoundaries(' render:after_visual , generate_tts ')).toEqual([
      'render:after_visual',
      'generate_tts',
    ])
  })
})

describe('shouldInjectFault', () => {
  const armed = ['render:after_visual']

  it('fires on the first attempt of an armed boundary', () => {
    expect(shouldInjectFault(armed, 'render:after_visual', 1)).toBe(true)
  })

  it('does not fire on the retry, so one click of Retry clears it', () => {
    expect(shouldInjectFault(armed, 'render:after_visual', 2)).toBe(false)
    expect(shouldInjectFault(armed, 'render:after_visual', 7)).toBe(false)
  })

  it('ignores boundaries that are not armed', () => {
    expect(shouldInjectFault(armed, 'render:after_mux', 1)).toBe(false)
    expect(shouldInjectFault([], 'render:after_visual', 1)).toBe(false)
  })
})

describe('forcedFaultError', () => {
  it('is permanent, so the creator sees a failed phase instead of a silent queue retry', () => {
    const err = forcedFaultError('render:after_visual')
    expect(err.name).toBe('UnrecoverableError')
    expect(err.message).toContain('render:after_visual')
    expect(err.message).toContain('FORCE_STEP_FAILURE')
  })
})
