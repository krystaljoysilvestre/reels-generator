import { describe, expect, it } from 'vitest'
import { hasFailedAttemptForStep } from './failure-record.js'

describe('hasFailedAttemptForStep', () => {
  it('does not mistake successful substeps for a recorded permanent failure', () => {
    expect(hasFailedAttemptForStep([
      { stepName: 'generate_images:depiction', status: 'done' },
      { stepName: 'generate_images:plates', status: 'done' },
    ], 'generate_images')).toBe(false)
  })

  it('recognizes a failed fan-out or canonical row for the same base step', () => {
    expect(hasFailedAttemptForStep([
      { stepName: 'generate_images:scene3', status: 'failed' },
    ], 'generate_images')).toBe(true)
    expect(hasFailedAttemptForStep([
      { stepName: 'generate_images', status: 'failed' },
    ], 'generate_images')).toBe(true)
  })
})
