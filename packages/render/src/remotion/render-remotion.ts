// Server-side Remotion render — produces visual-only MP4 (no audio).
// Audio is muxed in by FFmpeg afterwards.
//
// Remotion license: free for individuals + companies under $1M revenue.
// Re-evaluate at M7 (SaaS go decision). [H6]

import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition, ensureBrowser } from '@remotion/renderer'
import { readFile } from 'node:fs/promises'
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { cpus } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaptionStyle, ReelCompositionProps, ReelScene, SceneEffect, SubtitleChunk } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface RemotionRenderInput {
  scenes: Array<{
    idx: number
    imagePath: string         // local file path
    videoPath: string | null  // local file path, null for stills
    tier: 'still' | 'video'
    startMs: number
    endMs: number
    mood: string[]            // ambient/grade hints — drives per-scene atmosphere intensity
    onScreenText?: string | null // optional title/overlay burned on this scene
    effects?: SceneEffect[]   // per-scene video effects (zoom/shake/glitch/flash/vhs)
    cameraMove?: string | null // director's camera move → still Ken Burns motion (ignored for video)
    videoDurationSec?: number | null // native i2v clip length → stretch to fill a longer scene span
  }>
  subtitles: SubtitleChunk[]
  captionStyle: CaptionStyle
  captionSafeZonePct: number
  durationMs: number
  // Output frame (platform preset). Absent → the registered composition default (1080×1920 vertical).
  width?: number
  height?: number
  grain: number
  vignette: number
  watermark?: { dataUri: string; opacity: number } | null // roaming channel logo overlay; null = none
  disclosure?: string // persistent synthetic-media/illustration label (EBN reels); undefined = none
  outputPath: string
  onProgress?: (progress: number) => void
}

let _bundleUrl: string | undefined
let _browserReady: Promise<unknown> | undefined

async function getBundleUrl(): Promise<string> {
  if (_bundleUrl) return _bundleUrl
  // Bundle once per process. The worker runs from source via tsx (no dist), so the entry is the .tsx.
  const entryPoint = join(__dirname, 'Root.tsx')
  _bundleUrl = await bundle({
    entryPoint,
    onProgress: () => {},
    ignoreRegisterRootWarning: true,
    // Our workspace packages are TS using NodeNext-style ".js" import specifiers; teach Remotion's
    // webpack to resolve a ".js" specifier to its ".ts"/".tsx" source (it doesn't by default).
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          ...(config.resolve?.extensionAlias ?? {}),
          '.js': ['.ts', '.tsx', '.js'],
          '.jsx': ['.tsx', '.jsx'],
        },
      },
    }),
  })
  return _bundleUrl
}

// A system Chrome can be forced via REMOTION_BROWSER_EXECUTABLE (locked-down networks); otherwise
// Remotion auto-downloads its pinned headless Chromium to its cache on first render (once/process).
const browserExecutable = process.env['REMOTION_BROWSER_EXECUTABLE'] || null
function ensureBrowserOnce(): Promise<unknown> {
  if (browserExecutable) return Promise.resolve()  // using a system Chrome — nothing to download
  if (!_browserReady) _browserReady = ensureBrowser()
  return _browserReady
}

async function toDataUri(filePath: string, mimeType: string): Promise<string> {
  const buf = await readFile(filePath)
  return `data:${mimeType};base64,${buf.toString('base64')}`
}

// OffthreadVideo routes its src through Remotion's proxy by URL-encoding it into a query string, so a
// multi-MB base64 video data URI overflows the URL length limit and the proxy fetch fails ("Failed to
// fetch …/proxy?src=data:video/mp4;base64,…"). Images-as-data-URIs are small enough to be fine, but
// video clips are not — so we serve the local clip files over an ephemeral loopback HTTP server and
// hand OffthreadVideo short http URLs. Range support is required (the renderer seeks with byte ranges).
interface FileServer { urlFor: (route: string) => string; close: () => Promise<void> }
function startFileServer(routes: Map<string, string>): Promise<FileServer> {
  const server = createServer((req, res) => {
    // Wrap the whole handler: a synchronous throw here (e.g. a bad Range → out-of-range createReadStream)
    // would otherwise be an uncaught exception that takes down the worker mid-render.
    try {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
      const fsPath = routes.get(path)
      if (!fsPath) { res.statusCode = 404; res.end(); return }
      let size: number
      try { size = statSync(fsPath).size } catch { res.statusCode = 404; res.end(); return }
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Accept-Ranges', 'bytes')

      const pipe = (opts?: { start: number; end: number }) => {
        const stream = opts ? createReadStream(fsPath, opts) : createReadStream(fsPath)
        // A mid-stream read error must not crash the process — tear the response down instead.
        stream.on('error', () => { res.destroy() })
        stream.pipe(res)
      }

      const range = req.headers.range
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
      if (m && (m[1] || m[2])) {
        let start: number
        let end: number
        if (m[1] === '') {
          // Suffix range: bytes=-N → the last N bytes.
          const n = parseInt(m[2]!, 10)
          start = Math.max(0, size - n)
          end = size - 1
        } else {
          start = parseInt(m[1]!, 10)
          end = m[2] ? parseInt(m[2], 10) : size - 1
        }
        end = Math.min(end, size - 1) // clamp to EOF so Content-Length never overstates the body
        if (!Number.isFinite(start) || start > end || start >= size) {
          // Unsatisfiable — do NOT construct createReadStream({start>end}) (it throws synchronously).
          res.statusCode = 416
          res.setHeader('Content-Range', `bytes */${size}`)
          res.end()
          return
        }
        res.statusCode = 206
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Content-Length', String(end - start + 1))
        pipe({ start, end })
      } else {
        res.statusCode = 200
        res.setHeader('Content-Length', String(size))
        pipe()
      }
    } catch {
      try { res.statusCode = 500; res.end() } catch { /* headers already flushed */ }
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({
        urlFor: (route) => `http://127.0.0.1:${port}${route}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
  })
}

export async function renderReelWithRemotion(input: RemotionRenderInput): Promise<void> {
  const fps = 30
  const totalFrames = Math.ceil((input.durationMs / 1000) * fps)

  // Videos are served over a loopback HTTP server (OffthreadVideo can't take a big data URI — see
  // startFileServer). Images are small enough to inline as data URIs.
  const videoRoutes = new Map<string, string>()
  for (const s of input.scenes) {
    if (s.videoPath) videoRoutes.set(`/scene_${s.idx}.mp4`, s.videoPath)
  }
  const fileServer = await startFileServer(videoRoutes)

  // Everything from here that can throw (image data-URI reads, bundling, browser download, render) must be
  // inside the try — otherwise a failure before renderMedia would leak the loopback server + its port.
  try {
  const scenes: ReelScene[] = await Promise.all(
    input.scenes.map(async (s) => {
      const imageSrc = await toDataUri(s.imagePath, 'image/webp')
      const videoSrc = s.videoPath ? fileServer.urlFor(`/scene_${s.idx}.mp4`) : null
      const startFrame = Math.round((s.startMs / 1000) * fps)
      const endFrame = Math.round((s.endMs / 1000) * fps)
      return {
        idx: s.idx,
        imageSrc,
        videoSrc,
        tier: s.tier,
        startFrame,
        durationFrames: Math.max(1, endFrame - startFrame),
        mood: s.mood,
        onScreenText: s.onScreenText ?? null,
        effects: s.effects ?? [],
        cameraMove: s.cameraMove ?? null,
        videoDurationSec: s.videoDurationSec ?? null,
      }
    }),
  )

  const props: ReelCompositionProps = {
    scenes,
    subtitles: input.subtitles,
    captionStyle: input.captionStyle,
    captionSafeZonePct: input.captionSafeZonePct,
    grain: input.grain,
    vignette: input.vignette,
    watermark: input.watermark ?? null,
    ...(input.disclosure ? { disclosure: input.disclosure } : {}),
  }

  const bundleUrl = await getBundleUrl()
  await ensureBrowserOnce()

    const composition = await selectComposition({
      serveUrl: bundleUrl,
      id: 'Reel',
      inputProps: props,
      ...(browserExecutable ? { browserExecutable } : {}),
    })

    await renderMedia({
      // Frame + duration are per-render (the composition registers defaults): duration from the mix,
      // width/height from the channel's platform preset (16:9 long-form vs 9:16 reels). Every overlay
      // reads useVideoConfig(), so the composition adapts to whatever is set here.
      composition: {
        ...composition,
        durationInFrames: totalFrames,
        width: input.width ?? composition.width,
        height: input.height ?? composition.height,
      },
      serveUrl: bundleUrl,
      codec: 'h264',
      outputLocation: input.outputPath,
      inputProps: props,
      onProgress: ({ progress }) => input.onProgress?.(progress),
      chromiumOptions: { disableWebSecurity: true },  // allow data URIs
      ...(browserExecutable ? { browserExecutable } : {}),
      muted: true,  // visual only — audio is muxed in separately
      // Frames render in parallel Chromium tabs; 2 was leaving most of the CPU idle (~8fps on an 8-core
      // machine → ~10min for a 3-minute reel). cores/2 is Remotion's own default and roughly halves the
      // wall time; stays conservative so the dev box (web + worker + Postgres) isn't starved.
      concurrency: Math.max(2, Math.floor(cpus().length / 2)),
    })
  } finally {
    await fileServer.close()  // release the loopback port whether the render succeeds or throws
  }
}

// Post thumbnail — one still of the Thumbnail composition (hero frame + composited title, 1280×720).
// Reuses the process-level bundle + browser; a data-URI image needs no file server.
export async function renderThumbnailStill(input: {
  imagePath: string // local hero frame (webp from the image step)
  title: string
  outputPath: string // .jpeg
}): Promise<void> {
  const imageSrc = await toDataUri(input.imagePath, 'image/webp')
  const props = { imageSrc, title: input.title }

  const bundleUrl = await getBundleUrl()
  await ensureBrowserOnce()

  const composition = await selectComposition({
    serveUrl: bundleUrl,
    id: 'Thumbnail',
    inputProps: props,
    ...(browserExecutable ? { browserExecutable } : {}),
  })

  await renderStill({
    composition,
    serveUrl: bundleUrl,
    output: input.outputPath,
    inputProps: props,
    imageFormat: 'jpeg',
    jpegQuality: 90,
    chromiumOptions: { disableWebSecurity: true }, // allow data URIs
    ...(browserExecutable ? { browserExecutable } : {}),
  })
}

