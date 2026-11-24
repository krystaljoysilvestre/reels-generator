import { and, eq } from 'drizzle-orm'
import { canTransition } from '@reels/core/state-machine'
import { publicationPlatformForTarget, publicationPlatformsForTargets, type PublicationPlatform } from '@reels/core/publishing'
import { getDb } from './client.js'
import { channels, publications, reels } from './schema.js'

type Publication = typeof publications.$inferSelect

export class PublicationStateError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'PublicationStateError'
  }
}

type PublicationChange = { reelId: string; platform: PublicationPlatform } & (
  | { kind: 'manual'; postUrl?: string | undefined }
  | { kind: 'provider'; platformPostId: string; postUrl?: string | undefined; scheduledAt?: Date; disclosureApplied: boolean }
  | { kind: 'promote'; publicationId: string; now: Date }
)

export function publicationResponse(publication: Publication) {
  return {
    platform: publication.platform,
    status: publication.status,
    postUrl: publication.postUrl,
    platformPostId: publication.platformPostId,
    publishedAt: publication.publishedAt?.toISOString() ?? null,
  }
}

/**
 * Serialize every destination write with the reel's completion decision. Provider requests happen
 * BEFORE this transaction: a database lock must never be held across a network upload.
 *
 * This records creator confirmations and provider results, not independent proof a post is public.
 * Existing terminal reels keep their status, including legacy rows whose destinations are incomplete.
 */
export async function recordPublication(change: PublicationChange) {
  return getDb().transaction(async (tx) => {
    const [reel] = await tx.select().from(reels).where(eq(reels.id, change.reelId)).for('update')
    if (!reel) {
      if (change.kind === 'promote') return null
      throw new PublicationStateError(404, 'Not found')
    }
    const channel = await tx.query.channels.findFirst({
      where: eq(channels.id, reel.channelId), columns: { targetPlatforms: true },
    })
    const targets = channel?.targetPlatforms ?? []
    const selected = publicationPlatformsForTargets(targets)
    const existing = await tx.query.publications.findFirst({
      where: and(eq(publications.reelId, reel.id), eq(publications.platform, change.platform)),
    })
    if (change.kind !== 'promote') {
      if (reel.status !== 'published' && !canTransition(reel.status, 'published')) {
        throw new PublicationStateError(409, `Cannot publish a reel in '${reel.status}'`)
      }
      if (!selected.includes(change.platform)) {
        throw new PublicationStateError(400, 'Choose a destination selected for this channel.')
      }
    }

    const now = new Date()
    let publication: Publication
    if (change.kind === 'promote') {
      // A stale schedule tick must not replace a newer manual confirmation or promote a future slot.
      if (!existing || existing.id !== change.publicationId || existing.status !== 'scheduled'
        || !existing.scheduledAt || existing.scheduledAt > change.now) return null
      ;[publication] = await tx.update(publications).set({
        status: 'published', publishedAt: existing.publishedAt ?? existing.scheduledAt,
      }).where(eq(publications.id, existing.id)).returning() as [Publication]
    } else if (change.kind === 'manual') {
      if (existing) {
        ;[publication] = await tx.update(publications).set({
          status: 'published', publishedAt: existing.publishedAt ?? now,
          ...(change.postUrl !== undefined ? { postUrl: change.postUrl } : {}),
        }).where(eq(publications.id, existing.id)).returning() as [Publication]
      } else {
        ;[publication] = await tx.insert(publications).values({
          reelId: reel.id, platform: change.platform, status: 'published', publishedAt: now,
          postUrl: change.postUrl ?? null,
        }).returning() as [Publication]
      }
    } else if (existing?.status === 'published' || existing?.platformPostId) {
      // A concurrent confirmation or provider result wins without erasing its original identity.
      // Reserving uploads and reconciling an upload whose DB write failed remain separate concerns.
      publication = existing
    } else {
      const values = {
        platformPostId: change.platformPostId,
        postUrl: change.postUrl ?? existing?.postUrl ?? null,
        status: change.scheduledAt ? 'scheduled' : 'published',
        scheduledAt: change.scheduledAt ?? existing?.scheduledAt ?? null,
        publishedAt: existing?.publishedAt ?? (change.scheduledAt ? null : now),
        disclosureApplied: change.disclosureApplied || existing?.disclosureApplied || false,
      }
      if (existing) {
        ;[publication] = await tx.update(publications).set(values).where(eq(publications.id, existing.id)).returning() as [Publication]
      } else {
        ;[publication] = await tx.insert(publications).values({ reelId: reel.id, platform: change.platform, ...values }).returning() as [Publication]
      }
    }

    const rows = await tx.query.publications.findMany({ where: eq(publications.reelId, reel.id) })
    const complete = targets.length > 0 && targets.every((target) => publicationPlatformForTarget(target) !== null)
      && selected.every((platform) => rows.some((row) => row.platform === platform && row.status === 'published'))
    let reelStatus = reel.status
    if (complete && canTransition(reel.status, 'published')) reelStatus = 'published'
    else if (change.kind === 'provider' && publication.status === 'scheduled' && canTransition(reel.status, 'scheduled')) reelStatus = 'scheduled'
    if (reelStatus !== reel.status) {
      await tx.update(reels).set({ status: reelStatus, updatedAt: now }).where(eq(reels.id, reel.id))
    }
    return { reelStatus, publication }
  })
}
