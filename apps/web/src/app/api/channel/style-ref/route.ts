import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { llmCall, uploadBuffer } from '@reels/providers'
import { ToneConfigSchema } from '@reels/core'
import {
  buildStyleRefPrompt,
  StyleRefSchema,
  STYLE_REF_V1_VERSION,
} from '@reels/core/prompts/style-ref.v1'
import { getSession } from '@/lib/auth'

// Operator uploads 1–3 reference images; a vision pass distills their shared visual
// STYLE into the channel's stylePreset DNA (so the text-to-image pipeline can apply it
// to new scenes). The first image is kept in R2 as the channel's visual reference.
type ImageMedia = 'image/png' | 'image/jpeg' | 'image/webp'
const EXT: Record<ImageMedia, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB per image
const MAX_FILES = 3

// Detect the REAL image type from magic bytes — don't trust the declared MIME (it can
// be wrong, and the vision model rejects a mismatched media type).
function sniffMime(buf: Buffer): ImageMedia | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form' }, { status: 400 })

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No image' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} images` }, { status: 400 })

  const niche = (form.get('nicheDescription') as string | null)?.trim() || ''
  const toneParsed = ToneConfigSchema.safeParse(JSON.parse((form.get('toneConfig') as string) || '{}'))
  const toneJson = JSON.stringify(toneParsed.success ? toneParsed.data : {})

  const prepared: Array<{ media: ImageMedia; b64: string; buf: Buffer }> = []
  for (const file of files) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Each image must be ≤ 2 MB' }, { status: 400 })
    const buf = Buffer.from(await file.arrayBuffer())
    const media = sniffMime(buf)
    if (!media) return NextResponse.json({ error: 'Use PNG, JPG, or WebP' }, { status: 400 })
    prepared.push({ media, b64: buf.toString('base64'), buf })
  }

  // Keep only the first image as the channel's visual reference; the rest inform the
  // vision pass (base64, in-memory) but aren't stored.
  const first = prepared[0]!
  const imageKey = `style-refs/${randomUUID()}.${EXT[first.media]}`

  const { system, userMessage } = buildStyleRefPrompt({ nicheDescription: niche, toneJson })
  const content = [
    ...prepared.map((p) => ({
      type: 'image' as const,
      mediaType: p.media,
      base64: p.b64,
    })),
    { type: 'text' as const, text: userMessage },
  ]

  try {
    await uploadBuffer(imageKey, first.buf, first.media)
    const result = await llmCall({
      templateVersion: STYLE_REF_V1_VERSION,
      schema: StyleRefSchema,
      system,
      messages: [{ role: 'user', content }],
      maxTokens: 700,
    })
    return NextResponse.json({
      imageKey,
      label: result.data.label,
      description: result.data.description,
      stylePreset: result.data.stylePreset,
      costCents: result.costCents,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Couldn’t read the reference image'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
