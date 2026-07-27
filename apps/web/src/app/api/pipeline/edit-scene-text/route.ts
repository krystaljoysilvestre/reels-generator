import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, reels, scenes, stories } from '@reels/db'
import { requireReelOwner } from '@/lib/api-access'

const InputSchema = z.object({
  reelId: z.string().uuid(),
  sceneIdx: z.number().int().min(1),
  narrationText: z.string().trim().min(1).max(5000),
})

// Edit one scene's narration (the script for that beat). To preserve the M10 invariant — TTS synthesizes
// story.body and compute_timings matches each scene's narrationText as a contiguous substring of it — we
// also rebuild story.body from ALL scenes in order, so the next render's audio + timings stay consistent
// with the edited script. (compute_timings skips whitespace between scenes, so a '\n' join is safe.)
export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { reelId, sceneIdx, narrationText } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) return NextResponse.json({ error: 'Reel or story not found' }, { status: 404 })

  // Only edit narration in states where the operator hasn't handed off to a render. Editing during
  // 'rendering'/'render_qa' rewrites story.body while TTS is synthesizing the OLD body — compute_timings'
  // contiguous-substring match then fails or produces misaligned captions. storyboard + spot_check are
  // the two gates a render is (re)started from, so they're the safe editable window.
  const EDITABLE: string[] = ['storyboard', 'spot_check']
  if (!EDITABLE.includes(reel.status)) {
    return NextResponse.json(
      { error: `Can't edit the script while the reel is '${reel.status}'.` },
      { status: 409 },
    )
  }

  await db.update(scenes).set({ narrationText }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  const all = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
    columns: { narrationText: true },
  })
  const body = all.map((s) => s.narrationText.trim()).filter(Boolean).join('\n')
  // Clear the peak anchor: it points at a verbatim line in the OLD body, so after an edit it's either
  // stale or (when a prior extraction found nothing usable, stored as '') a marker that would stop
  // breakdown_scenes from ever extracting one again. Null means "not extracted yet" — it re-derives from
  // the new text, which is what drives the climax scene and the music swell.
  await db.update(stories).set({ body, twistAnchor: null, updatedAt: new Date() }).where(eq(stories.id, reel.storyId))

  return NextResponse.json({ ok: true })
}
