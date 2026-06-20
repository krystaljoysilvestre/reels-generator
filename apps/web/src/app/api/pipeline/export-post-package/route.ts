// POST package export — video + caption.txt + AI-disclosure note, zipped.
// Downloaded from the dashboard for manual posting (Phase 1).
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels, assets, stories, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { downloadBuffer } from '@reels/providers'
import { getSession } from '@/lib/auth'

// Minimal ZIP builder without native deps (zip is just stored entries)
function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = []
  const entries: Array<{ name: string; offset: number; size: number; crc: number }> = []
  let offset = 0

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.allocUnsafe(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)  // signature
    local.writeUInt16LE(20, 4)           // version
    local.writeUInt16LE(0, 6)            // flags
    local.writeUInt16LE(0, 8)            // compression (stored)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12)  // mod time/date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)  // compressed size
    local.writeUInt32LE(file.data.length, 22)  // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    nameBytes.copy(local, 30)

    entries.push({ name: file.name, offset, size: file.data.length, crc })
    parts.push(local, file.data)
    offset += local.length + file.data.length
  }

  // Central directory
  const cdParts: Buffer[] = []
  let cdOffset = offset
  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, 'utf8')
    const cd = Buffer.allocUnsafe(46 + nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(e.crc, 16)
    cd.writeUInt32LE(e.size, 20); cd.writeUInt32LE(e.size, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(e.offset, 42)
    nameBytes.copy(cd, 46)
    cdParts.push(cd)
    offset += cd.length
  }

  const cdSize = offset - cdOffset
  const eocd = Buffer.allocUnsafe(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, ...cdParts, eocd])
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  const table = crc32Table()
  for (const byte of buf) crc = (table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}
function crc32Table(): Uint32Array {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
}

const HASHTAGS_BY_LANGUAGE: Record<string, string[]> = {
  tagalog: ['#kwentongaswang', '#pilipinohorror', '#gabingmisteryo', '#aswangfiles', '#totallyspookystories'],
  taglish: ['#kwentongaswang', '#pilipinohorror', '#gabingmisteryo', '#horrorstories', '#aswangfiles'],
  english: ['#filipinohorror', '#horrorstories', '#aswangfiles', '#spookystories'],
}

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reelId = req.nextUrl.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'Missing reelId' }, { status: 400 })

  const db = getDb()
  const reel = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    with: { story: true },
  })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const renderAsset = reelAssets.find((a) => a.kind === 'render')
  if (!renderAsset) return NextResponse.json({ error: 'No render yet' }, { status: 400 })

  // Download the render
  const videoBuf = await downloadBuffer(renderAsset.storageKey)

  // Build caption
  const story = reel.story
  const hashtags = (HASHTAGS_BY_LANGUAGE[reel.language] ?? HASHTAGS_BY_LANGUAGE['tagalog']!).join(' ')
  const caption = [
    story?.logline ?? story?.title ?? '',
    '',
    hashtags,
  ].join('\n')

  // AI disclosure note (required by platform policies — CLAUDE.md rule 7)
  const disclosure = [
    'AI DISCLOSURE',
    '─────────────',
    'This content was created with AI assistance.',
    'Platform labels: "AI-generated content" or "Synthetic media"',
    '',
    `Channel: ${channel?.name ?? 'Aswang Files'}`,
    `Reel ID: ${reelId}`,
    `Created: ${new Date().toISOString()}`,
    '',
    'POSTING CHECKLIST:',
    '[ ] Add AI disclosure label in FB/IG/YT upload settings',
    '[ ] Cross-post as separate native uploads (never repost identical files)',
    '[ ] Schedule at 9PM PHT for best reach',
    '[ ] Reply to first 5 comments within the hour',
  ].join('\n')

  const zip = buildZip([
    { name: 'reel.mp4', data: videoBuf },
    { name: 'caption.txt', data: Buffer.from(caption, 'utf8') },
    { name: 'AI-DISCLOSURE.txt', data: Buffer.from(disclosure, 'utf8') },
  ])

  // The filename goes into an HTTP header (ByteString/Latin1) — collapse anything that isn't a
  // plain ASCII alphanumeric to a dash so LLM titles with em dashes / smart quotes / accents don't
  // blow up the Content-Disposition header.
  const slug =
    (story?.title ?? reelId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || reelId
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}-post-package.zip"`,
    },
  })
}
