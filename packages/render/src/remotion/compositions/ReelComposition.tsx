import React from 'react'
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'
import { SceneClip } from '../components/SceneClip.js'
import { SubtitleOverlay } from '../components/SubtitleOverlay.js'
import { GradeOverlay } from '../components/GradeOverlay.js'
import type { ReelCompositionProps } from '../types.js'

export type { ReelCompositionProps } from '../types.js'
export type { ReelScene, SubtitleChunk } from '../types.js'

// 1080×1920 @ 30fps — constants set by the Composition registration in Root.tsx
export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
export const REEL_FPS = 30

export const ReelComposition: React.FC<ReelCompositionProps> = ({
  scenes,
  subtitles,
  captionStyle,
  captionSafeZonePct,
  grain,
  vignette,
}) => {
  const { width, height } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', width, height }}>
      {/* Scene clips — each in its own Sequence so Remotion handles the timeline */}
      {scenes.map((scene) => (
        <Sequence
          key={scene.idx}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <AbsoluteFill>
            <SceneClip
              imageSrc={scene.imageSrc}
              videoSrc={scene.videoSrc}
              tier={scene.tier}
              durationFrames={scene.durationFrames}
              idx={scene.idx}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Grade overlays — always on top of all scenes */}
      <GradeOverlay grain={grain} vignette={vignette} />

      {/* Burned-in subtitles — always on top */}
      <SubtitleOverlay subtitles={subtitles} captionStyle={captionStyle} safeZonePct={captionSafeZonePct} />
    </AbsoluteFill>
  )
}
