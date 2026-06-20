// Server-side Remotion render — produces visual-only MP4 (no audio).
// Audio is muxed in by FFmpeg afterwards.
//
// Remotion license: free for individuals + companies under $1M revenue.
// Re-evaluate at M7 (SaaS go decision). [H6]

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaptionStyle, ReelCompositionProps, ReelScene, SubtitleChunk } from './types.js'

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
  }>
  subtitles: SubtitleChunk[]
  captionStyle: CaptionStyle
  captionSafeZonePct: number
  durationMs: number
  grain: number
  vignette: number
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

export async function renderReelWithRemotion(input: RemotionRenderInput): Promise<void> {
  const fps = 30
  const totalFrames = Math.ceil((input.durationMs / 1000) * fps)

  // Convert local file paths to data URIs (Remotion can't access arbitrary file system paths in browser context)
  const scenes: ReelScene[] = await Promise.all(
    input.scenes.map(async (s) => {
      const imageSrc = await toDataUri(s.imagePath, 'image/webp')
      const videoSrc = s.videoPath ? await toDataUri(s.videoPath, 'video/mp4') : null
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
    composition: { ...composition, durationInFrames: totalFrames },
    serveUrl: bundleUrl,
    codec: 'h264',
    outputLocation: input.outputPath,
    inputProps: props,
    onProgress: ({ progress }) => input.onProgress?.(progress),
    chromiumOptions: { disableWebSecurity: true },  // allow data URIs
    ...(browserExecutable ? { browserExecutable } : {}),
    muted: true,  // visual only — audio is muxed in separately
    concurrency: 2,
  })
}
