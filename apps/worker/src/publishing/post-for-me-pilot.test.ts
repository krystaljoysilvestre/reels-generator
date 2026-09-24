import { describe, expect, it } from 'vitest'
import {
  assertPilotOwner, manifestHash, reconcilePilotResults,
  type PilotManifest, type PilotResult,
} from './post-for-me-pilot.js'

const ownerId = '00000000-0000-4000-8000-000000000001'
const manifest: PilotManifest = {
  version: 1, ownerId,
  channelId: '00000000-0000-4000-8000-000000000002',
  reelId: '00000000-0000-4000-8000-000000000003',
  accounts: ['account-ig', 'account-yt'], scheduledAt: '2030-01-01T12:00:00Z',
  madeForKids: false, tiktok: { allowComment: false, allowDuet: false, allowStitch: false },
  accountIdentities: [
    { id: 'account-ig', platform: 'instagram', username: 'fixture', user_id: 'provider-owner', status: 'connected' },
    { id: 'account-yt', platform: 'youtube', username: 'fixture', user_id: 'provider-owner', status: 'connected' },
  ],
  storageKey: 'reels/fixture/render.mp4', videoSha256: 'a'.repeat(64), videoBytes: 100,
  title: 'Reviewed title', caption: 'Reviewed caption', visibility: 'public',
  disclosure: 'TikTok and YouTube flags enabled; Instagram and Facebook labels require platform verification.',
}
const owner = { userId: ownerId, role: 'admin', status: 'active', monthlyBudgetCents: null, spendCentsThisMonth: 0 }
const result = (overrides: Partial<PilotResult> = {}): PilotResult => ({
  id: 'result-ig', post_id: 'post-1', social_account_id: 'account-ig', success: true, ...overrides,
})
const journal = () => ({ postId: 'post-1', manifest, results: [] as PilotResult[], accountedAccountIds: [] as string[] })

describe('operator-only pilot ownership', () => {
  it('accepts only the active admin who owns the reel', () => {
    expect(() => assertPilotOwner(owner, ownerId)).not.toThrow()
    expect(() => assertPilotOwner(null, ownerId)).toThrow('active admin')
    expect(() => assertPilotOwner({ ...owner, userId: manifest.channelId }, ownerId)).toThrow('active admin')
    expect(() => assertPilotOwner({ ...owner, role: 'tester' }, ownerId)).toThrow('active admin')
    expect(() => assertPilotOwner({ ...owner, role: null }, ownerId)).toThrow('active admin')
    for (const status of ['pending', 'suspended', null]) {
      expect(() => assertPilotOwner({ ...owner, status }, ownerId)).toThrow('active admin')
    }
  })
})

describe('reviewed pilot manifest', () => {
  it('has a stable hash across JSON key order and a JSON round trip', () => {
    const reversed = Object.fromEntries(Object.entries(manifest).reverse()) as PilotManifest
    expect(manifestHash(reversed)).toBe(manifestHash(manifest))
    expect(manifestHash(JSON.parse(JSON.stringify(manifest)))).toBe(manifestHash(manifest))
  })

  it.each([
    { caption: 'Changed caption' }, { title: 'Changed title' }, { videoSha256: 'b'.repeat(64) },
    { storageKey: 'reels/fixture/replaced.mp4' }, { scheduledAt: '2030-01-02T12:00:00Z' },
    { accounts: ['other-account'] }, { madeForKids: true },
    { tiktok: { allowComment: true, allowDuet: false, allowStitch: false } },
    { accountIdentities: manifest.accountIdentities.map((account) => ({ ...account, user_id: 'different-owner' })) },
  ])('invalidates approval when a publishing input changes: %j', (change) => {
    expect(manifestHash({ ...manifest, ...change })).not.toBe(manifestHash(manifest))
  })

  it('rejects unreviewed extra top-level fields', () => {
    expect(() => manifestHash({ ...manifest, extra: 'unreviewed' } as PilotManifest)).toThrow()
  })
})

describe('pilot result reconciliation', () => {
  it('attributes partial successes and leaves failed destinations uncharged', () => {
    const initial = journal()
    const reconciled = reconcilePilotResults(initial, [result(), result({ id: 'result-yt', social_account_id: 'account-yt', success: false })])
    expect(reconciled.newSuccesses).toBe(1)
    expect(reconciled.accountedAccountIds).toEqual(['account-ig'])
    expect(reconciled.results).toHaveLength(2)
    expect(initial).toEqual(journal())
    const later = reconcilePilotResults({ ...initial, ...reconciled }, [result({ id: 'result-yt', social_account_id: 'account-yt' })])
    expect(later.newSuccesses).toBe(1)
    expect(later.accountedAccountIds).toEqual(['account-ig', 'account-yt'])
  })

  it('does not bill the same destination twice across duplicate, replaced or repeated results', () => {
    const initial = journal()
    const first = reconcilePilotResults(initial, [result(), result(), result({ id: 'replacement-result' })])
    expect(first.newSuccesses).toBe(1)
    const second = reconcilePilotResults({ ...initial, ...first }, [result(), result({ id: 'yet-another-result' })])
    expect(second.newSuccesses).toBe(0)
    expect(second.accountedAccountIds).toEqual(['account-ig'])
  })

  it.each([{ post_id: 'different-job' }, { social_account_id: 'different-account' }])('rejects results outside the reserved job: %j', (change) => {
    const initial = journal()
    expect(() => reconcilePilotResults(initial, [result(), result(change)])).toThrow('does not belong')
    expect(initial).toEqual(journal())
  })

  it('retains only post identity and safe platform result fields', () => {
    const reconciled = reconcilePilotResults(journal(), [result({ platform_data: { id: 'platform-post', url: 'javascript:alert(1)' } })])
    expect(reconciled.results[0]?.platform_data).toEqual({ id: 'platform-post' })
    const https = reconcilePilotResults(journal(), [result({ platform_data: { url: 'https://www.instagram.com/reel/fixture/' } })])
    expect(https.results[0]?.platform_data?.url).toBe('https://www.instagram.com/reel/fixture/')
  })
})
