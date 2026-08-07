# The Director's Monitor — stills

The six scene frames behind the landing page's "The cut · live direction" section
([featured-frame.tsx](../../src/components/featured-frame.tsx) →
[directors-monitor.tsx](../../src/components/directors-monitor.tsx)).

The section is not a second video player. The hero already answers *"can this make beautiful
videos?"*; this one answers *"would I trust this to direct my story?"* — so it shows the direction
behind each frame, and the frames themselves are stills with CSS motion. No `<video>`, by design.

## What the stills have to do

One horror reel, six scenes, one house, one night. Two composition disciplines are enforced in the
shared `HOUSE` clause of [gen-monitor-stills.mjs](gen-monitor-stills.mjs), and both are load-bearing:

1. **Light signature** (inherited from the trailer) — one dominant warm source, one focal point,
   warm core against cool surround. This, not per-shot wording, is what makes six independent
   generations read as the same location.
2. **Left of centre** — the right ~28% of the frame sits under the Director's Notebook panel from
   `md` up. A centred subject gets covered by the page.

Empty frames only: no people, no faces, no gore. The dread is in what's implied.

## Regenerating

```bash
cd apps/landing/scripts/monitor
node gen-monitor-stills.mjs                 # all six — PAID
node gen-monitor-stills.mjs doorknob        # re-roll one

# then export to the web (public/monitor/ is committed; assets/trailer-src/ is gitignored)
cd ../../../..
for pair in door:01 window:02 closet:03 doorknob:04 nightlight:05 stairs:06; do
  ffmpeg -y -i "assets/trailer-src/stills/monitor/${pair%%:*}.jpg" -q:v 4 \
    "apps/landing/public/monitor/scene-${pair##*:}.jpg"
done
```

Sources land at 1248×702; the export is a recompress, not a resize, because `next/image`
optimises and serves the derivatives. Each web file is 48–93 KB.

## Regeneration costs (2026-08-07)

| piece | cost | notes |
|---|---|---|
| 5 scene stills | ~$0.35 | flux-2-pro, 1248×702, 7¢ each — door, window, doorknob, nightlight, stairs |
| closet (scene 03) | ~$0.07 | the plan expected to reuse the trailer's `beat1-closet.jpg` for free. It doesn't work: that frame is portrait, centre-composed and graded teal for a different film, so it broke both disciplines at once. Re-shooting it in this register is the reason the six read as one house |
| component, CSS, exports | $0 | local |
| **total** | **~$0.42** | |

Marketing asset generation — outside the per-reel cost ledger, same as the trailer.

`gen-monitor-stills.mjs` is the only paid step here. Running it spends money; the exports and the
component do not.

## Provenance

These are marketing assets generated with the same engines the product runs (flux via fal.ai) —
**not** product-pipeline output, and the direction copy in `directors-monitor.tsx` is illustrative.
Don't relabel either as pipeline output; see the comment block in
[channels.tsx](../../src/components/channels.tsx) for the same constraint on the channel art.
