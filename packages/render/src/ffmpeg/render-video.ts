// FFmpeg-based video render — used until Remotion is wired [H6 note: verify license first]
// Produces the final 1080×1920 9:16 reel from scenes + mix audio.
// Ken Burns effect per still, channel LUT + grain + vignette applied.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { Timings, LutConfig } from '@reels/core'

const execFileAsync = promisify(execFile)

export interface SceneInput {
  idx: number
  imagePath: string
  videoPath: string | null   // null for still scenes
  startMs: number
  endMs: number
  tier: 'still' | 'video'
}

export interface SubtitleInput {
  text: string
  startMs: number
  endMs: number
}

export interface RenderVideoParams {
  scenes: SceneInput[]
  subtitles: SubtitleInput[]
  mixAudioPath: string
  outputPath: string
  lutConfig: LutConfig
  tmpDir: string
  subtitleFontPath?: string  // path to a bundled font file; falls back to system font
}

// Target: 1080×1920 9:16 @ 30fps, -14 LUFS baked audio
const WIDTH = 1080
const HEIGHT = 1920
const FPS = 30

export async function renderVideo(params: RenderVideoParams): Promise<void> {
  // ── Step 1: Build per-scene video clips with Ken Burns on stills ─────────
  const scenePaths: string[] = []

  for (const scene of params.scenes) {
    const outPath = join(params.tmpDir, `scene_${scene.idx}.mp4`)
    const durationSec = (scene.endMs - scene.startMs) / 1000

    if (scene.tier === 'video' && scene.videoPath !== null) {
      // Clip the video segment + strip audio + scale to 9:16
      await execFileAsync('ffmpeg', [
        '-i', scene.videoPath,
        '-t', String(durationSec),
        '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS}`,
        '-an',            // strip model audio
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-y', outPath,
      ])
    } else {
      // Ken Burns effect: slow zoom on still image
      const zoom = 'zoompan=z=\'min(zoom+0.001,1.05)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\''
      await execFileAsync('ffmpeg', [
        '-loop', '1', '-i', scene.imagePath,
        '-t', String(durationSec),
        '-vf', [
          `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
          `crop=${WIDTH}:${HEIGHT}`,
          zoom,
          `fps=${FPS}`,
        ].join(','),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-y', outPath,
      ])
    }
    scenePaths.push(outPath)
  }

  // ── Step 2: Concatenate all scene clips ──────────────────────────────────
  const concatListPath = join(params.tmpDir, 'concat.txt')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(concatListPath, scenePaths.map((p) => `file '${p}'`).join('\n'))

  const rawVideoPath = join(params.tmpDir, 'raw_video.mp4')
  await execFileAsync('ffmpeg', [
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-c:v', 'copy',
    '-y', rawVideoPath,
  ])

  // ── Step 3: Subtitles (burned-in, non-optional — most reels watched muted) ─
  const assPath = join(params.tmpDir, 'subs.ass')
  await writeFile(assPath, buildAssSubtitles(params.subtitles, params.subtitleFontPath))

  const subbedPath = join(params.tmpDir, 'subbed.mp4')
  await execFileAsync('ffmpeg', [
    '-i', rawVideoPath,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-y', subbedPath,
  ])

  // ── Step 4: Channel LUT + grain + vignette ───────────────────────────────
  const gradeFilters: string[] = []
  if (params.lutConfig.lutPath) {
    gradeFilters.push(`lut3d=${params.lutConfig.lutPath}`)
  }
  if (params.lutConfig.grain > 0) {
    gradeFilters.push(`noise=alls=${Math.round(params.lutConfig.grain * 50)}:allf=t+u`)
  }
  if (params.lutConfig.vignette > 0) {
    gradeFilters.push(`vignette=PI/4`)  // simplified vignette
  }

  const gradedPath = gradeFilters.length > 0
    ? join(params.tmpDir, 'graded.mp4')
    : subbedPath

  if (gradeFilters.length > 0) {
    await execFileAsync('ffmpeg', [
      '-i', subbedPath,
      '-vf', gradeFilters.join(','),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-y', gradedPath,
    ])
  }

  // ── Step 5: Mux video + audio → final output ─────────────────────────────
  await execFileAsync('ffmpeg', [
    '-i', gradedPath,
    '-i', params.mixAudioPath,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    '-y', params.outputPath,
  ])
}

// Build an ASS subtitle file from subtitle chunks
function buildAssSubtitles(subtitles: SubtitleInput[], fontPath?: string): string {
  const toAssTime = (ms: number) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const cs = Math.floor((ms % 1000) / 10)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // White text, black outline, centered bottom
    `Style: Default,${fontPath ? fontPath : 'Arial'},72,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,80,80,120,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n')

  const events = subtitles
    .map(
      (s) =>
        `Dialogue: 0,${toAssTime(s.startMs)},${toAssTime(s.endMs)},Default,,0,0,0,,${s.text}`,
    )
    .join('\n')

  return header + '\n' + events
}
