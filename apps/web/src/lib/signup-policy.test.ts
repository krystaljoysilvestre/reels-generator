import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ configured: vi.fn() }))
vi.mock('./account-email', () => ({ isAccountEmailConfigured: mocks.configured }))
import { isOpenSignup, publicAuthOptions } from './signup-policy'

beforeEach(() => {
  mocks.configured.mockReturnValue(false)
  vi.stubEnv('SIGNUP_MODE', '')
  vi.stubEnv('AUTH_GOOGLE_ID', '')
  vi.stubEnv('AUTH_GOOGLE_SECRET', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('public signup capabilities', () => {
  it.each(['', 'approval', 'OPEN', 'true'])('defaults to approval for mode %s', (mode) => {
    vi.stubEnv('SIGNUP_MODE', mode)
    expect(isOpenSignup()).toBe(false)
    expect(publicAuthOptions()).toEqual({ open: false, googleEnabled: false, emailSignupEnabled: true, emailRecoveryEnabled: false })
  })

  it('does not offer open password signup without working verification email configuration', () => {
    vi.stubEnv('SIGNUP_MODE', 'open')
    expect(publicAuthOptions()).toMatchObject({ open: true, emailSignupEnabled: false, emailRecoveryEnabled: false })
    mocks.configured.mockReturnValue(true)
    expect(publicAuthOptions()).toMatchObject({ emailSignupEnabled: true, emailRecoveryEnabled: true })
  })

  it('offers Google only with both credentials and never serializes their values', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'private-client-id')
    expect(publicAuthOptions().googleEnabled).toBe(false)
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'private-client-secret')
    expect(publicAuthOptions().googleEnabled).toBe(true)
    expect(JSON.stringify(publicAuthOptions())).not.toContain('private-client')
  })
})
