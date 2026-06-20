import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { CAPTION_PRESETS } from '@reels/core'
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
          captionStyle: CAPTION_PRESETS.clean,
          captionSafeZonePct: 18,
          grain: 0.15,
          vignette: 0.25,
        } satisfies ReelCompositionProps}
      />
    </>
  )
}

// This file is the bundler entry point, so it must register the root (Remotion requirement).
registerRoot(RemotionRoot)
