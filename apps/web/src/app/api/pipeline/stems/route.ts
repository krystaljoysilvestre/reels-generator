import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, eq, desc } from 'drizzle-orm'
import { getDb, assets } from '@reels/db'
import { getSession } from '@/lib/auth'

// GET /api/pipeline/stems?reelId=  → the reel's 4 mix layers (voice/music/sfx/ambient) as playable URLs.
// Stems are persisted by mix_audio (pre-loudnorm layers) for per-layer listening / debugging / a future
// operator mixer. Served through the existing /api/asset proxy (auth'd, no-store for reels/ keys).
const LAYERS = ['voice', 'music', 'sfx', 'ambient'] as const

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reelId = req.nextUrl.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })

  const db = getDb()
  const rows = await db.query.assets.findMany({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'stem')),
    orderBy: [desc(assets.createdAt)],
  })

  // Newest row per layer (a re-mix upserts in place, but guard against any duplicates).
  const byLayer = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const layer = String((r.meta as Record<string, unknown>)['layer'] ?? '')
    if (layer && !byLayer.has(layer)) byLayer.set(layer, r)
  }

  const stems = LAYERS.flatMap((layer) => {
    const r = byLayer.get(layer)
    if (!r) return []
    return [{
      layer,
      key: r.storageKey,
      url: `/api/asset?key=${encodeURIComponent(r.storageKey)}&v=${r.createdAt.getTime()}`,
      updatedAt: r.createdAt,
    }]
  })

  return NextResponse.json({ stems })
}
