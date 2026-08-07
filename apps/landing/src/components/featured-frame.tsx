/**
 * The Director's Monitor — "The cut · live direction".
 *
 * The hero answers "can this make beautiful videos?". This section answers the next question:
 * "would I trust this to direct my story?" — so it shows how Kendrix thinks, not what it makes.
 *
 * Not a video player: a still per scene with cinematic CSS motion only (scale/opacity/gradient),
 * because a second <video> below the hero costs Lighthouse and repeats the hero's job.
 *
 * The overlays are DIRECTION, not configuration — every line is an instruction a person could act
 * on. If one ever reads like a settings panel, it's a bug; the writing guide is above SCENES in
 * directors-monitor.tsx. Deliberately absent and to stay that way: tokens, prompts, "thinking"
 * traces, processing bars, percentages, model names, inference speeds. This is a studio, not an
 * AI dashboard.
 *
 * PROVENANCE: the six stills are marketing assets generated with the same engines the product runs
 * (flux via fal.ai) — NOT product-pipeline output, and the direction copy is illustrative. Don't
 * relabel either as pipeline output (see channels.tsx).
 */
import { DirectorsMonitor } from './directors-monitor'

export function FeaturedFrame() {
  return (
    <section
      id="feature"
      className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-[30px] pt-20 sm:px-8"
    >
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="eyebrow">The cut · live direction</div>
          <h2 className="mt-3 text-[32px] font-800 tracking-[-0.03em] sm:text-[40px]">
            Every frame is intentionally directed.
          </h2>
        </div>
        <p className="max-w-[340px] text-[15px] leading-[1.6] text-night-muted">
          Preview every scene exactly as it will publish&mdash;from visuals and captions to camera
          movement, voice, music and sound effects.
        </p>
      </div>

      <DirectorsMonitor />
    </section>
  )
}
