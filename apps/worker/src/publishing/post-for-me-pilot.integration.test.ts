import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { assets, channels, getDb, pipelineSteps, publications, reels, users } from '@reels/db'

const storage = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('@reels/providers', () => ({ downloadBuffer: storage.download }))
import {
  inspectPilot, manifestHash, PILOT_STEP, preparePilot, submitPilot,
  type PilotAccount, type PilotConfig, type PilotManifest, type PilotPost, type PilotResult,
} from './post-for-me-pilot.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const previousOwner = process.env['POST_FOR_ME_PILOT_OWNER_ID']
const previousDatabase = process.env['DATABASE_URL']
const ownerId = randomUUID()
const channelIds: string[] = []
const identities: PilotAccount[] = ['tiktok', 'instagram', 'facebook', 'youtube'].map((platform) => ({
  id: `account-${platform}`, platform: platform as PilotAccount['platform'],
  username: 'fixture', user_id: 'fixture-provider-owner', status: 'connected',
}))
let config: PilotConfig
let provider: ReturnType<typeof fixtureProvider>

function fixtureProvider() {
  let externalId: string | null = null
  return {
    account: vi.fn(async (id: string) => identities.find((account) => account.id === id)!),
    upload: vi.fn(async (_video: Buffer) => 'https://media.example.test/fixture.mp4'),
    create: vi.fn(async (_manifest: PilotManifest, _url: string, key: string) => {
      externalId = key
      return { id: 'post-fixture' }
    }),
    post: vi.fn(async (_id: string): Promise<PilotPost> => ({
      id: 'post-fixture', external_id: externalId, status: 'processed', accountIds: config.accounts,
    })),
    results: vi.fn(async (_id: string): Promise<PilotResult[]> => []),
    costCents: vi.fn((successfulDestinations: number) => successfulDestinations),
  }
}

function result(account: string, success = true, id = `result-${account}`): PilotResult {
  return { id, post_id: 'post-fixture', social_account_id: account, success }
}

async function state() {
  const db = getDb()
  return {
    reel: (await db.query.reels.findFirst({ where: eq(reels.id, config.reelId) }))!,
    posts: await db.query.publications.findMany({ where: eq(publications.reelId, config.reelId) }),
    journal: await db.query.pipelineSteps.findFirst({ where: eq(pipelineSteps.reelId, config.reelId) }),
  }
}

async function submit() {
  const manifest = await preparePilot(config, provider)
  await submitPilot(manifest, manifestHash(manifest), provider)
  return manifest
}

describe.skipIf(!TEST_DATABASE_URL)('Post for Me pilot database boundaries', () => {
  beforeAll(async () => {
    // Never fall back to the application database for fixtures.
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    process.env['POST_FOR_ME_PILOT_OWNER_ID'] = ownerId
    await getDb().insert(users).values({ id: ownerId, email: `${ownerId}@example.test`, role: 'admin', status: 'active' })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    storage.download.mockResolvedValue(Buffer.from('reviewed fixture video'))
    const channelId = randomUUID()
    channelIds.push(channelId)
    config = {
      ownerId, channelId, reelId: randomUUID(), accounts: identities.map((account) => account.id),
      scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(), madeForKids: false,
      tiktok: { allowComment: false, allowDuet: false, allowStitch: false },
    }
    provider = fixtureProvider()
    await getDb().update(users).set({ role: 'admin', status: 'active' }).where(eq(users.id, ownerId))
    await getDb().insert(channels).values({
      id: channelId, userId: ownerId, name: 'Pilot fixture', nicheDescription: 'Fixture',
      generationMode: 'review', targetPlatforms: ['tiktok', 'instagram_reels', 'facebook_reels', 'youtube_shorts'],
    })
    await getDb().insert(reels).values({
      id: config.reelId, channelId, status: 'approved', costCents: 10,
      postMeta: { v: 1, title: 'Reviewed fixture', caption: 'Reviewed caption' },
    })
    await getDb().insert(assets).values({
      reelId: config.reelId, kind: 'render', provider: 'fixture', storageKey: `reels/${config.reelId}/render.mp4`,
    })
  })

  afterAll(async () => {
    if (channelIds.length) await getDb().delete(channels).where(inArray(channels.id, channelIds))
    await getDb().delete(users).where(eq(users.id, ownerId))
    if (previousOwner === undefined) delete process.env['POST_FOR_ME_PILOT_OWNER_ID']
    else process.env['POST_FOR_ME_PILOT_OWNER_ID'] = previousOwner
    if (previousDatabase === undefined) delete process.env['DATABASE_URL']
    else process.env['DATABASE_URL'] = previousDatabase
  })

  it('prepares all four selected platforms without uploading, scheduling or changing the reel', async () => {
    const before = await state()
    const manifest = await preparePilot(config, provider)
    expect(manifest.accountIdentities.map((account) => account.platform)).toEqual(['tiktok', 'instagram', 'facebook', 'youtube'])
    expect(manifest.caption).toContain('Reviewed caption')
    expect(provider.upload).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
    expect(await state()).toEqual(before)
  })

  it.each([{ status: 'suspended' }, { status: 'pending' }, { role: 'tester' }])('checks fresh owner eligibility before provider calls: %j', async (change) => {
    await getDb().update(users).set(change).where(eq(users.id, ownerId))
    await expect(preparePilot(config, provider)).rejects.toThrow('active admin')
    expect(provider.account).not.toHaveBeenCalled()
    expect((await state()).journal).toBeUndefined()
  })

  it('rejects another owner or channel before reading provider accounts', async () => {
    await expect(preparePilot({ ...config, ownerId: randomUUID() }, provider)).rejects.toThrow('owner does not match')
    await expect(preparePilot({ ...config, channelId: randomUUID() }, provider)).rejects.toThrow('selected channel')
    await getDb().update(channels).set({ userId: null }).where(eq(channels.id, config.channelId))
    await expect(preparePilot(config, provider)).rejects.toThrow('active admin')
    expect(provider.account).not.toHaveBeenCalled()
  })

  it('rejects provider account identity mismatches before downloading media', async () => {
    provider.account.mockResolvedValue({ ...identities[0]!, id: 'different-account' })
    await expect(preparePilot(config, provider)).rejects.toThrow('identity mismatch')
    expect(storage.download).not.toHaveBeenCalled()
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('rejects an already posted destination before uploading again', async () => {
    await getDb().insert(publications).values({ reelId: config.reelId, platform: 'tiktok', status: 'published' })
    await expect(preparePilot(config, provider)).rejects.toThrow('already has a publication')
    expect(storage.download).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('rejects an altered review hash before looking up accounts or downloading media', async () => {
    const manifest = await preparePilot(config, provider)
    vi.clearAllMocks()
    await expect(submitPilot({ ...manifest, caption: 'unreviewed' }, manifestHash(manifest), provider)).rejects.toThrow('hash does not match')
    expect(provider.account).not.toHaveBeenCalled()
    expect(storage.download).not.toHaveBeenCalled()
    expect((await state()).journal).toBeUndefined()
  })

  it.each(['caption', 'video', 'account'] as const)('requires review again when %s changes after preparation', async (change) => {
    const manifest = await preparePilot(config, provider)
    if (change === 'caption') await getDb().update(reels).set({ postMeta: { v: 1, title: 'Changed', caption: 'Changed' } }).where(eq(reels.id, config.reelId))
    if (change === 'video') storage.download.mockResolvedValue(Buffer.from('different fixture video'))
    if (change === 'account') provider.account.mockImplementation(async (id: string) => ({ ...identities.find((account) => account.id === id)!, user_id: 'different-provider-owner' }))
    await expect(submitPilot(manifest, manifestHash(manifest), provider)).rejects.toThrow('changed')
    expect(provider.upload).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
    expect((await state()).journal).toBeUndefined()
  })

  it('allows only one media upload and create when two submissions race', async () => {
    const manifest = await preparePilot(config, provider)
    const attempts = await Promise.allSettled([
      submitPilot(manifest, manifestHash(manifest), provider), submitPilot(manifest, manifestHash(manifest), provider),
    ])
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    expect(provider.upload).toHaveBeenCalledOnce()
    expect(provider.create).toHaveBeenCalledOnce()
    expect((await state()).journal).toMatchObject({ stepName: PILOT_STEP, costCents: 0, output: { phase: 'submitted', postId: 'post-fixture' } })
    expect((await state()).reel).toMatchObject({ status: 'approved', costCents: 10 })
    expect((await state()).posts).toEqual([])
  })

  it('preserves ambiguous creates, prohibits resubmission and recovers only the same remote job', async () => {
    const manifest = await preparePilot(config, provider)
    provider.create.mockRejectedValue(new Error('connection closed after provider accepted the post'))
    await expect(submitPilot(manifest, manifestHash(manifest), provider)).rejects.toThrow('needs reconciliation')
    expect((await state()).journal).toMatchObject({ output: { phase: 'unknown' }, costCents: 0 })
    await expect(submitPilot(manifest, manifestHash(manifest), provider)).rejects.toThrow('already reserved')
    expect(provider.create).toHaveBeenCalledOnce()
    await expect(inspectPilot(config.reelId, provider)).resolves.toMatchObject({ phase: 'unknown', message: expect.stringContaining('Identify the existing remote job') })
    expect(provider.post).not.toHaveBeenCalled()
    provider.post.mockResolvedValue({ id: 'post-fixture', external_id: provider.create.mock.calls[0]![2], status: 'processed', accountIds: config.accounts })
    provider.results.mockResolvedValue([result(config.accounts[0]!)])
    await expect(inspectPilot(config.reelId, provider, 'post-fixture')).resolves.toMatchObject({ phase: 'processed', attributedCostCents: 1 })
    expect((await state()).reel).toMatchObject({ status: 'approved', costCents: 11 })
    expect((await state()).posts).toEqual([])
    expect(provider.create).toHaveBeenCalledOnce()
  })

  it('attributes partial results exactly once across concurrent polls and replacement result IDs', async () => {
    await submit()
    provider.results.mockResolvedValue([result(config.accounts[0]!), result(config.accounts[1]!, false)])
    await Promise.all([inspectPilot(config.reelId, provider), inspectPilot(config.reelId, provider)])
    expect((await state()).journal?.costCents).toBe(1)
    expect((await state()).reel.costCents).toBe(11)
    provider.results.mockResolvedValue(config.accounts.map((account) => result(account, true, `replacement-${account}`)))
    await inspectPilot(config.reelId, provider)
    await inspectPilot(config.reelId, provider)
    const final = await state()
    expect(final.journal).toMatchObject({ costCents: 4, output: { accountedAccountIds: config.accounts } })
    expect(final.reel).toMatchObject({ status: 'approved', costCents: 14 })
    expect(final.posts).toEqual([])
    expect(provider.create).toHaveBeenCalledOnce()
  })

  it.each(['id', 'external_id', 'accountIds'] as const)('rejects mismatched remote %s before reading or attributing results', async (field) => {
    await submit()
    const post: PilotPost = { id: 'post-fixture', external_id: provider.create.mock.calls[0]![2], status: 'processed', accountIds: config.accounts }
    if (field === 'accountIds') post.accountIds = ['unrelated-account']
    else post[field] = 'unrelated-job'
    provider.post.mockResolvedValue(post)
    const before = await state()
    await expect(inspectPilot(config.reelId, provider)).rejects.toThrow('does not match')
    expect(provider.results).not.toHaveBeenCalled()
    expect(await state()).toEqual(before)
  })

  it('rejects unrelated results without recording any costs or progress', async () => {
    await submit()
    provider.results.mockResolvedValue([result(config.accounts[0]!), result('unrelated-account')])
    const before = await state()
    await expect(inspectPilot(config.reelId, provider)).rejects.toThrow('does not belong')
    expect(await state()).toEqual(before)
  })

  it('rolls back attribution and journal progress together when the reel cost write fails', async () => {
    await submit()
    provider.results.mockResolvedValue([result(config.accounts[0]!)])
    const before = await state()
    const triggerName = `fail_pilot_cost_${randomUUID().replaceAll('-', '')}`
    const db = getDb()
    await db.execute(sql.raw(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = '${config.reelId}'::uuid AND NEW.cost_cents <> OLD.cost_cents THEN RAISE EXCEPTION 'Test pilot cost write failure'; END IF;
      RETURN NEW; END $$`))
    await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON reels FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`))
    try {
      await expect(inspectPilot(config.reelId, provider)).rejects.toThrow('Test pilot cost write failure')
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${triggerName} ON reels`))
      await db.execute(sql.raw(`DROP FUNCTION ${triggerName}()`))
    }
    expect(await state()).toEqual(before)
    await expect(inspectPilot(config.reelId, provider)).resolves.toMatchObject({ attributedCostCents: 1 })
    expect((await state()).reel.costCents).toBe(11)
  })
})
