// Thumbnail preview — render the shipped treatment against real hero frames, without a render or a bill.
//
// HISTORY, because the shape of this script is the record of how the treatment was chosen. The publish-bar
// audit (2026-08-10) named thumbnails as a reason no reel had been published. Direction was a taste call
// and my taste is explicitly not the instrument (current-metrics.md's standing risk: our automated
// instruments do not track the founder's ear), so this rendered a MATRIX — four treatments × two fittings,
// 28 candidates from the founder's own frames. The founder marked `edge` at every fitting on every
// vertical channel; the other three treatments were deleted rather than kept behind a prop.
//
// Live convention research was attempted first and ABANDONED: the search model fabricated its citations
// (placeholder URLs like `watch?v=video_id1`) because a text model cannot see images. The treatment
// therefore rests on fundamentals that don't churn — contrast, scale, focal isolation — plus the
// founder's pick on real output, not on research that didn't happen.
//
// What remains is a preview harness: change the composition, run this, look at real frames before paying
// for a render.
//
// Usage (cwd apps/worker): pnpm exec tsx scripts/thumbnail-candidates.ts
//   OUT=/path  → where to write (default: ./thumbnail-candidates)
// Cost: $0 — hero frames and post-meta already exist; this is compute only. No LLM calls, no DB writes.
import '../src/env.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Pixel dimensions via `sips` (macOS, already required by nothing else here — a 3-line shell read beats
// pulling in an image library for two integers). Used only to decide whether the frame axis applies.
const run = promisify(execFile)
async function imageSize(path: string): Promise<{ width: number; height: number }> {
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path])
  const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1] ?? 0)
  const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1] ?? 0)
  return { width, height }
}

const slugFor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ENV_KEY = (name: string) => slugFor(name).toUpperCase().replace(/-/g, '_')

void (async () => {
  const { getDb, reels, channels, scenes, assets, stories } = await import('@reels/db')
  const { eq, and, desc } = await import('drizzle-orm')
  const { downloadBuffer } = await import('@reels/providers')
  const { PostMetaSchema, thumbnailOverlay, CaptionStyleSchema } = await import('@reels/core')
  const { renderThumbnailStill } = await import('@reels/render/remotion/render-remotion')

  const OUT = process.env['OUT'] ?? join(process.cwd(), 'thumbnail-candidates')
  const SUFFIX = process.env['SUFFIX'] ?? ''
  mkdirSync(OUT, { recursive: true })
  const tmp = mkdirSync(join(tmpdir(), `thumbcand-${process.pid}`), { recursive: true })!
  const db = getDb()

  // Every reel that actually has a rendered frame to work from — the three the founder just watched.
  const rows = await db.select().from(reels).orderBy(desc(reels.createdAt))
  let made = 0

  for (const reel of rows) {
    const ch = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
    if (!ch) continue
    const reelScenes = await db.select().from(scenes).where(eq(scenes.reelId, reel.id))
    const all = await db.select().from(assets).where(eq(assets.reelId, reel.id))
    const hero = reelScenes.find((s) => s.isHero && s.imageAssetId) ?? reelScenes.find((s) => s.imageAssetId)
    const heroAsset = hero?.imageAssetId ? all.find((a) => a.id === hero.imageAssetId) : null
    if (!heroAsset) continue

    // The overlay the shipped path would now use. Old reels have no thumbnailText, so this falls back to
    // the title — which is exactly the "before" case worth seeing beside the treatments.
    const pm = PostMetaSchema.safeParse(reel.postMeta)
    const story = reel.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : null
    // OVERLAY_* env overrides let the same frames be rendered with a realistic SHORT overlay. Without
    // this the candidates are judged carrying an old full-title overlay — i.e. handicapped by the very
    // defect this lap fixes, which would make every treatment look bad for the wrong reason.
    const forced = process.env[`OVERLAY_${ENV_KEY(ch.name)}`] ?? process.env['OVERLAY']
    const overlay = forced ?? (pm.success ? thumbnailOverlay(pm.data) : (story?.title ?? ''))
    if (!overlay.trim()) continue
    const caption = CaptionStyleSchema.safeParse(ch.captionStyle)
    const accent = caption.success ? caption.data.highlightColor : undefined

    const heroPath = join(tmp as unknown as string, `${reel.id}.webp`)
    writeFileSync(heroPath, await downloadBuffer(heroAsset.storageKey))
    const slug = slugFor(ch.name)

    // `sourceVertical` decides the fitting, and production reads it from the platform preset rather than
    // the file. Here there is no preset in hand, so measure the actual frame — same answer, since the
    // scene images are rendered at the preset's dimensions.
    const meta = await imageSize(heroPath)
    const sourceVertical = meta.height > meta.width

    const file = join(OUT, `${slug}${SUFFIX}.jpg`)
    const note = sourceVertical
      ? `vertical → uncropped panel right + blurred fill (a 16:9 centre crop would keep only ${Math.round(((meta.width / meta.height) / (16 / 9)) * 100)}% of the height)`
      : 'already 16:9 → full bleed'
    console.log(`\n${ch.name}  —  overlay: "${overlay}"`)
    console.log(`   source ${meta.width}×${meta.height} · ${note}`)
    try {
      await renderThumbnailStill({
        imagePath: heroPath,
        title: overlay,
        outputPath: file,
        sourceVertical,
        ...(accent ? { accent } : {}),
      })
      made++
      console.log(`   ✓ → ${file}`)
    } catch (err) {
      console.log(`   ✗ ${err instanceof Error ? err.message.slice(0, 140) : String(err)}`)
    }
  }

  console.log(`\n${made} candidate(s) → ${OUT}`)
  console.log(`\nSet OVERLAY_<CHANNEL_SLUG> to preview at the intended 3-5 words. Without it an old reel`)
  console.log(`falls back to its whole title — the defect post-meta.v1.2 fixes upstream — which makes the`)
  console.log(`treatment look bad for a reason that is not the treatment.`)
  process.exit(0)
})()
