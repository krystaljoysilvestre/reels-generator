// Remotion v4 — license: free for individuals + companies <$1M revenue. Re-evaluate at M7 SaaS launch [H6].
import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, Img, OffthreadVideo } from 'remotion'
import { clipPlaybackRate, freezePushFrames } from '@reels/core/timings'

export interface SceneClipProps {
  imageSrc: string                   // data URI or URL
  videoSrc: string | null            // null for stills
  tier: 'still' | 'video'
  durationFrames: number
  idx: number                        // scene index → fallback Ken Burns variant when no camera move is set
  cameraMove?: string | null         // director's camera move → still Ken Burns motion
  videoDurationSec?: number | null   // native i2v clip length → stretch to fill a longer scene span
}

// A Ken Burns move: start/end zoom + horizontal/vertical drift (% of overflow). Tuned subtle — these read
// as a slow cinematic camera, not a zoom effect.
interface KenBurns { from: number; to: number; panX: number; panY: number }

// The director's camera move → Ken Burns motion, so a still honours the SAME beat intent the breakdown
// chose (push_in for emphasis, pull_out for a reveal, locked for stillness, …). Keys match motion.ts
// CAMERA_MOVES. A move not listed here (or empty/Auto) falls back to the idx-cycled variant below.
const MOVE_TO_KEN_BURNS: Record<string, KenBurns> = {
  push_in: { from: 1.0, to: 1.12, panX: 0, panY: 0 },
  pull_out: { from: 1.12, to: 1.0, panX: 0, panY: 0 },
  pan_left: { from: 1.08, to: 1.08, panX: 3, panY: 0 },   // frame drifts left
  pan_right: { from: 1.08, to: 1.08, panX: -3, panY: 0 }, // frame drifts right
  tilt_up: { from: 1.08, to: 1.08, panX: 0, panY: 3 },    // frame drifts up
  tilt_down: { from: 1.08, to: 1.08, panX: 0, panY: -3 }, // frame drifts down
  drift: { from: 1.0, to: 1.05, panX: 1.5, panY: 0 },     // slow, subtle
  handheld: { from: 1.0, to: 1.04, panX: 0, panY: 0 },    // minimal (shake effect carries the rest)
  locked: { from: 1.0, to: 1.015, panX: 0, panY: 0 },     // almost still — a hair of life so it isn't frozen
}

// Fallback when the scene has no camera move (Auto): cycle by index so motion isn't an identical zoom.
const KEN_BURNS_FALLBACK: KenBurns[] = [
  { from: 1.0, to: 1.08, panX: 0, panY: 0 },   // slow zoom in
  { from: 1.08, to: 1.0, panX: 0, panY: 0 },   // slow zoom out
  { from: 1.05, to: 1.1, panX: 2, panY: 0 },   // zoom in, drift right
  { from: 1.05, to: 1.1, panX: -2, panY: 0 },  // zoom in, drift left
]

export const SceneClip: React.FC<SceneClipProps> = ({ imageSrc, videoSrc, tier, durationFrames, idx, cameraMove, videoDurationSec }) => {
  const frame = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()

  if (tier === 'video' && videoSrc) {
    // The clip is a fixed 5s/10s; the scene may run longer (its narration span). Slow playback to fill the
    // gap so the shot never freezes on its last frame mid-line — clamped to [0.5, 1] so we neither speed it
    // up (which would drop content) nor slow it to an unnatural crawl. If the scene is >2× the clip (rare),
    // the tail freezes, which is still better than a hard stop.
    const sceneSec = durationFrames / fps
    const clipSec = videoDurationSec ?? sceneSec
    // Shared with the mixer's foley placement (packages/core clip-playback) so sync never drifts.
    const playbackRate = clipPlaybackRate(clipSec, sceneSec)
    // Once the (slowed) clip runs out, OffthreadVideo holds its last frame. That's tolerable mid-reel but
    // not on the FINAL scene, whose held outro beat (compute-timings §4.65) would land on a dead freeze —
    // the opposite of "the visuals keep going". So keep a slow push alive across the frozen tail. The range
    // is computed by a shared pure helper that returns null when the clip fills the scene: a zero-width
    // interpolate range throws in Remotion and failed a real render.
    const push = freezePushFrames(clipSec, durationFrames / fps, fps)
    const freezeScale = push
      ? interpolate(frame, [push.from, push.to], [1, 1.06], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1
    return (
      <div style={{ width, height, overflow: 'hidden' }}>
        <OffthreadVideo
          src={videoSrc}
          playbackRate={playbackRate}
          style={{
            width,
            height,
            objectFit: 'cover',
            transform: `scale(${freezeScale})`,
            transformOrigin: 'center center',
          }}
          muted  // model audio is always stripped — our mix is the audio track
        />
      </div>
    )
  }

  // Still: Ken Burns driven by the director's camera move, falling back to the idx-cycled variant.
  const v = (cameraMove && MOVE_TO_KEN_BURNS[cameraMove]) || KEN_BURNS_FALLBACK[idx % KEN_BURNS_FALLBACK.length]!
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const }
  const scale = interpolate(frame, [0, durationFrames], [v.from, v.to], clamp)
  const panX = v.panX ? interpolate(frame, [0, durationFrames], [-v.panX, v.panX], clamp) : 0
  const panY = v.panY ? interpolate(frame, [0, durationFrames], [-v.panY, v.panY], clamp) : 0

  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <Img
        src={imageSrc}
        style={{
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
          objectFit: 'cover',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${panX}%), calc(-50% + ${panY}%))`,
        }}
      />
    </div>
  )
}
