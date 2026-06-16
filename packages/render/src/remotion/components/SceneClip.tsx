// Remotion v4 — license: free for individuals + companies <$1M revenue. Re-evaluate at M7 SaaS launch [H6].
import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, Img, OffthreadVideo } from 'remotion'

export interface SceneClipProps {
  imageSrc: string                   // data URI or URL
  videoSrc: string | null            // null for stills
  tier: 'still' | 'video'
  durationFrames: number
}

// Ken Burns: slow zoom-in toward center. Scale 1.0 → 1.05 over the scene duration.
const KEN_BURNS_SCALE_END = 1.05

export const SceneClip: React.FC<SceneClipProps> = ({ imageSrc, videoSrc, tier, durationFrames }) => {
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

  // Still: Ken Burns zoom
  const scale = interpolate(frame, [0, durationFrames], [1, KEN_BURNS_SCALE_END], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

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
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
