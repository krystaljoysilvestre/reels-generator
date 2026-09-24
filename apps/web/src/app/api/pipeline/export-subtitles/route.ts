import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { channels, getDb, reels } from '@reels/db'
import { resolveSidecarSrt } from '@reels/core'
import { checkRateLimit } from '@reels/providers'
import { requireReelOwner } from '@/lib/api-access'

export async function GET(req: NextRequest) {
  const parsed = z.string().uuid().safeParse(req.nextUrl.searchParams.get('reelId'))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid reel.' }, { status: 400 })
  const reelId = parsed.data
  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  if (!(await checkRateLimit(`subtitles:download:${gate.id}`, 60, 60_000)).ok) {
    return NextResponse.json({ error: 'Please wait a moment before downloading again.' }, { status: 429 })
  }
  try {
    const db = getDb()
    const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { channelId: true, timings: true } })
    if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId), columns: { captionStyle: true } })
    const srt = resolveSidecarSrt(reel.timings, channel?.captionStyle)
    if (!srt) return NextResponse.json({ error: 'No separate subtitles are available for this reel.' }, { status: 404 })
    return new NextResponse(srt, { headers: {
      'Content-Type': 'application/x-subrip; charset=utf-8',
      'Content-Disposition': 'attachment; filename="subtitles.srt"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch (err) {
    console.error(`[publishing] subtitle download failed for reel ${reelId}:`, err)
    return NextResponse.json({ error: 'Could not download subtitles. Try again.' }, { status: 500 })
  }
}
