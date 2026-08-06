// Where the trailer's pieces live. Every script in this folder imports from here — the first
// re-shoot found each one hard-coding a session scratchpad that no longer existed, which made a
// committed, documented pipeline unrunnable.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
export const SRC = `${REPO}/assets/trailer-src` // gitignored: large binaries + the minted cookie

export const STILLS = `${SRC}/stills` // the 8 beat stills + the 3 style alternates (paid)
export const CLIPS = `${SRC}/clips` // the 8 Kling clips (paid), the montage, the finale
export const UI = `${SRC}/ui` // app captures + overlays: free to re-shoot, stale after a redesign
export const AUDIO = `${SRC}/audio` // t*.mp3 raw VO, s*.mp3 tempo-corrected, bed, heartbeat
export const OUT = `${SRC}/out` // masters, web cuts, poster, and the real pipeline reel
export const WORK = `${SRC}/work` // ffmpeg intermediates; safe to delete

export const REEL_SOURCE = `${OUT}/whatif-reel.mp4` // the real pipeline reel the finale pays off on

export const ensureDirs = () => {
  for (const d of [STILLS, CLIPS, UI, AUDIO, OUT, WORK]) mkdirSync(d, { recursive: true })
}
