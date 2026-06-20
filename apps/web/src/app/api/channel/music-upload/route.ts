import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { uploadBuffer } from '@reels/providers'
import { getSession } from '@/lib/auth'

// Operator-uploaded background track for the Sound step. Stored as the channel's bed.
// NOTE: the operator is warned in the UI that uploaded music can get reels muted/blocked by
// platform audio-matching — we don't (and can't) clear rights. Correct playback also needs the
// mixer "bed mode" (loop/trim, no peak-stretch) — that's render-phase work (B2).
const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
}
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  const ext = EXT[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported audio type (use MP3, M4A, WAV, AAC, or OGG)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 15 MB)' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const key = `channel-music/${randomUUID()}.${ext}`
  try {
    await uploadBuffer(key, buf, file.type)
    return NextResponse.json({ key })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
