import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { uploadBuffer } from '@reels/providers'
import { getSession } from '@/lib/auth'

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  const ext = EXT[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported image type (use PNG, JPG, or WebP)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 2 MB)' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const key = `avatars/${randomUUID()}.${ext}`
  try {
    await uploadBuffer(key, buf, file.type)
    return NextResponse.json({ key })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
