// Proxies R2 assets to the browser (avoids needing a public R2 bucket).
// In production with a public CDN, swap this for a direct URL.
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { downloadStream } from '@reels/providers'
import { getSession } from '@/lib/auth'

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
}

// Map an S3/R2 SDK error to an HTTP status without importing the SDK error classes (duck-typed).
function s3Status(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  if (e.name === 'NoSuchKey' || e.name === 'NotFound') return 404
  if (e.name === 'InvalidRange') return 416
  return e.$metadata?.httpStatusCode
}

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  const ext = key.split('.').at(-1) ?? ''
  const contentType = MIME[ext] ?? 'application/octet-stream'

  // Anything regenerated under the SAME key must be served uncached, or the browser shows a stale
  // copy after a re-gen ("nothing changed"). That's ALL reel assets (scene images/videos + render are
  // re-generated in place via regen-image, re-tier, style edits, re-render) plus preset beds.
  const regenerable =
    key.startsWith('reels/') || key.startsWith('audio/presets/') || key.startsWith('audio/reel/')

  try {
    // Stream (with Range support) instead of buffering the whole object: a rendered reel can be ~180s of
    // video, and <video> needs byte-range seeking — Safari refuses sources that don't advertise it, and
    // Chrome would otherwise re-download the whole file on every seek. R2 handles range parsing → 206.
    const range = req.headers.get('range')
    const out = await downloadStream(key, range)
    const headers: Record<string, string> = {
      'Content-Type': out.contentType ?? contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': regenerable ? 'no-store, must-revalidate' : 'private, max-age=3600',
    }
    if (out.contentLength != null) headers['Content-Length'] = String(out.contentLength)
    if (out.contentRange) headers['Content-Range'] = out.contentRange
    return new NextResponse(Readable.toWeb(out.body) as ReadableStream, {
      status: out.statusCode,
      headers,
    })
  } catch (err) {
    const status = s3Status(err)
    if (status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (status === 416) return new NextResponse(null, { status: 416, headers: { 'Accept-Ranges': 'bytes' } })
    console.error(`[asset] failed to serve ${key}:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load asset' }, { status: 502 })
  }
}
