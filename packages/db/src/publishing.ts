// Publishing credentials — the one place that answers "can this channel talk to its platform, and
// with what". Lives here because this package owns the encrypted columns on platform_connections,
// and because BOTH apps need the answer: the web app publishes on the creator's click, the worker
// auto-publishes and polls performance.
//
// Credentials are per CHANNEL, never per installation. One creator connects different brand accounts
// to different channels, so nothing may resolve a token from process.env — a global token uploads to
// whichever account minted it, no matter which channel asked. (That was the shape of the 2026-08-21
// defect: the per-channel migration converted the manual publish route and left the worker and the
// settings UI reading an operator-wide YOUTUBE_REFRESH_TOKEN that no longer existed. The metrics
// poller returned at its first line for ten days, so no reel ever recorded an audience number.)

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from './client.js'
import { platformConnections } from './schema.js'

const VERSION = 'v1'

function encryptionKey(): Buffer {
  const encoded = process.env['PUBLISHING_CREDENTIALS_KEY']
  if (!encoded) throw new Error('PUBLISHING_CREDENTIALS_KEY is not configured')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('PUBLISHING_CREDENTIALS_KEY must be a base64-encoded 32-byte key')
  return key
}

export function publishingCredentialsConfigured(): boolean {
  try {
    encryptionKey()
    return true
  } catch {
    return false
  }
}

export function encryptCredential(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptCredential(value: string): string {
  const [version, iv, tag, ciphertext] = value.split('.')
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted credential')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

// ── YouTube ───────────────────────────────────────────────────────────────────

export interface YouTubeAuth {
  clientId: string
  clientSecret: string
  refreshToken: string
}

// The OAuth APP's own identity — present whenever Kendrix can run the connect flow at all. It says
// nothing about any particular channel being connected; resolveYouTubeAuth answers that.
export function youtubeAppConfigured(): boolean {
  return Boolean(process.env['YOUTUBE_CLIENT_ID'] && process.env['YOUTUBE_CLIENT_SECRET'])
}

// Everything needed to act on one channel's YouTube account, or null when it cannot act — no active
// connection, no stored refresh token, or no OAuth app keys. Returning null rather than throwing is
// deliberate: every caller's correct response to "not connected" is to offer the manual path, not to
// fail. A token that Google has since expired still resolves here and fails at the refresh call,
// which is where the error belongs (only Google knows whether a grant is still good).
export async function resolveYouTubeAuth(channelId: string): Promise<YouTubeAuth | null> {
  const clientId = process.env['YOUTUBE_CLIENT_ID']
  const clientSecret = process.env['YOUTUBE_CLIENT_SECRET']
  if (!clientId || !clientSecret || !publishingCredentialsConfigured()) return null

  const connection = await getDb().query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.channelId, channelId),
      eq(platformConnections.platform, 'yt'),
      eq(platformConnections.status, 'active'),
    ),
  })
  if (!connection?.refreshTokenEncrypted) return null
  return { clientId, clientSecret, refreshToken: decryptCredential(connection.refreshTokenEncrypted) }
}

// Park a platform failure on the connection itself so the creator sees "reconnect this account"
// instead of a silent no-op. Best-effort: bookkeeping must never mask the original error.
export async function markConnectionError(channelId: string, platform: 'yt', message: string): Promise<void> {
  try {
    await getDb()
      .update(platformConnections)
      .set({ status: 'error', lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(platformConnections.channelId, channelId), eq(platformConnections.platform, platform)))
  } catch (err) {
    console.error(`[publishing] failed to record connection error for channel ${channelId}:`, err)
  }
}
