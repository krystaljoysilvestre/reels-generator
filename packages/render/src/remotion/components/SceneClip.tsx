// Remotion v4 — license: free for individuals + companies <$1M revenue. Re-evaluate at M7 SaaS launch [H6].
import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, Img, OffthreadVideo } from 'remotion'

export interface SceneClipProps {
  imageSrc: string                   // data URI or URL
  videoSrc: string | null            // null for stills
  tier: 'still' | 'video'
  durationFrames: number
  idx: number                        // scene index → picks a Ken Burns variant (varied motion)
}

// Ken Burns variants, cycled by scene index so motion isn't an identical zoom every scene: alternate
// zoom in/out + an occasional slow horizontal drift. `pan` is % of the overflow to drift across.
const KEN_BURNS_VARIANTS: Array<{ from: number; to: number; pan: number }> = [
  { from: 1.0, to: 1.08, pan: 0 },   // slow zoom in
  { from: 1.08, to: 1.0, pan: 0 },   // slow zoom out
  { from: 1.05, to: 1.1, pan: 2 },   // zoom in, drift right
  { from: 1.05, to: 1.1, pan: -2 },  // zoom in, drift left
]

export const SceneClip: React.FC<SceneClipProps> = ({ imageSrc, videoSrc, tier, durationFrames, idx }) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()

  if (tier === 'video' && videoSrc) {
    return (
      <OffthreadVideo
        src={videoSrc}
        style={{ width, height, objectFit: 'cover' }}
        muted  // model audio is always stripped — our mix is the audio track
      />
    )
  }

  // Still: Ken Burns — variant chosen by scene index (varied zoom direction + occasional drift)
  const v = KEN_BURNS_VARIANTS[idx % KEN_BURNS_VARIANTS.length]!
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const }
  const scale = interpolate(frame, [0, durationFrames], [v.from, v.to], clamp)
  const panX = v.pan ? interpolate(frame, [0, durationFrames], [-v.pan, v.pan], clamp) : 0

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
          transform: `translate(calc(-50% + ${panX}%), -50%)`,
        }}
      />
    </div>
  )
}
