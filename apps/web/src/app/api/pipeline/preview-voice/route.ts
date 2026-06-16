import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { ElevenLabsTtsProvider } from '@reels/providers'
import { downloadBuffer } from '@reels/providers'
import { getSession } from '@/lib/auth'

const tts = new ElevenLabsTtsProvider()

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { voiceId, text } = (await req.json()) as { voiceId: string; text: string }
  if (!voiceId || !text) return NextResponse.json({ error: 'Missing voiceId or text' }, { status: 400 })

  // Use a temp reelId prefix for the preview — won't persist to a real reel
  const previewReelId = `preview-${Date.now()}`
  const result = await tts.synthesize({ narration: text, voiceId, reelId: previewReelId })
  const buf = await downloadBuffer(result.audioStorageKey)

  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
