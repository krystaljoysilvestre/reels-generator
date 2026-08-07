/**
 * Second takes. HANDOFF: confirm each answer against current product behavior
 * before publishing; fix any that drift.
 */
const QA: Array<{ q: string; a: string }> = [
  {
    q: 'Do I need editing skills?',
    a: 'None. Describe a channel and Kendrix writes, shoots, scores and cuts. You review and approve — no timeline-scrubbing required.',
  },
  {
    q: 'Can I edit what it makes?',
    a: 'Always. Rewrite the story, reshoot any scene, swap the voice, change captions and the look — every step is yours to steer.',
  },
  {
    q: 'What kinds of stories?',
    a: 'Scary stories, heartfelt drama, comedy, confessions, facts and explainers, lifestyle and more. Each genre plays by its own craft, and your channel gives every story its world.',
  },
  {
    q: 'Whose voice narrates?',
    a: 'Pick one voice for the whole channel or a different one per reel, from a library tuned to your niche. Preview before you commit.',
  },
  {
    q: 'What does it cost?',
    a: 'Free during early testing. Every render shows its spend up front, with budgets and a studio cap so nothing surprises you.',
  },
  {
    q: 'Do I own the output?',
    a: 'Yes. The reels are yours to publish and monetize anywhere — Kendrix just produces them.',
  },
  {
    q: 'How long is a reel?',
    a: 'Short reels up to about three minutes, plus long-form cuts for YouTube — length and pacing adjust to the format automatically.',
  },
  {
    q: 'Will platforms treat this as AI spam?',
    a: 'The right worry. YouTube demonetizes mass-produced stories with "only superficial differences" — and explicitly welcomes AI-assisted storytelling with real human judgment in it. Kendrix is built for the second kind: every story is graded before you see it, and nothing publishes without your say-so. We run our own channels on Kendrix, under the same rules.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-10 pt-[60px] sm:px-8">
      <div className="mb-10 text-center">
        <div className="eyebrow">Second takes · FAQ</div>
        <h2 className="mt-3 text-[34px] font-800 tracking-[-0.03em] sm:text-[44px]">
          Before you roll.
        </h2>
      </div>
      <div className="mx-auto grid max-w-[960px] gap-4 md:grid-cols-2">
        {QA.map(({ q, a }, i) => (
          <div key={q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-baseline gap-[11px]">
              <span className="mono flex-shrink-0 text-[13px] text-brand-purple">Q{i + 1}</span>
              <h3 className="text-[17px] font-800">{q}</h3>
            </div>
            <p className="ml-[30px] mt-[11px] text-sm leading-[1.6] text-night-muted">{a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
