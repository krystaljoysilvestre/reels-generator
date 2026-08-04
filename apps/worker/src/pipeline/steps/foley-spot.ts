import { eq, and } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { getDb, reels, scenes, assets } from '@reels/db'
import { generateSfx as elGenerateSfx, buildInputHash, downloadBuffer, llmCall, spendFromError } from '@reels/providers'
import {
  TimingsSchema,
  isVocalSfxPrompt,
  dropEventsNear,
  clipPlaybackRate,
  clipMsToReelMs,
  clipVisibleEndMs,
} from '@reels/core'
import { buildFoleySpotPrompt, FOLEY_SPOT_V1_VERSION, FoleySpotSchema } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'
import { runPool } from '../pool.js'

// foley_spot — runs at the TAIL of animate_scenes (not its own pipeline step). For each video-tier scene's
// generated clip it "spots" the picture: a cheap vision pass marks the visible motions that make a sound,
// and we generate matching foley placed on that exact beat. Fail-soft: any error skips foley for that
// scene — it never blocks a render. Placement is finalized at mix time (buildFoleyEvents); here we only
// generate the clips + record which scene/clip-time each belongs to.

const execFileAsync = promisify(execFile)
const FOLEY_SPOT_MODEL = 'claude-haiku-4-5-20251001' // same cheap vision model as clip QA
const SPOT_FPS = 2       // frames per second sampled from the clip → ±250ms timestamp resolution
const MAX_FRAMES = 20    // bound cost on a 10s clip
// Spotting fans out two levels (scenes, then each scene's events). Kept modest at each level because they
// MULTIPLY: the provider semaphores (anthropic 4 / elevenlabs 4) are the authoritative cap, and sizing these
// so the product sits near those caps means calls queue in the pool instead of stalling inside the limiter.
const FOLEY_SCENE_CONCURRENCY = 2
const FOLEY_EVENT_CONCURRENCY = 2

// Sample frames across a clip at SPOT_FPS. Returns PNG buffers + their clip-relative timestamps (seconds).
async function extractSpotFrames(videoBuf: Buffer, reelId: string, sceneIdx: number): Promise<{ frames: Buffer[]; timestampsSec: number[] }> {
  const dir = join(tmpdir(), `reels-foley-${reelId}-s${sceneIdx}`)
  await mkdir(dir, { recursive: true })
  try {
    const inPath = join(dir, 'clip.mp4')
    await writeFile(inPath, videoBuf)
    await execFileAsync('ffmpeg', ['-i', inPath, '-vf', `fps=${SPOT_FPS},scale=512:-2`, '-frames:v', String(MAX_FRAMES), '-y', join(dir, 'f_%03d.png')])
    const files = (await readdir(dir)).filter((f) => f.startsWith('f_') && f.endsWith('.png')).sort()
    const frames = await Promise.all(files.map((f) => readFile(join(dir, f))))
    const timestampsSec = frames.map((_, i) => i / SPOT_FPS)
    return { frames, timestampsSec }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function spotFoleyForReel(reelId: string): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings) return
  const timings = TimingsSchema.safeParse(reel.timings)
  if (!timings.success) return

  const spanByIdx = new Map(timings.data.scenes.map((s) => [s.idx, s]))
  const anchoredAtMs = timings.data.sfxEvents.map((e) => e.atMs)

  const videoScenes = (await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })).filter((s) => s.tier === 'video')

  // Scenes spot CONCURRENTLY: each is an independent download → frame extract → vision call → SFX batch, on
  // its own step row and its own storage keys. Serially this ran after every clip had already finished, so it
  // sat on the critical path as the sum of each scene's round trips.
  await runPool(videoScenes, FOLEY_SCENE_CONCURRENCY, async (scene) => {
    const span = spanByIdx.get(scene.idx)
    if (!span) return

    // Newest video clip for this scene (variationIdx 0 is the one render composites).
    const videoAssets = (await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) }))
      .filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const clip = videoAssets[0]
    if (!clip) return

    const clipDurationSec = Number((clip.meta as Record<string, unknown>)['durationSec']) || 5
    const sourceClipAt = clip.createdAt.toISOString()

    // Idempotency: foley already spotted for THIS clip take (bumps when the clip is re-animated).
    const existingFoley = (await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'sfx')) }))
      .filter((a) => {
        const m = a.meta as Record<string, unknown>
        return m['foley'] === true && m['sceneIdx'] === scene.idx && m['sourceClipAt'] === sourceClipAt
      })
    if (existingFoley.length > 0) return

    const inputHash = buildInputHash('foley.spot.v1', { clipAt: sourceClipAt, sceneIdx: scene.idx, reelId })

    // Per-scene step row (`animate_scenes:foley-s<idx>`), matching the fan-out convention. The suffix used to
    // sit on the inputHash while every scene shared the bare 'animate_scenes' step name; since idempotency is
    // keyed on (reelId, stepName), the scenes overwrote each other's row and the cached result never hit. A
    // scene that spots ZERO events leaves no asset behind, so the existingFoley pre-check above can't cover
    // it — it re-paid the 20-frame vision call on every re-run of animate_scenes.
    await runStep(
      { reelId, stepName: `animate_scenes:foley-s${scene.idx}` as never, inputHash },
      async (costSink) => {
        // Hoisted above the try: foley is fail-soft (a spotting error must not fail the render), and the
        // catch used to return 0 — so a vision call plus N generated SFX that had ALREADY been paid for
        // vanished from the reel's cost, unrecoverably, since the step still reports done.
        //
        // Each charge below goes to BOTH `cost` and the sink, which is deliberate, not a double-add: the
        // harness bills the RETURNED costCents on success and the sink's total ONLY when fn throws, never
        // both. The sink covers the one case the return can't — fn succeeding but the harness's own
        // transaction failing and rolling the increment back.
        let cost = 0
        try {
          const buf = await downloadBuffer(clip.storageKey)
          const { frames, timestampsSec } = await extractSpotFrames(buf, reelId, scene.idx)
          if (frames.length === 0) return { output: { sceneIdx: scene.idx, spotted: 0, generated: 0 }, costCents: 0 }

          const { system, userMessage } = buildFoleySpotPrompt({
            durationSec: clipDurationSec,
            frameTimestampsSec: timestampsSec,
            motionPrompt: scene.motionPrompt ?? null,
          })
          const r = await llmCall({
            templateVersion: FOLEY_SPOT_V1_VERSION,
            schema: FoleySpotSchema,
            provider: 'anthropic',
            model: FOLEY_SPOT_MODEL,
            system,
            messages: [
              {
                role: 'user',
                content: [
                  ...frames.map((f) => ({ type: 'image' as const, mediaType: 'image/png' as const, base64: f.toString('base64') })),
                  { type: 'text' as const, text: userMessage },
                ],
              },
            ],
          })
          cost += r.costCents
          costSink.add(r.costCents)

          // Pre-generation filter (saves SFX spend): drop vocal prompts, drop events that map past the
          // clip's visible window, and drop those that would collide with a narration-anchored cue. The
          // authoritative placement/dedupe still runs at mix time (buildFoleyEvents).
          // Runtime values are schema-clamped; `?? default` only satisfies the input-typed llmCall generic.
          const spotted = r.data.events ?? []
          const rate = clipPlaybackRate(clipDurationSec, (span.endMs - span.startMs) / 1000)
          const visibleEnd = clipVisibleEndMs(span.startMs, span.endMs, clipDurationSec, rate)
          const candidates = spotted
            .filter((e) => !isVocalSfxPrompt(e.sfxPrompt))
            .map((e) => ({
              sfxPrompt: e.sfxPrompt,
              durationSec: e.durationSec ?? 1.5,
              volumeDb: e.volumeDb ?? -8,
              clipMs: Math.round((e.atSec ?? 0) * 1000),
            }))
            .map((e) => ({ ...e, atMs: clipMsToReelMs(span.startMs, e.clipMs, rate) }))
            .filter((e) => e.atMs >= span.startMs && e.atMs <= visibleEnd)
          const survivors = dropEventsNear(candidates, anchoredAtMs, 1200)

          // The spotted events for a scene generate CONCURRENTLY — each is a separate ElevenLabs round trip
          // writing its own storage key, so nothing is shared but the cost tally (single-threaded += is safe).
          let generated = 0
          await runPool(survivors, FOLEY_EVENT_CONCURRENCY, async (ev) => {
            const slugSuffix = createHash('sha1').update(`${scene.idx}\x00${ev.clipMs}\x00${ev.sfxPrompt}`).digest('hex').slice(0, 10)
            const res = await elGenerateSfx({
              prompt: ev.sfxPrompt,
              reelId,
              anchorLabel: `foley-s${scene.idx}-${ev.clipMs}`,
              durationSec: ev.durationSec,
              slugSuffix,
            })
            cost += res.costCents
            costSink.add(res.costCents)
            generated++
            const meta = {
              foley: true as const,
              sceneIdx: scene.idx,
              clipMs: ev.clipMs,
              clipDurationSec,
              volumeDb: ev.volumeDb,
              durationMs: res.durationMs,
              sourceClipAt,
              prompt: ev.sfxPrompt,
            }
            await db.insert(assets).values({
              reelId,
              channelId: reel.channelId,
              kind: 'sfx',
              storageKey: res.audioStorageKey,
              provider: 'elevenlabs',
              costCents: res.costCents,
              meta,
            }).onConflictDoUpdate({
              target: [assets.reelId, assets.storageKey],
              set: { kind: 'sfx', provider: 'elevenlabs', costCents: res.costCents, meta, createdAt: new Date() },
            })
          }, 'foley clip')
          console.log(`[foley] ${reelId.slice(0, 8)} scene${scene.idx}: ${spotted.length} spotted → ${generated} placed`)
          return { output: { sceneIdx: scene.idx, spotted: spotted.length, generated }, costCents: cost }
        } catch (err) {
          // Bill what was already spent before the error, not 0 — the money left our account either way.
          // spendFromError picks up calls the provider paid for and then threw on (a schema-repair round,
          // partially-synthesized TTS chunks): this catch swallows the error, so nothing else can recover it.
          const spent = cost + spendFromError(err)
          console.warn(`[foley] ${reelId.slice(0, 8)} scene${scene.idx} skipped (error, ${spent}¢ already spent): ${err instanceof Error ? err.message : String(err)}`)
          return { output: { sceneIdx: scene.idx, spotted: 0, generated: 0 }, costCents: spent }
        }
      },
    )
  }, 'foley scene')
}
