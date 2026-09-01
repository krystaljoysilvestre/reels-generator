import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { uploadBuffer } from '@reels/providers'
import { assets, getDb } from '@reels/db'
import { requireApiUser, requireChannelOwner } from '@/lib/api-access'
import { sniffImageMime, IMAGE_EXT } from '@/lib/upload'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: NextRequest) {
  const apiGate = await requireApiUser()
  if (apiGate instanceof NextResponse) return apiGate

  const form = await req.formData().catch(() => null)
  const channelId = form?.get('channelId')
  if (typeof channelId !== 'string') return NextResponse.json({ error: 'Missing channel' }, { status: 400 })
  const gate = await requireChannelOwner(channelId)
  if (gate instanceof NextResponse) return gate
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 2 MB)' }, { status: 400 })
  }

  // Verify the REAL image type from magic bytes rather than trusting the client Content-Type.
  const buf = Buffer.from(await file.arrayBuffer())
  const media = sniffImageMime(buf)
  if (!media) {
    return NextResponse.json({ error: 'Unsupported image type (use PNG, JPG, or WebP)' }, { status: 400 })
  }
  const key = `channels/${channelId}/avatar/${randomUUID()}.${IMAGE_EXT[media]}`
  try {
    await uploadBuffer(key, buf, media)
    await getDb().insert(assets).values({
      channelId,
      kind: 'image',
      storageKey: key,
      provider: 'upload',
      meta: { surface: 'channel_avatar' },
    })
    console.log(`[audit] asset.upload actor=${gate.id} channel=${channelId} kind=avatar key=${key}`)
    return NextResponse.json({ key })
  } catch (err) {
    console.error('[avatar] upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 })
  }
}
