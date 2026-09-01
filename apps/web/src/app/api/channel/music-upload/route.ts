import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { uploadBuffer } from '@reels/providers'
import { assets, getDb } from '@reels/db'
import { requireApiUser, requireChannelOwner, requireReelOwner } from '@/lib/api-access'
import { looksLikeAudio } from '@/lib/upload'

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
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form' }, { status: 400 })
  const channelId = form.get('channelId')
  const reelId = form.get('reelId')
  if ((typeof channelId === 'string') === (typeof reelId === 'string')) {
    return NextResponse.json({ error: 'Choose one asset owner' }, { status: 400 })
  }
  const ownerGate = typeof channelId === 'string'
    ? await requireChannelOwner(channelId)
    : await requireReelOwner(reelId)
  if (ownerGate instanceof NextResponse) return ownerGate
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
  // Confirm the bytes are actually audio — don't store a non-audio blob mislabeled with an audio type.
  if (!looksLikeAudio(buf)) {
    return NextResponse.json({ error: "That file doesn't look like audio. Use MP3, M4A, WAV, AAC, or OGG." }, { status: 400 })
  }
  const key = typeof channelId === 'string'
    ? `channels/${channelId}/music/${randomUUID()}.${ext}`
    : `reels/${reelId}/uploads/music/${randomUUID()}.${ext}`
  try {
    await uploadBuffer(key, buf, file.type)
    await getDb().insert(assets).values({
      channelId: typeof channelId === 'string' ? channelId : null,
      reelId: typeof reelId === 'string' ? reelId : null,
      kind: 'music',
      storageKey: key,
      provider: 'upload',
      meta: { surface: typeof channelId === 'string' ? 'channel_music_upload' : 'reel_music_upload' },
    })
    console.log(`[audit] asset.upload actor=${gate.id} ${typeof channelId === 'string' ? `channel=${channelId}` : `reel=${reelId}`} kind=music key=${key}`)
    return NextResponse.json({ key })
  } catch (err) {
    console.error('[music-upload] upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 })
  }
}
