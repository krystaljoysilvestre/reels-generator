import { CheckIcon } from './icons'

/**
 * The ship log — reconciled against main whenever something ships (last: 2026-08-08).
 *
 * Standing rule, because a ship log is the one section that rots into a lie by sitting still: an
 * item only moves to SHIPPED once it is merged to main and the capability actually works. A
 * feature waiting on the founder's own config still counts; a feature that has never produced
 * output does not, however finished the code looks.
 */
const SHIPPED = [
  'Story read-gate & finishing pass',
  'Cutting-room storyboard editor',
  'Narration from a voice library tuned per channel',
  'Music beds, foley & a four-layer mix',
  'Per-reel story bible — characters stay on-model',
  'Scheduled publishing to YouTube — Shorts & long-form',
  // 2026-08-08 reconcile: both below were IN THE CUT and have since landed on main. Long-form
  // also graduated, but it's already covered by the publishing line above rather than repeated.
  'Endings that land — every genre closes, instead of stopping', // e712dbe + 22de9b9
  'Fact-checking for real-world stories — an advisory pass before you approve', // PR#21, b523149
]

const IN_THE_CUT = [
  'Channel-wide sound & world identity',
  'Recurring characters and places that persist across episodes',
  'Series — recurring story categories with their own queue',
]

const ON_THE_SLATE = [
  // Kendrix already RENDERS for TikTok and Reels; what's outstanding is scheduled publishing
  // straight to them, which is why this line says publishing and not support.
  'TikTok & Instagram Reels publishing',
  'Analytics & payout insights',
  'Trend-driven ideation',
]

export function Roadmap() {
  return (
    <section id="roadmap" className="relative z-[2] mx-auto max-w-[1220px] px-6 py-[60px] sm:px-8">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="eyebrow">Building in public · the ship log</div>
          <h2 className="mt-3 text-[34px] font-800 tracking-[-0.03em] sm:text-[44px]">Shot list.</h2>
        </div>
        <p className="max-w-[340px] text-[15px] leading-[1.6] text-night-muted">
          We ship in the open. Here&rsquo;s what&rsquo;s cut, what&rsquo;s rolling, and what&rsquo;s
          on the slate next.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* shipped */}
        <div className="rounded-[18px] border border-[rgba(67,192,138,0.28)] bg-[rgba(67,192,138,0.05)] p-6">
          <div className="mb-[18px] flex items-center gap-[9px]">
            <span className="h-2 w-2 rounded-full bg-mint" />
            <span className="mono text-[11px] tracking-[0.14em] text-mint">SHIPPED</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {SHIPPED.map((item) => (
              <div key={item} className="flex gap-2.5">
                <span className="mt-0.5 flex-shrink-0">
                  <CheckIcon size={16} stroke="#43C08A" strokeWidth={2.4} />
                </span>
                <span className="text-sm leading-[1.45] text-night-lit">{item}</span>
              </div>
            ))}
          </div>
        </div>
        {/* in the cut */}
        <div className="rounded-[18px] border border-[rgba(155,59,255,0.34)] bg-[rgba(155,59,255,0.06)] p-6 shadow-[0_0_0_1px_rgba(155,59,255,0.12)]">
          <div className="mb-[18px] flex items-center gap-[9px]">
            <span className="kx-blink h-2 w-2 rounded-full bg-brand-pink" />
            <span className="mono text-[11px] tracking-[0.14em] text-night-orchid">
              IN THE CUT · NOW
            </span>
          </div>
          <div className="flex flex-col gap-3.5">
            {IN_THE_CUT.map((item) => (
              <div key={item} className="flex gap-2.5">
                <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-brand-purple" />
                <span className="text-sm leading-[1.45] text-night-lit">{item}</span>
              </div>
            ))}
          </div>
        </div>
        {/* on the slate */}
        <div className="rounded-[18px] border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-[18px] flex items-center gap-[9px]">
            <span className="h-2 w-2 rounded-full bg-night-ghost" />
            {/* No quarters. A dated commitment from a solo pre-launch founder goes stale in weeks,
                and a roadmap with last quarter on it reads as an abandoned product. */}
            <span className="mono text-[11px] tracking-[0.14em] text-night-faint">
              ON THE SLATE · NEXT
            </span>
          </div>
          <div className="flex flex-col gap-3.5">
            {ON_THE_SLATE.map((item) => (
              <div key={item} className="flex gap-2.5">
                <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-[1.5px] border-dashed border-night-ghost" />
                <span className="text-sm leading-[1.45] text-night-body">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
