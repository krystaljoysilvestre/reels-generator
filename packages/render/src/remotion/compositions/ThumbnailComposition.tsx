import React from 'react'
import { AbsoluteFill, useVideoConfig } from 'remotion'

// Post cover — the hero frame with a short overlay burned on. A static single-frame composition
// rendered via renderStill, at the CHANNEL'S OWN ASPECT (see "Aspect" below).
//
// WHY THIS WAS REBUILT (publish-bar audit, 2026-08-10). The founder named thumbnails as a reason no reel
// had ever been published. The old version composited the ENTIRE video title at 64–92px in system-ui over
// a bottom scrim — a caption, not a cover. Three things were wrong and only one was styling:
//   1. CONCEPT: the text was the title. Creators put 3–5 huge words on the image and let the title say
//      something else. Fixed upstream — `thumbnailText` in post-meta; this reads the overlay.
//   2. SCALE: 64–92px on a 720px-tall frame is a tenth of the height. A cover is judged as a ~168px feed
//      rectangle, where that type is unreadable.
//   3. THE FRAME ITSELF, and the worst of the three. See "Aspect".
//
// THIS IS ONE TREATMENT, NOT A SET OF OPTIONS. Four candidate treatments (banner / block / edge / clean)
// were rendered against the founder's own hero frames — 28 candidates, and the founder marked `edge` at
// every fitting on every vertical channel. The other three were DELETED rather than kept behind a prop:
// leaving them in would be shipping the indecision as configuration.
//
// The treatment: heavy uppercase sans stacked hard against the left edge under a short accent rule, over a
// scrim that buys the type its contrast, with the frame's own subject left visible. That vocabulary is what
// the founder approved and it is held constant across both aspects; only the LAYOUT differs, because a
// 9:16 canvas has no side field to put type in.

// Default registration size (16:9). Actual dimensions are overridden per render — see renderThumbnailStill.
export const THUMB_WIDTH = 1280
export const THUMB_HEIGHT = 720

// Reference widths the tuned constants below were designed against. Everything scales off these, so the
// 16:9 cover at 1280 wide renders EXACTLY as the founder approved it (scale factor 1.0) while any other
// resolution stays proportional instead of drifting.
const REF_WIDE = 1280
const REF_TALL = 1080

// A type alias (not an interface) so it satisfies Remotion's Record<string, unknown> constraint.
export type ThumbnailCompositionProps = {
  imageSrc: string // data URI of the hero frame
  title: string // the overlay words (post-meta.thumbnailText, falling back to the title)
  accent?: string // channel accent (captionStyle.highlightColor) — the rule above the type
}

// ── Aspect ───────────────────────────────────────────────────────────────────────────────────────────
// THE COVER IS RENDERED AT THE CHANNEL'S OWN ASPECT. This is the platform's documented spec, not a taste
// call: YouTube gives 9:16 (2160×3840) for Shorts thumbnails and 16:9 for long-form
// (support.google.com/youtube/answer/72431). TikTok and Instagram covers are vertical too, and Kendrix has
// no programmatic publisher for either — their cover is set by hand from the export zip, so the zip's cover
// needs to be the right shape.
//
// WHAT THIS REPLACED, because the failure is instructive. The cover was hard-coded 1280×720 for every
// channel. A vertical reel's 768×1344 hero frame was therefore either centre-cropped into 16:9 — keeping
// 32% of its height and routinely discarding the subject (Emberlight's child stands in the upper 6%) — or,
// after the first fix, letterboxed uncropped against the right edge over a blurred blow-up of itself. That
// second version was measured on real output and it wastes TWO THIRDS of the canvas on a dark smear: the
// actual picture survives only as a narrow strip, which is the visual signature of reposted content.
//
// Rendering at the source's own aspect dissolves the problem rather than treating it. A 768×1344 frame
// (0.571) into a 1080×1920 canvas (0.5625) crops ~1.6% of the WIDTH — versus 68% of the height before — so
// `objectFit: cover` is now safe and no subject-locating vision call is needed to make it safe. The earlier
// finding that "a fixed crop anchor is a coin flip" was true of a 16:9 target and is simply moot here.
function Backdrop({ src }: { src: string }) {
  return (
    <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  )
}

// Scale from the WORD COUNT, not the character count. A cover overlay is 1–5 words; what makes it
// unreadable at feed size is fitting too many words across, not a couple of long ones.
function scaleFor(text: string, base: number): number {
  const words = text.trim().split(/\s+/).length
  if (words <= 2) return base
  if (words <= 4) return Math.round(base * 0.78)
  if (words <= 6) return Math.round(base * 0.6)
  return Math.round(base * 0.46)
}

const SANS = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'

export const ThumbnailComposition: React.FC<ThumbnailCompositionProps> = ({
  imageSrc,
  title,
  accent = '#ffd400',
}) => {
  const { width, height } = useVideoConfig()
  const text = title.trim()
  const tall = height > width
  const s = width / (tall ? REF_TALL : REF_WIDE)

  // 16:9 keeps `edge` exactly: type in a left column, image breathing on the right, left-to-right falloff.
  // 9:16 has no side field, so the type moves to the lower area over a bottom-up scrim — the same
  // vocabulary, and it still honours `edge`'s actual rationale of not covering the frame's subject, since
  // vertical compositions put their subject high (both real hero frames do).
  const pad = Math.round((tall ? 64 : 56) * s)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Backdrop src={imageSrc} />
      <AbsoluteFill
        style={{
          background: tall
            ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 26%, rgba(0,0,0,0.28) 48%, rgba(0,0,0,0) 64%)'
            : 'linear-gradient(to right, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0) 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: pad,
          // Anchored above the bottom edge rather than on it. Vertical covers get cropped toward square in
          // the YouTube channel grid and sit under platform UI in the TikTok/Reels feeds, so type flush to
          // the bottom is the part most likely to be cut.
          ...(tall
            ? { bottom: Math.round(height * 0.14), right: pad }
            : { top: 0, bottom: 0, width: '56%', justifyContent: 'center' }),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ width: Math.round(96 * s), height: Math.round(10 * s), background: accent, marginBottom: Math.round(26 * s) }} />
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            // Vertical gets the full width instead of a 56% column, so it carries slightly smaller type and
            // still reads larger on screen.
            fontSize: Math.round(scaleFor(text, tall ? 124 : 132) * s),
            lineHeight: 1.0,
            letterSpacing: '-0.03em',
            color: '#fff',
            textShadow: '0 2px 24px rgba(0,0,0,0.75)',
            textWrap: 'balance',
            // Uppercased by the TREATMENT, not by the writer. Two reasons, and neither is a style opinion:
            // the candidates the founder judged were rendered uppercase, so honouring their pick means
            // rendering what they actually saw; and the model's own casing is inconsistent run to run
            // ("1 MILLION BTC" next to "Unweaving the Sling"), which would show up as a ragged grid across
            // a channel's covers. Casing is a property of the house treatment.
            textTransform: 'uppercase',
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  )
}
