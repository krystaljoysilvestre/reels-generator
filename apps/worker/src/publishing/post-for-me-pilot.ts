// Operator-only experiment. Never enqueue this module or use it from a customer route.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import {
  getDb, getReelOwnerUsage, getGlobalSpendTodayCents, reels, channels, assets, publications,
  pipelineSteps, sceneImageOrigins, visualTruthBlockers,
} from '@reels/db'
import {
  assertBudget, assertGlobalDailyBudget, GLOBAL_DAILY_SPEND_CAP_CENTS, budgetCapForSeconds,
  PostMetaSchema, StoryBibleSchema, EMPTY_STORY_BIBLE, formatImageCredits, formatPublishingCaption,
  publicationPlatformsForTargets,
} from '@reels/core'
import { downloadBuffer } from '@reels/providers'

export const PILOT_STEP = 'post_for_me_pilot'
const PlatformSchema = z.enum(['tiktok', 'instagram', 'facebook', 'youtube'])
const platformIds = { tiktok: 'tiktok', instagram: 'ig', facebook: 'fb', youtube: 'yt' } as const
const AccountSchema = z.object({
  id: z.string().min(1), platform: PlatformSchema, username: z.string().nullable(),
  user_id: z.string().min(1), status: z.literal('connected'),
})
export type PilotAccount = z.infer<typeof AccountSchema>

export const PilotConfigSchema = z.object({
  ownerId: z.string().uuid(), channelId: z.string().uuid(), reelId: z.string().uuid(),
  accounts: z.array(z.string().min(1)).min(1).max(4),
  scheduledAt: z.string().datetime({ offset: true }),
  madeForKids: z.boolean(),
  tiktok: z.object({ allowComment: z.boolean(), allowDuet: z.boolean(), allowStitch: z.boolean() }),
}).strict()
export type PilotConfig = z.infer<typeof PilotConfigSchema>
export const PilotManifestSchema = PilotConfigSchema.extend({
  version: z.literal(1), accountIdentities: z.array(AccountSchema),
  storageKey: z.string(), videoSha256: z.string().regex(/^[a-f0-9]{64}$/), videoBytes: z.number().int().positive(),
  title: z.string(), caption: z.string(),
  disclosure: z.literal('TikTok and YouTube flags enabled; Instagram and Facebook labels require platform verification.'),
  visibility: z.literal('public'),
}).strict()
export type PilotManifest = z.infer<typeof PilotManifestSchema>
export type PilotResult = {
  id: string; post_id: string; social_account_id: string; success: boolean;
  platform_data?: { id?: string; url?: string } | null;
}
export type PilotPost = { id: string; external_id: string | null; status: string; accountIds: string[] }
export type PilotProvider = {
  account(id: string): Promise<PilotAccount>;
  upload(video: Buffer): Promise<string>;
  create(manifest: PilotManifest, mediaUrl: string, externalId: string): Promise<{ id: string }>;
  post(id: string): Promise<PilotPost>;
  results(id: string): Promise<PilotResult[]>;
  costCents(successfulResults: number): number;
}
type Journal = {
  version: 1; phase: 'reserved' | 'submitted' | 'unknown' | 'processed';
  manifest: PilotManifest; hash: string; externalId: string; postId?: string;
  results: PilotResult[]; accountedAccountIds: string[]; updatedAt: string;
}

export function manifestHash(manifest: PilotManifest): string {
  // Parse strips no data (strict schema) and fixes object ordering for reviewed JSON files.
  return createHash('sha256').update(JSON.stringify(PilotManifestSchema.parse(manifest))).digest('hex')
}

export function assertPilotOwner(owner: Awaited<ReturnType<typeof getReelOwnerUsage>>, expectedId: string) {
  if (!owner || owner.userId !== expectedId || owner.status !== 'active' || owner.role !== 'admin') {
    throw new Error('Pilot requires the active admin who owns this reel.')
  }
}

function configuredOwner(ownerId: string) {
  if (!process.env['POST_FOR_ME_PILOT_OWNER_ID'] || ownerId !== process.env['POST_FOR_ME_PILOT_OWNER_ID']) {
    throw new Error('Pilot owner does not match POST_FOR_ME_PILOT_OWNER_ID.')
  }
}

async function loadReady(config: PilotConfig, spending: boolean) {
  configuredOwner(config.ownerId)
  const db = getDb()
  const owner = await getReelOwnerUsage(config.reelId)
  assertPilotOwner(owner, config.ownerId)
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, config.reelId), with: { story: true } })
  if (!reel || reel.channelId !== config.channelId || reel.status !== 'approved') {
    throw new Error('Choose an approved reel in the selected channel.')
  }
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, config.channelId) })
  if (!channel || channel.generationMode === 'auto') throw new Error('Choose a channel in manual review mode for this pilot.')
  if ((await visualTruthBlockers(reel.id)).length) throw new Error('Resolve visual-truth flags before the pilot.')
  const render = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reel.id), eq(assets.kind, 'render')),
  })
  if (!render || !render.storageKey.startsWith(`reels/${reel.id}/`)) throw new Error('Reel has no owned final video.')
  // Select only old columns: this pilot does not require deploying the pending handoff migration.
  const prior = await db.select({ platform: publications.platform, status: publications.status })
    .from(publications).where(eq(publications.reelId, reel.id))
  if (spending) {
    assertBudget(reel.id, reel.costCents + config.accounts.length - 1, budgetCapForSeconds(channel.targetSeconds))
    if (GLOBAL_DAILY_SPEND_CAP_CENTS !== null) {
      assertGlobalDailyBudget(await getGlobalSpendTodayCents() + config.accounts.length - 1)
    }
  }
  return { reel, channel, render, prior }
}

export async function preparePilot(raw: unknown, provider: PilotProvider): Promise<PilotManifest> {
  const config = PilotConfigSchema.parse(raw)
  if (new Set(config.accounts).size !== config.accounts.length) throw new Error('Select each account once.')
  if (Date.parse(config.scheduledAt) < Date.now() + 10 * 60_000) throw new Error('Schedule at least ten minutes ahead.')
  const { reel, channel, render, prior } = await loadReady(config, false)
  const identities = await Promise.all(config.accounts.map(async (id) => AccountSchema.parse(await provider.account(id))))
  if (identities.some((account, index) => account.id !== config.accounts[index])) throw new Error('Provider account identity mismatch.')
  if (new Set(identities.map((a) => a.platform)).size !== identities.length) throw new Error('Use one account per platform in this pilot.')
  const selected = publicationPlatformsForTargets(channel.targetPlatforms)
  for (const account of identities) {
    if (!selected.includes(platformIds[account.platform])) throw new Error(`${account.platform} is not selected for this channel.`)
    if (prior.some((p) => p.platform === platformIds[account.platform])) {
      throw new Error(`${account.platform} already has a publication record. Choose an unposted destination.`)
    }
  }
  const video = await downloadBuffer(render.storageKey)
  const meta = PostMetaSchema.safeParse(reel.postMeta)
  const bible = StoryBibleSchema.safeParse(reel.storyBible)
  const credits = formatImageCredits(bible.success ? bible.data : EMPTY_STORY_BIBLE, await sceneImageOrigins(reel.id))
  const title = meta.success ? meta.data.title : reel.story?.title ?? 'Untitled'
  const caption = formatPublishingCaption(meta.success ? meta.data : null, reel.story ?? {}, credits)
  return PilotManifestSchema.parse({
    ...config, version: 1, accountIdentities: identities, storageKey: render.storageKey,
    videoSha256: createHash('sha256').update(video).digest('hex'), videoBytes: video.length,
    title, caption, visibility: 'public',
    disclosure: 'TikTok and YouTube flags enabled; Instagram and Facebook labels require platform verification.',
  })
}

async function readJournal(reelId: string): Promise<Journal> {
  const row = await getDb().query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, PILOT_STEP)),
  })
  const journal = row?.output as Journal | null
  if (!journal || journal.version !== 1) throw new Error('No pilot reservation for this reel.')
  configuredOwner(journal.manifest.ownerId)
  assertPilotOwner(await getReelOwnerUsage(reelId), journal.manifest.ownerId)
  return journal
}

async function writeJournal(reelId: string, output: Journal) {
  await getDb().update(pipelineSteps).set({ output, finishedAt: new Date() })
    .where(and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, PILOT_STEP)))
}

/** Unique reservation precedes both media upload and post creation. Never automatically retry a POST. */
export async function submitPilot(raw: unknown, reviewedHash: string, provider: PilotProvider) {
  const manifest = PilotManifestSchema.parse(raw)
  const hash = manifestHash(manifest)
  if (hash !== reviewedHash) throw new Error('Reviewed manifest hash does not match.')
  const current = await preparePilot(PilotConfigSchema.parse({
    ownerId: manifest.ownerId, channelId: manifest.channelId, reelId: manifest.reelId,
    accounts: manifest.accounts, scheduledAt: manifest.scheduledAt, madeForKids: manifest.madeForKids, tiktok: manifest.tiktok,
  }), provider)
  if (manifestHash(current) !== hash) throw new Error('Video, caption or destination changed. Prepare and review again.')
  await loadReady(manifest, true)
  const video = await downloadBuffer(manifest.storageKey)
  if (createHash('sha256').update(video).digest('hex') !== manifest.videoSha256) throw new Error('Video changed after review.')
  const journal: Journal = {
    version: 1, phase: 'reserved', manifest, hash, externalId: `kendrix-pilot-${manifest.reelId}-${hash}`,
    results: [], accountedAccountIds: [], updatedAt: new Date().toISOString(),
  }
  const inserted = await getDb().insert(pipelineSteps).values({
    reelId: manifest.reelId, stepName: PILOT_STEP, status: 'done', inputHash: hash,
    output: journal, attempt: 1, startedAt: new Date(), finishedAt: new Date(),
  }).onConflictDoNothing().returning({ id: pipelineSteps.id })
  if (!inserted.length) throw new Error('Pilot already reserved. Use status or recover; do not submit again.')
  console.log(`[audit] post-for-me pilot submit actor=${manifest.ownerId} channel=${manifest.channelId} reel=${manifest.reelId} hash=${hash}`)
  try {
    const mediaUrl = await provider.upload(video)
    const post = await provider.create(manifest, mediaUrl, journal.externalId)
    journal.postId = post.id
    journal.phase = 'submitted'
    journal.updatedAt = new Date().toISOString()
    await writeJournal(manifest.reelId, journal)
    return { postId: post.id, phase: journal.phase, costStatus: 'pending successful destination results' }
  } catch {
    journal.phase = 'unknown'
    journal.updatedAt = new Date().toISOString()
    await writeJournal(manifest.reelId, journal)
    throw new Error('Pilot submission needs reconciliation. Check Post for Me for the existing job; do not submit again.')
  }
}

/** Pure reconciliation: account only verified matching result identities, including partial success. */
export function reconcilePilotResults(journal: Pick<Journal, 'postId' | 'manifest' | 'results' | 'accountedAccountIds'>, incoming: PilotResult[]) {
  const results = new Map(journal.results.map((r) => [r.id, r]))
  const accounted = new Set(journal.accountedAccountIds)
  let newSuccesses = 0
  for (const raw of incoming) {
    if (raw.post_id !== journal.postId || !journal.manifest.accounts.includes(raw.social_account_id)) {
      throw new Error('Provider result does not belong to this pilot.')
    }
    const result: PilotResult = {
      id: raw.id, post_id: raw.post_id, social_account_id: raw.social_account_id, success: raw.success,
      ...(raw.platform_data ? { platform_data: {
        ...(raw.platform_data.id ? { id: raw.platform_data.id } : {}),
        ...(raw.platform_data.url?.startsWith('https://') ? { url: raw.platform_data.url } : {}),
      } } : {}),
    }
    results.set(result.id, result)
    if (result.success && !accounted.has(result.social_account_id)) {
      accounted.add(result.social_account_id)
      newSuccesses++
    }
  }
  return { results: [...results.values()], accountedAccountIds: [...accounted], newSuccesses }
}

export async function inspectPilot(reelId: string, provider: PilotProvider, recoveredPostId?: string) {
  z.string().uuid().parse(reelId)
  const journal = await readJournal(reelId)
  const postId = journal.postId ?? recoveredPostId
  if (!postId) return { phase: journal.phase, externalId: journal.externalId, message: 'Identify the existing remote job, then recover with its ID.' }
  if (recoveredPostId && journal.postId && recoveredPostId !== journal.postId) throw new Error('Pilot already has a different remote job.')
  const post = await provider.post(postId)
  if (post.id !== postId || post.external_id !== journal.externalId
    || [...post.accountIds].sort().join(',') !== [...journal.manifest.accounts].sort().join(',')) {
    throw new Error('Remote job does not match the reserved pilot.')
  }
  const incoming = await provider.results(postId)
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(pipelineSteps)
      .where(and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, PILOT_STEP))).for('update')
    if (!row) throw new Error('Pilot journal missing.')
    const latest = row.output as Journal
    if (latest.postId && latest.postId !== postId) throw new Error('Pilot remote job changed.')
    const reconciled = reconcilePilotResults({ ...latest, postId }, incoming)
    const costCents = provider.costCents(reconciled.newSuccesses)
    const output: Journal = {
      ...latest, postId, phase: post.status === 'processed' ? 'processed' : 'submitted',
      results: reconciled.results, accountedAccountIds: reconciled.accountedAccountIds, updatedAt: new Date().toISOString(),
    }
    await tx.update(pipelineSteps).set({ output, costCents: sql`${pipelineSteps.costCents} + ${costCents}`, finishedAt: new Date() })
      .where(eq(pipelineSteps.id, row.id))
    if (costCents) await tx.update(reels).set({ costCents: sql`${reels.costCents} + ${costCents}`, updatedAt: new Date() }).where(eq(reels.id, reelId))
    console.log(`[audit] post-for-me pilot reconcile actor=${latest.manifest.ownerId} reel=${reelId} post=${postId} addedCents=${costCents}`)
    return { phase: output.phase, postId, results: output.results, attributedCostCents: row.costCents + costCents,
      publicAvailability: 'Not independently verified. Open each platform URL before accepting the pilot.' }
  })
}
