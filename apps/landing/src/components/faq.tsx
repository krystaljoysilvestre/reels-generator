import { FaqStructuredData } from './structured-data'
import { landingAccess } from '@/lib/access'

/**
 * Second takes. Every answer opens by naming the subject in its first sentence, deliberately —
 * this is the single highest-leverage rule for a question-and-answer surface an LLM will quote
 * standalone. "None. Describe a channel and Kendrix writes it" is an orphaned fragment out of
 * context; "Kendrix requires no editing experience" survives being lifted on its own.
 *
 * QA is also the FAQPage structured-data source (via FaqStructuredData below), so the visible copy
 * and the schema can never drift out of sync — the usual failure mode for hand-duplicated JSON-LD.
 *
 * Content confirmed against current product behavior 2026-08-07: languages against
 * apps/web/src/app/(app)/channel/new/languages.ts; publish automation against
 * packages/core/src/types/channel.ts (autoPublishYouTube) and process.tsx's own "TikTok and Reels
 * are on the slate." Numbers here (cost, timing) are deliberately NOT invented — see the two
 * questions this file does NOT ask, in the docblock at the bottom.
 */
const QA: Array<{ q: string; a: string }> = [
  {
    q: 'What is Kendrix?',
    a: 'Kendrix is a storytelling operating system for independent video creators — an opinionated workflow that turns one idea into a finished, narrated video. AI does the production work; the creator directs the story and chooses how closely to review it.',
  },
  {
    q: 'Who is Kendrix for?',
    a: 'Independent creators making story-driven video — horror, children’s stories, history and documentary, education, and other narrative genres — who publish consistently and want to stay in creative control. It’s built around one person doing the whole job, not a team.',
  },
  {
    q: 'Is Kendrix available yet?',
    a: 'Not publicly. Kendrix is in development and being proven on its own channels first. Request access from the homepage and you’ll be first through the door when invites open.',
  },
  {
    q: 'Does Kendrix use AI?',
    a: 'Yes — AI models handle the production work: writing, imagery, narration and sound. It’s an implementation detail, not the product itself. You choose the creative direction and review level. Automatic YouTube publishing only runs when you enable it for a connected channel.',
  },
  {
    q: 'How is Kendrix different from an AI video generator?',
    a: 'Most AI video tools optimize for generating output quickly. Kendrix optimizes for the story: a quality gate on the writing, a story bible that keeps characters and world consistent across scenes, and review points you can choose for your channel. The video is the output of that workflow, not the product’s identity.',
  },
  {
    q: 'Do I need video editing experience to use Kendrix?',
    a: 'No. Kendrix handles the production crafts — writing, storyboarding, narration, sound and assembly — so there’s no timeline to scrub. You can review the story, steer any scene you want changed, and check the finished cut. Your channel’s review settings decide where the workflow pauses for you.',
  },
  {
    q: 'Can I edit what Kendrix makes?',
    a: 'Yes, at every step. Rewrite the story, reshoot any scene, swap the voice, change captions and the look — nothing is locked until you approve it.',
  },
  {
    q: 'What kinds of videos can I make with Kendrix?',
    a: 'Scary stories, heartfelt drama, comedy, confessions, facts and explainers, lifestyle and more. Each genre is written to its own craft rather than a shared template, and the channel you set up gives every story in it a consistent world and voice.',
  },
  {
    q: 'Can I choose the narrator’s voice?',
    a: 'Yes. Pick one voice for the whole channel or a different one per video, from a library of narration voices, and preview any of them before committing.',
  },
  {
    q: 'What does Kendrix cost?',
    a: 'Kendrix is free during early testing, and pricing beyond that isn’t set yet. Every render shows its production cost up front, with per-video budgets and an account-level cap, so nothing surprises you.',
  },
  {
    q: 'Do I own the videos Kendrix makes, and can I monetize them?',
    a: 'Yes to both. The videos are yours to publish and monetize anywhere — Kendrix produces them, it doesn’t retain any claim on them.',
  },
  {
    q: 'How long can a Kendrix video be?',
    a: 'Short-form up to about three minutes, plus long-form cuts for YouTube. Pacing and structure adjust to the format — a short-form story is a distillation, not a trimmed-down long one.',
  },
  {
    q: 'What languages does Kendrix support?',
    a: 'English plus 29 others, including Spanish, French, German, Japanese, Korean, Hindi, Arabic, Filipino and Vietnamese — the model writes in the language you choose and narrates it in a matching voice.',
  },
  {
    q: 'Can Kendrix publish to TikTok and Instagram?',
    a: 'Kendrix already renders in TikTok and Instagram Reels’ aspect ratio. Direct scheduled publishing currently covers YouTube; TikTok and Reels publishing are next on the roadmap.',
  },
  {
    q: 'Will YouTube demonetize videos made with Kendrix?',
    a: 'YouTube’s inauthentic content policy demonetizes mass-produced or repetitive videos with only superficial differences between them — and it explicitly permits AI-assisted content that carries real human judgment. Kendrix is built for the second kind: every story is graded before you see it, and you choose your channel’s review level. Automatic YouTube publishing requires a connected channel and your explicit choice to enable it. We run our own channels on Kendrix under exactly the same rules.',
  },
]

export function Faq() {
  const { open } = landingAccess()
  const questions = QA.map((item) => item.q === 'Is Kendrix available yet?' && open
    ? { ...item, a: 'Kendrix is open for free early access. Choose Start free to create an account, set up your channel and make your first reel. No payment card is required; production limits apply while we improve the studio.' }
    : item.q === 'What does Kendrix cost?'
      ? { ...item, a: 'Kendrix is free during early access, with production limits and no payment card required. Amounts shown while making a reel track production usage, not charges to you. Pricing after early access has not been set.' }
      : item)
  return (
    <section id="faq" className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-10 pt-[60px] sm:px-8">
      <FaqStructuredData items={questions} />
      <div className="mb-10 text-center">
        <div className="eyebrow">Second takes · common questions about Kendrix</div>
        <h2 className="mt-3 text-[34px] font-800 tracking-[-0.03em] sm:text-[44px]">
          Before you roll.
        </h2>
      </div>
      <div className="mx-auto grid max-w-[960px] gap-4 md:grid-cols-2">
        {questions.map(({ q, a }, i) => (
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

/**
 * Deliberately NOT asked here, because answering would mean inventing a number:
 *
 * - "How long does it take to make one video?" — no verified timing claim exists yet. The
 *   marketing review flagged the homepage's own "~10 min" figure (problem.tsx) as unsourced and a
 *   likely trust liability; adding a second guessed number here would compound it, not fix it.
 * - "Who makes Kendrix?" — attributing the product to a named founder is a real, high-value AEO
 *   move (LLMs associate claims with people far more readily than with brand voice), but it means
 *   publishing someone's identity on a public page. That's the founder's call, not a default.
 */
