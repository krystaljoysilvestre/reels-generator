import React from 'react'
import { Composition } from 'remotion'
import { ReelComposition, REEL_WIDTH, REEL_HEIGHT, REEL_FPS, type ReelCompositionProps } from './compositions/ReelComposition.js'

// Remotion root — registers compositions. This file is the entry point for the bundler.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Reel"
        component={ReelComposition}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
        // durationInFrames is calculated at render time from actual reel duration
        durationInFrames={30 * 90}   // 90s default; overridden per render
        defaultProps={{
          scenes: [],
          subtitles: [],
          grain: 0.15,
          vignette: 0.25,
        } satisfies ReelCompositionProps}
      />
    </>
  )
}
