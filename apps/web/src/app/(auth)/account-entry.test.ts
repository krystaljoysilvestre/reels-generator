import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  account: vi.fn(),
  emailConfigured: vi.fn(),
  openSignup: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.currentUser }))
vi.mock('@/lib/account-email', () => ({ isAccountEmailConfigured: mocks.emailConfigured }))
vi.mock('@/lib/signup-policy', () => ({ isOpenSignup: mocks.openSignup }))
vi.mock('@/lib/user-profile', () => ({ ACCOUNT_UNAVAILABLE: 'unavailable' }))
vi.mock('@reels/db', () => ({
  users: { id: 'user-id', emailVerified: 'verified' },
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.account }) }) }),
}))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mocks.params,
}))
vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut: vi.fn() }))
// Keep these tests focused on each screen's message and actions, independent of brand decoration.
vi.mock('./AuthShell', () => ({
  AuthShell: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => React.createElement('main', null, React.createElement('h1', null, title), React.createElement('p', null, subtitle), children),
  AuthField: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  GoogleButton: ({ label }: { label: string }) => React.createElement('button', null, label),
  OrDivider: () => null,
}))

import PendingPage from './pending/page'
import { SignInForm } from './signin/SignInForm'
import { RecoveryForm } from './RecoveryForm'

function renderRecovery(kind: 'forgot' | 'reset' | 'verify', enabled = true) {
  return renderToStaticMarkup(React.createElement(RecoveryForm, { kind, enabled }))
}

describe('account-entry and recovery guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.params = new URLSearchParams()
    mocks.currentUser.mockResolvedValue({ id: 'creator', email: 'creator@example.com', status: 'pending' })
    mocks.account.mockResolvedValue([{ emailVerified: null }])
    mocks.emailConfigured.mockReturnValue(true)
    mocks.openSignup.mockReturnValue(true)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('distinguishes unavailable verification from approval when signup is open', async () => {
    mocks.emailConfigured.mockReturnValue(false)
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('Email confirmation is unavailable')
    expect(html).toContain('href="https://kendrix.io/contact"')
    expect(html).not.toContain('waiting for approval')
    expect(html).not.toContain('Send confirmation')
    expect(html).not.toContain('Enter studio')
    expect(mocks.account).toHaveBeenCalledWith({ column: 'user-id', value: 'creator' })
  })

  it.each([true, false])('does not claim a confirmation was sent just because mail is configured (open=%s)', async (open) => {
    mocks.openSignup.mockReturnValue(open)
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('Confirm your email')
    expect(html).toContain('Send confirmation')
    expect(html).not.toContain('link sent to')
    expect(html).toContain(open ? 'Once confirmed' : 'review your access')
  })

  it.each([true, false])('offers activation for verified open-signup accounts regardless of mail capability (%s)', async (mail) => {
    mocks.account.mockResolvedValue([{ emailVerified: new Date() }])
    mocks.emailConfigured.mockReturnValue(mail)
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('Enter studio')
    expect(html).not.toContain('Send confirmation')
  })

  it.each([true, false])('keeps approval guidance in approval mode when email cannot be sent (verified=%s)', async (verified) => {
    mocks.openSignup.mockReturnValue(false)
    mocks.emailConfigured.mockReturnValue(false)
    mocks.account.mockResolvedValue([{ emailVerified: verified ? new Date() : null }])
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('waiting for approval')
    expect(html).not.toContain('Enter studio')
    expect(html).not.toContain('Send confirmation')
  })

  it('keeps a verified creator pending when approval is required even if mail is configured', async () => {
    mocks.openSignup.mockReturnValue(false)
    mocks.account.mockResolvedValue([{ emailVerified: new Date() }])
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('waiting for approval')
    expect(html).not.toContain('Send confirmation')
    expect(html).not.toContain('Enter studio')
  })

  it.each([true, false])('never offers verification or activation to suspended accounts (verified=%s)', async (verified) => {
    mocks.currentUser.mockResolvedValue({ id: 'creator', status: 'suspended' })
    mocks.account.mockResolvedValue([{ emailVerified: verified ? new Date() : null }])
    const html = renderToStaticMarkup(await PendingPage())
    expect(html).toContain('Access is paused')
    expect(html).not.toContain('Send confirmation')
    expect(html).not.toContain('Enter studio')
  })

  it.each([null, { id: 'creator', status: 'active' }])('redirects accounts that do not need the pending screen', async (user) => {
    mocks.currentUser.mockResolvedValue(user)
    await expect(PendingPage()).rejects.toThrow(`REDIRECT:${user ? '/dashboard' : '/signin'}`)
    expect(mocks.account).not.toHaveBeenCalled()
  })

  it('does not describe an unavailable account lookup as an access decision', async () => {
    mocks.currentUser.mockResolvedValue({ id: 'creator', status: 'unavailable' })
    await expect(PendingPage()).rejects.toThrow('Account lookup is temporarily unavailable')
    expect(mocks.account).not.toHaveBeenCalled()
  })

  it.each([true, false])('always makes the recovery page reachable from sign-in (mail=%s)', (mail) => {
    const html = renderToStaticMarkup(React.createElement(SignInForm, { googleEnabled: true, emailRecoveryEnabled: mail }))
    expect(html).toContain('href="/forgot-password"')
    expect(html).toContain('Forgot password?')
  })

  it('offers recovery help after an unlinked Google sign-in without implying automatic linking', () => {
    mocks.params = new URLSearchParams('error=OAuthAccountNotLinked')
    const html = renderToStaticMarkup(React.createElement(SignInForm, { googleEnabled: true, emailRecoveryEnabled: false }))
    expect(html).toContain('password recovery')
    expect(html).toContain('href="/forgot-password"')
    expect(html).toContain('joined with Google')
  })

  it('does not offer Google sign-in when it is unavailable', () => {
    const html = renderToStaticMarkup(React.createElement(SignInForm, { googleEnabled: false, emailRecoveryEnabled: false }))
    expect(html).not.toContain('Continue with Google')
    expect(html).not.toContain('Use Google')
    expect(html).toContain('href="/forgot-password"')
  })

  it('replaces the delivery promise and reset form with direct help when recovery mail is unavailable', () => {
    const html = renderRecovery('forgot', false)
    expect(html).toContain('Email recovery is temporarily unavailable')
    expect(html).toContain('href="https://kendrix.io/contact"')
    expect(html).not.toContain('send you a link')
    expect(html).not.toContain('usual method')
    expect(html).not.toContain('Send reset link')
    expect(html).not.toContain('<form')
  })

  it('offers an email form when recovery mail is configured', () => {
    const html = renderRecovery('forgot')
    expect(html).toContain('Send reset link')
    expect(html).toContain('type="email"')
    expect(html).toContain('href="/signin"')
  })

  it.each(['reset', 'verify'] as const)('keeps missing %s links recoverable without exposing a submit action', (kind) => {
    const html = renderRecovery(kind)
    expect(html).toContain('This link is incomplete')
    expect(html).toContain(`href="${kind === 'reset' ? '/forgot-password' : '/pending'}"`)
    expect(html).not.toContain('<form')
  })

  it.each(['reset', 'verify'] as const)('allows an existing %s link to be used without sending more mail', (kind) => {
    mocks.params = new URLSearchParams('token=existing-token')
    const html = renderRecovery(kind)
    expect(html).toContain('<form')
    expect(html).toContain(kind === 'reset' ? 'Save password' : 'Confirm email')
    expect(html).not.toContain('Email recovery is temporarily unavailable')
  })
})
