import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { uploadBuffer } from '@reels/providers'
import { requireApiUser } from '@/lib/api-access'

// Operator image upload → R2. The returned key is used two ways: (1) as an extra REFERENCE in a scene
// reshoot ("attach a reference image"), and (2) as a character's face plate ("use my photo"). Real-person
// photos are the operator's responsibility (consent); the image providers still moderate every render.
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 12 * 1024 * 1024 // 12 MB

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const ext = EXT[file.type]
  if (!ext) return NextResponse.json({ error: 'Unsupported image type (use JPG, PNG, or WEBP)' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 12 MB)' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const key = `uploads/${randomUUID()}.${ext}`
  try {
    await uploadBuffer(key, buf, file.type)
    return NextResponse.json({ key })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 502 })
  }
}
