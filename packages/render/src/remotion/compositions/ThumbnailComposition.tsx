import React from 'react'
import { AbsoluteFill } from 'remotion'

// Post thumbnail — the hero frame with a short overlay burned on (YouTube packaging, 1280×720).
// A static single-frame composition rendered via renderStill.
//
// WHY THIS WAS REBUILT (publish-bar audit, 2026-08-10). The founder named thumbnails as a reason no reel
// had ever been published. The old version composited the ENTIRE video title at 64–92px in system-ui over
// a bottom scrim — a caption, not a thumbnail. Three things were wrong and only one was styling:
//   1. CONCEPT: the text was the title. Creators put 3–5 huge words on the image and let the title say
//      something else. Fixed upstream — `thumbnailText` in post-meta; this reads the overlay.
//   2. SCALE: 64–92px on a 720px-tall frame is a tenth of the height. A thumbnail is judged as a ~168px
//      feed rectangle, where that type is unreadable.
//   3. THE FRAME ITSELF, and the worst of the three. See "Fitting" below.
//
// THIS IS ONE TREATMENT, NOT A SET OF OPTIONS. Four candidate treatments (banner / block / edge / clean)
// were rendered against the founder's own hero frames across both fittings — 28 candidates, and the
// founder marked `edge` at every fitting on every vertical channel. The other three were DELETED rather
// than kept behind a prop: leaving them in would be shipping the indecision as configuration.
//
// The treatment: type stacked hard against the left edge under a short accent rule, image breathing on
// the right. The editorial/documentary register — it keeps the frame's own subject visible instead of
// covering it, which is exactly why it survived a painterly folklore frame and a photographic space
// frame with the same set of rules.

export const THUMB_WIDTH = 1280
export const THUMB_HEIGHT = 720

// A type alias (not an interface) so it satisfies Remotion's Record<string, unknown> constraint.
export type ThumbnailCompositionProps = {
  imageSrc: string // data URI of the hero frame
  title: string // the overlay words (post-meta.thumbnailText, falling back to the title)
  accent?: string // channel accent (captionStyle.highlightColor) — the rule above the type
  sourceVertical?: boolean // is the hero frame portrait? drives the fitting; see below
}

// ── Fitting ──────────────────────────────────────────────────────────────────────────────────────────
// A vertical reel's hero frame is 768×1344. Fitting it with `objectFit: cover` into 16:9 keeps 32% of the
// height, centred — and vertical composition does not put its subject in the middle. Emberlight's hero is
// a child standing atop a glowing ladder in the upper 6% of the frame; the shipped thumbnail discarded
// them and kept three anonymous rungs on beige. No type treatment recovers from that.
//
// Also measured and REJECTED: biasing the same crop upward (anchor 18%). The child sits at 6%, so it
// still cut their head off. A fixed anchor is a coin flip — only locating the actual subject would fix
// cropping, which needs a vision call and is worth building only if this fitting proves insufficient.
//
// So a portrait source is never cropped. It sits uncropped and full-height against the RIGHT edge, over a
// blurred blow-up of itself, with the type in the field it leaves on the left. That the panel goes right
// rather than centre is what makes it one designed treatment instead of two independent knobs: a centred
// panel leaves a second, empty blurred wing on the right with nothing in it, and a pale frame blurs to
// featureless mush. Anchoring right gives the type a clean field and leaves exactly one wing.
//
// A 16:9 source loses nothing to a 16:9 crop, so it stays full-bleed.
function Backdrop({ src, vertical }: { src: string; vertical: boolean }) {
  if (!vertical) {
    return <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return (
    <>
      <img
        src={src}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Blurred, not crushed. An early pass dimmed this to 0.34 and a pale watercolour frame went flat
          // charcoal — two thirds of the thumbnail reading as nothing. The gradient below is what buys the
          // type its contrast, so the fill only has to stay quiet enough not to compete.
          transform: 'scale(1.3)',
          filter: 'blur(64px) brightness(0.62) saturate(1.25)',
        }}
      />
      <img
        src={src}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: '100% 50%', // the panel hugs the right edge
          // Reads as a deliberate panel rather than a seam where the sharp image meets the blur.
          filter: 'drop-shadow(-14px 0 34px rgba(0,0,0,0.55))',
        }}
      />
    </>
  )
}

// Scale from the WORD COUNT, not the character count. A thumbnail overlay is 1–5 words; what makes it
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
  sourceVertical = false,
}) => {
  const text = title.trim()
  // A portrait source cedes its right third to the image panel, so the type field is narrower.
  const size = scaleFor(text, sourceVertical ? 120 : 132)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Backdrop src={imageSrc} vertical={sourceVertical} />
      {/* Left-to-right falloff: guarantees the type's own contrast without dimming the subject. */}
      <AbsoluteFill
        style={{
          background: sourceVertical
            ? 'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 46%, rgba(0,0,0,0) 66%)'
            : 'linear-gradient(to right, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0) 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 56,
          top: 0,
          bottom: 0,
          width: sourceVertical ? '50%' : '56%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 96, height: 10, background: accent, marginBottom: 26 }} />
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.0,
            letterSpacing: '-0.03em',
            color: '#fff',
            textShadow: '0 2px 24px rgba(0,0,0,0.75)',
            textWrap: 'balance',
            // Uppercased by the TREATMENT, not by the writer. Two reasons, and neither is a style opinion:
            // the candidates the founder judged were rendered uppercase, so honouring their pick means
            // rendering what they actually saw; and the model's own casing is inconsistent run to run
            // ("1 MILLION BTC" next to "Unweaving the Sling"), which would show up as a ragged grid across
            // a channel's thumbnails. Casing is a property of the house treatment.
            textTransform: 'uppercase',
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  )
}
