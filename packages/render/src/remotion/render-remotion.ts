// Server-side Remotion render — produces visual-only MP4 (no audio).
// Audio is muxed in by FFmpeg afterwards.
//
// Remotion license: free for individuals + companies under $1M revenue.
// Re-evaluate at M7 (SaaS go decision). [H6]

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReelCompositionProps, ReelScene, SubtitleChunk } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface RemotionRenderInput {
  scenes: Array<{
    idx: number
    imagePath: string         // local file path
    videoPath: string | null  // local file path, null for stills
    tier: 'still' | 'video'
    startMs: number
    endMs: number
  }>
  subtitles: SubtitleChunk[]
  durationMs: number
  grain: number
  vignette: number
  outputPath: string
  onProgress?: (progress: number) => void
}

let _bundleUrl: string | undefined

async function getBundleUrl(): Promise<string> {
  if (_bundleUrl) return _bundleUrl
  // Bundle once per process, cache the result
  const entryPoint = join(__dirname, 'Root.js')  // compiled JS output
  _bundleUrl = await bundle({ entryPoint, onProgress: () => {} })
  return _bundleUrl
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
      }
    }),
  )

  const props: ReelCompositionProps = {
    scenes,
    subtitles: input.subtitles,
    grain: input.grain,
    vignette: input.vignette,
  }

  const bundleUrl = await getBundleUrl()

  const composition = await selectComposition({
    serveUrl: bundleUrl,
    id: 'Reel',
    inputProps: props,
  })

  await renderMedia({
    composition: { ...composition, durationInFrames: totalFrames },
    serveUrl: bundleUrl,
    codec: 'h264',
    outputLocation: input.outputPath,
    inputProps: props,
    onProgress: ({ progress }) => input.onProgress?.(progress),
    chromiumOptions: { disableWebSecurity: true },  // allow data URIs
    muted: true,  // visual only — audio is muxed in separately
    concurrency: 2,
  })
}
