import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, platformConnections } from '@reels/db'
import { requireChannelOwner } from '@/lib/api-access'
import { decryptCredential } from '@/lib/publishing-credentials'

const Body = z.object({ channelId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a channel first.' }, { status: 400 })
  const gate = await requireChannelOwner(parsed.data.channelId)
  if (gate instanceof NextResponse) return gate
  const db = getDb()
  const connection = await db.query.platformConnections.findFirst({ where: and(
    eq(platformConnections.channelId, parsed.data.channelId),
    eq(platformConnections.platform, 'yt'),
  ) })
  if (connection) {
    const encrypted = connection.refreshTokenEncrypted ?? connection.accessTokenEncrypted
    if (encrypted) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: decryptCredential(encrypted) }),
        })
      } catch (error) {
        console.warn(`[publishing] YouTube revoke failed for channel ${parsed.data.channelId}:`, error)
      }
    }
  }
  await db.delete(platformConnections).where(and(
    eq(platformConnections.channelId, parsed.data.channelId),
    eq(platformConnections.platform, 'yt'),
  ))
  console.log(`[publishing] disconnected YouTube from channel ${parsed.data.channelId}`)
  return NextResponse.json({ ok: true })
}
