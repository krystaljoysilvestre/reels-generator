// POST package export — video + thumbnail + caption.txt + AI-disclosure note, zipped.
// Downloaded from the dashboard for manual posting (Phase 1).
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels, assets, scenes, channels } from '@reels/db'
import { eq, and, asc, sql } from 'drizzle-orm'
import { downloadBuffer, llmCall } from '@reels/providers'
import { PostMetaSchema, PostingRulesSchema, formatPostCaption, formatImageCredits, StoryBibleSchema, nextPublishSlot, resolvePublishSlots, resolvePublishDays, type PostMeta } from '@reels/core'
import { buildPostMetaPrompt, PostMetaLlmSchema, POST_META_V1_VERSION } from '@reels/core/prompts/post-meta.v1'
import { requireReelOwner, requireSpendBudget } from '@/lib/api-access'

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

// The reel's post metadata: prefer what the generate_post_meta step wrote (operator-editable); for
// reels that predate the step, generate once here and persist — never ship placeholder hashtags.
async function resolvePostMeta(
  reel: { id: string; postMeta: unknown; language: string },
  story: { title: string; logline: string | null; body: string } | null,
  channel: { name: string; nicheDescription: string | null; genreCategory: string; postingRules: unknown } | null,
): Promise<PostMeta | null> {
  const existing = PostMetaSchema.safeParse(reel.postMeta)
  if (existing.success) return existing.data
  if (!story || !channel) return null

  const postingRules = PostingRulesSchema.parse(channel.postingRules ?? {})
  const { system, userMessage } = buildPostMetaPrompt({
    channelName: channel.name,
    nicheDescription: channel.nicheDescription ?? '',
    language: reel.language,
    platforms: postingRules.platforms,
    genreCategory: channel.genreCategory,
    title: story.title,
    logline: story.logline ?? '',
    narration: story.body,
  })
  try {
    const llm = await llmCall({
      templateVersion: POST_META_V1_VERSION,
      schema: PostMetaLlmSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.8,
      maxTokens: 800,
    })
    const meta = PostMetaSchema.parse({ ...PostMetaLlmSchema.parse(llm.data), v: 1, language: reel.language })
    const db = getDb()
    // Atomic cost increment — an export could race a pipeline step's own cost write.
    await db.update(reels)
      .set({
        postMeta: meta,
        ...(llm.costCents > 0 ? { costCents: sql`${reels.costCents} + ${llm.costCents}` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(reels.id, reel.id))
    return meta
  } catch {
    return null // fall back to the logline-only caption below
  }
}

export async function GET(req: NextRequest) {
  const reelId = req.nextUrl.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'Missing reelId' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  // Paid call (vision / LLM) — respect the caller's spend cap before spending.
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

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

  // Thumbnail: prefer the composited one (hero frame + title, made at render); else fall back to the
  // first hero scene's raw still, else the opening frame. Best-effort — a reel with no scene images
  // still exports.
  let thumb: { name: string; data: Buffer } | null = null
  try {
    const composited = reelAssets.find(
      (a) => a.kind === 'image' && (a.meta as { role?: string } | null)?.role === 'thumbnail',
    )
    if (composited) {
      thumb = { name: 'thumbnail.jpg', data: await downloadBuffer(composited.storageKey) }
    }
  } catch { /* fall through to the raw hero frame */ }
  if (!thumb) try {
    const heroScene =
      (await db.query.scenes.findFirst({
        where: and(eq(scenes.reelId, reelId), eq(scenes.isHero, true)),
        orderBy: [asc(scenes.idx)],
        columns: { imageAssetId: true },
      })) ??
      (await db.query.scenes.findFirst({
        where: eq(scenes.reelId, reelId),
        orderBy: [asc(scenes.idx)],
        columns: { imageAssetId: true },
      }))
    if (heroScene?.imageAssetId) {
      const imgAsset = await db.query.assets.findFirst({ where: eq(assets.id, heroScene.imageAssetId) })
      if (imgAsset) {
        const ext = imgAsset.storageKey.split('.').pop()?.toLowerCase()
        const safeExt = ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
        thumb = { name: `thumbnail.${safeExt}`, data: await downloadBuffer(imgAsset.storageKey) }
      }
    }
  } catch { /* the thumbnail is a bonus, never a blocker */ }

  // Build the caption from the reel's post package (title/hook/caption/hashtags).
  const story = reel.story
  const meta = await resolvePostMeta(reel, story, channel ?? null)
  // Image-attribution credits for any real SOURCED plates (Wikimedia etc.) — appended so licence terms are met.
  const bibleParse = reel.storyBible ? StoryBibleSchema.safeParse(reel.storyBible) : null
  const imageCredits = bibleParse?.success ? formatImageCredits(bibleParse.data) : ''
  const captionBody = meta
    ? [`TITLE: ${meta.title}`, '', formatPostCaption(meta)].join('\n')
    : (story?.logline ?? story?.title ?? '')
  const caption = imageCredits ? `${captionBody}\n\n${imageCredits}` : captionBody

  // The channel's posting slot, as a line an operator can act on. On a scheduled channel that's the
  // next actual slot (date + time); otherwise it's the single standing posting hour.
  const rules = PostingRulesSchema.parse(channel?.postingRules ?? {})
  const nextSlot =
    rules.publish.mode === 'slots'
      ? nextPublishSlot({
          now: new Date(),
          slotsUtc: resolvePublishSlots(rules),
          daysUtc: resolvePublishDays(rules),
          taken: [],
        })
      : null
  const postingSlotLine = nextSlot
    ? `[ ] Post at ${nextSlot.toISOString().replace('T', ' ').slice(0, 16)} UTC (your channel's next posting slot)`
    : `[ ] Post around ${String(rules.scheduleUtcHour).padStart(2, '0')}:00 UTC (your channel's posting slot)`

  // AI disclosure note (required by platform policies)
  const disclosure = [
    'AI DISCLOSURE',
    '─────────────',
    'This content was created with AI assistance.',
    'Platform labels: "AI-generated content" or "Synthetic media"',
    '',
    `Channel: ${channel?.name ?? 'Unknown channel'}`,
    `Reel ID: ${reelId}`,
    `Created: ${new Date().toISOString()}`,
    '',
    'POSTING CHECKLIST:',
    '[ ] Add AI disclosure label in the platform upload settings',
    '[ ] Cross-post as separate native uploads (never repost identical files)',
    postingSlotLine,
    '[ ] Reply to the first few comments within the hour',
  ].join('\n')

  const zip = buildZip([
    { name: 'reel.mp4', data: videoBuf },
    ...(thumb ? [thumb] : []),
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
