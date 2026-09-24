import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAccountEmailConfigured, sendAccountEmail } from './account-email'

describe('account email delivery', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-only-key')
    vi.stubEnv('AUTH_EMAIL_FROM', 'Kendrix <accounts@example.test>')
    vi.stubEnv('AUTH_URL', 'https://studio.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('uses the configured origin, a one-use link, and hashed idempotency key', async () => {
    await sendAccountEmail('creator@example.test', 'verify', 'secret-token')
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(options?.body))
    expect(body.to).toEqual(['creator@example.test'])
    expect(body.text).toContain('https://studio.example.test/verify-email?token=secret-token')
    expect(body.text).toContain('24 hours')
    const headers = options?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/^account-[a-f0-9]{64}$/)
    expect(headers['Idempotency-Key']).not.toContain('secret-token')
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends reset links to the reset page with their shorter expiry', async () => {
    await sendAccountEmail('creator@example.test', 'reset', 'reset-secret')
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body.text).toContain('/reset-password?token=reset-secret')
    expect(body.text).toContain('1 hour')
  })

  it.each(['', 'http://studio.example.test', 'https://user:pass@studio.example.test', 'not-a-url'])('rejects an unsafe or missing origin (%s)', async (origin) => {
    vi.stubEnv('AUTH_URL', origin)
    expect(isAccountEmailConfigured()).toBe(false)
    await expect(sendAccountEmail('creator@example.test', 'verify', 'secret')).rejects.toThrow('not configured')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports missing sender setup instead of pretending mail was sent', async () => {
    vi.stubEnv('AUTH_EMAIL_FROM', '')
    expect(isAccountEmailConfigured()).toBe(false)
    await expect(sendAccountEmail('creator@example.test', 'verify', 'secret')).rejects.toThrow('not configured')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows a local development origin and rejects provider errors without exposing secrets', async () => {
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    expect(isAccountEmailConfigured()).toBe(true)
    vi.mocked(fetch).mockRejectedValue(new Error('body contained secret-token'))
    await expect(sendAccountEmail('creator@example.test', 'verify', 'secret-token')).rejects.toThrow('Account email could not be sent.')
    vi.mocked(fetch).mockResolvedValue(new Response('secret response', { status: 422 }))
    await expect(sendAccountEmail('creator@example.test', 'verify', 'secret-token')).rejects.toThrow('Account email could not be sent.')
  })
})
