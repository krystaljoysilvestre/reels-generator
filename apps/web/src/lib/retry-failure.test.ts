import { describe, expect, it } from 'vitest'
import { MISSING_FAILURE_DETAIL, recoveryStep, type RecoveryStep } from './retry-failure.js'

const row = (stepName: string, status: string, error: string | null = null): RecoveryStep => ({
  id: `${stepName}-${status}`,
  stepName,
  status,
  error,
})

describe('recoveryStep', () => {
  it('prefers the recorded failed step', () => {
    const failed = row('render', 'failed', 'provider timeout')
    const latest = row('mix_audio', 'done')
    expect(recoveryStep(failed, latest)).toBe(failed)
  })

  it('recovers a stranded reel from its latest durable substep', () => {
    const latest = row('generate_images:depiction', 'done')
    expect(recoveryStep(null, latest)).toBe(latest)
    expect(MISSING_FAILURE_DETAIL).toBe('The last take stopped before details were saved.')
  })

  it('returns null when the reel has no durable pipeline history', () => {
    expect(recoveryStep(null, null)).toBeNull()
  })
})
