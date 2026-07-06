import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface SilenceInsertion {
  atMsOriginal: number // split point in the ORIGINAL audio timeline
  durationMs: number   // length of silence to splice in there
}

// Splice silence into an audio file at the given original-time points, producing a new file. The input is
// cut into segments at each point (atrim) and the pieces are concatenated with silence between them —
// [seg0][sil0][seg1][sil1]…[segN] — in a single ffmpeg pass (sample-accurate, no intermediate files).
// Used to add dramatic narration pauses without re-synthesizing the voiceover. Every segment + silence is
// coerced to one uniform format so the concat filter accepts them (mono voiceovers upmix to stereo).
export async function insertSilences(
  inputPath: string,
  outputPath: string,
  insertions: SilenceInsertion[],
): Promise<void> {
  if (insertions.length === 0) throw new Error('insertSilences: no insertions given')

  const pts = [...insertions].sort((a, b) => a.atMsOriginal - b.atMsOriginal)
  const sec = (ms: number): string => (ms / 1000).toFixed(3)
  const FMT = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'

  const defs: string[] = []
  const order: string[] = []
  for (let i = 0; i <= pts.length; i++) {
    const start = i === 0 ? 0 : pts[i - 1]!.atMsOriginal
    const endClause = i < pts.length ? `:end=${sec(pts[i]!.atMsOriginal)}` : ''
    defs.push(`[0:a]atrim=start=${sec(start)}${endClause},asetpts=N/SR/TB,${FMT}[a${i}]`)
    order.push(`[a${i}]`)
    if (i < pts.length) {
      defs.push(`anullsrc=r=44100:cl=stereo,atrim=start=0:end=${sec(pts[i]!.durationMs)},${FMT}[s${i}]`)
      order.push(`[s${i}]`)
    }
  }

  const graph = `${defs.join(';')};${order.join('')}concat=n=${order.length}:v=0:a=1[out]`

  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', inputPath, '-filter_complex', graph, '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '2', outputPath],
    { maxBuffer: 1024 * 1024 * 64 },
  )
}
