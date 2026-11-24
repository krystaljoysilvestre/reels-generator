import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { recordPublication, publicationResponse, PublicationStateError, visualTruthBlockers } from '@reels/db'
import { requireReelOwner } from '@/lib/api-access'
import { checkRateLimit } from '@reels/providers'
import { z } from 'zod'

const POST_HOSTS = {
  tiktok: ['tiktok.com'],
  fb: ['facebook.com', 'fb.watch'],
  ig: ['instagram.com'],
  yt: ['youtube.com', 'youtu.be'],
} as const
const RequestSchema = z.object({
  reelId: z.string().uuid(),
  platform: z.enum(['tiktok', 'fb', 'ig', 'yt']),
  postUrl: z.string().trim().min(1).max(2048).optional(),
}).superRefine(({ platform, postUrl }, ctx) => {
  if (postUrl === undefined) return
  try {
    const url = new URL(postUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !POST_HOSTS[platform].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error('Unsupported post link')
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['postUrl'], message: 'Use an HTTPS post link from the selected platform.' })
  }
})

// The creator confirms ONE destination after posting through the platform's own interface.
// A stored link is never fetched and does not independently verify public availability.
export async function POST(req: NextRequest) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a destination and a valid post link, if included.' }, { status: 400 })
  const { reelId, platform, postUrl } = parsed.data
  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  if (!(await checkRateLimit(`publication:confirm:${gate.id}`, 60, 60_000)).ok) {
    return NextResponse.json({ error: 'Please wait a moment before saving another confirmation.' }, { status: 429 })
  }

  try {
    // Finish the helper's independent pool query before locking the reel (avoid pool starvation).
    const truthBlockers = await visualTruthBlockers(reelId)
    if (truthBlockers.length > 0) {
      return NextResponse.json({ error: 'Fix the flagged visual-truth scenes before publishing.', blockers: truthBlockers }, { status: 409 })
    }
    const result = await recordPublication({ reelId, platform, kind: 'manual', postUrl })
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.log(`[publishing] creator ${gate.id} confirmed reel ${reelId} on ${platform}`)
    return NextResponse.json({ ok: true, reelStatus: result.reelStatus, publication: publicationResponse(result.publication) })
  } catch (err) {
    if (err instanceof PublicationStateError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error(`[publishing] confirmation failed for reel ${reelId} by creator ${gate.id}:`, err)
    return NextResponse.json({ error: 'Could not save your confirmation. Try again.' }, { status: 500 })
  }
}
