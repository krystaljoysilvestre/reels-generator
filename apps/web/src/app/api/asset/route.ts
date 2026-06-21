// Proxies R2 assets to the browser (avoids needing a public R2 bucket).
// In production with a public CDN, swap this for a direct URL.
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { downloadBuffer } from '@reels/providers'
import { getSession } from '@/lib/auth'

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
}

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  const ext = key.split('.').at(-1) ?? ''
  const contentType = MIME[ext] ?? 'application/octet-stream'

  const buf = await downloadBuffer(key)
  // Anything regenerated under the SAME key must be served uncached, or the browser shows a stale
  // copy after a re-gen ("nothing changed"). That's ALL reel assets (scene images/videos + render are
  // re-generated in place via regen-image, re-tier, style edits, re-render) plus preset beds.
  const regenerable = key.startsWith('reels/') || key.startsWith('audio/presets/')
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': regenerable ? 'no-store, must-revalidate' : 'private, max-age=3600',
    },
  })
}
