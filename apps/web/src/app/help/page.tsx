import Link from 'next/link'
import { Wordmark } from '@/components/Wordmark'

export const metadata = {
  title: 'Your first reel · Help',
  description: 'A practical guide to channel setup, stories, storyboards, production and downloading your finished Kendrix reel.',
}

const steps = [
  {
    title: 'Give your channel a direction',
    copy: 'From Channels, choose Create channel. Describe what you want to make, choose a language, and shape the voice, sound and look. A channel keeps these choices together for future stories.',
    tip: 'Leaving setup? Choose Leave & save, then open the draft from Channels to pick up where you left off.',
  },
  {
    title: 'Start with a story',
    copy: 'Open your channel and choose Create reel. You can start from an idea, use the example script from setup, or paste your own narration. Read a new story and choose Use this story when you are ready. If it misses the mark, choose Write another and explain what needs to change.',
    tip: 'A script you supply goes straight to the storyboard, so read it through before using it.',
  },
  {
    title: 'Review the storyboard',
    copy: 'Once the scenes are ready, look through each frame and its narration. Adjust a scene or ask for a fresh take where needed. Check the voice and music, then choose Render reel when you are ready to start production.',
    tip: 'If Render reel is unavailable, check that the scene images are ready and a voice is selected.',
  },
  {
    title: 'Watch the finished cut',
    copy: 'Production brings together the visuals, narration, sound and captions. When the reel is ready, play it through with sound. Review the title, caption and cover. Go Back to editing for changes, then Re-render to make an updated cut.',
    tip: 'Choose Approve reel when you are happy with the result. Always watch the final cut before posting it.',
  },
  {
    title: 'Download and post',
    copy: 'Choose Download video, then Edit & copy caption to prepare the text with any image credits. Save caption changes to include them in future downloads and connected uploads. Download the cover and subtitles when available. Open TikTok, Instagram, Facebook or YouTube from the posting section and upload there. Post package bundles the files in a ZIP; supported browsers also offer file sharing.',
    tip: 'After posting, choose I’ve posted this for that destination and optionally save its post link. Each destination keeps its own progress. YouTube also offers an optional connected upload; check its visibility in YouTube Studio.',
  },
]

const troubleshooting = [
  {
    title: 'My video is ready, but I have not posted everywhere',
    copy: 'Reopen the reel to see each destination’s saved progress. Downloading, sharing or opening a platform does not mark it posted. Confirm only the destinations you have finished. For other platforms, use the same downloaded video and copied caption.',
  },
  {
    title: 'A story or production step failed',
    copy: 'Open the same reel from your channel. Use Try again on the story screen or Retry on the storyboard. A retry resumes from the failed step and keeps completed work. If the message says a limit was reached, check Account before retrying.',
  },
  {
    title: 'I reached an allowance',
    copy: 'Account shows your monthly production budget and how many reels you have started today. Daily counts reset at midnight UTC; the monthly period starts on the first day of the month at midnight UTC. New takes and retries can use production budget. A reel also has its own limit, and the studio can pause new work when busy.',
  },
  {
    title: 'Too many reels are in progress',
    copy: 'Go back to your channel and finish the reels already underway before starting another. A reel waiting for your story or storyboard review is still in progress.',
  },
  {
    title: 'The page stopped updating',
    copy: 'Check your connection, then reopen the same reel from your channel to see its current state. You do not need to create a duplicate reel. If a failure appears, use the retry action on that reel.',
  },
  {
    title: 'I cannot sign in',
    copy: 'Use the same email and sign-in method you used to join. If you use Google, choose Continue with Google. For email and password, use the password recovery link on the sign-in page when available. If your account is awaiting access or has been paused, follow the message shown after sign-in.',
  },
  {
    title: 'I still need help',
    copy: 'Contact the studio using the link below. Include the page link, the message you saw, and the step you were trying to complete. Never share your password or sign-in links.',
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Kendrix home"><Wordmark /></Link>
          <nav aria-label="Help navigation" className="flex items-center gap-2">
            <Link href="/account" className="btn-ghost">Account</Link>
            <Link href="/dashboard" className="btn-secondary">Open studio</Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="max-w-2xl">
          <p className="micro-label text-accent">The Kendrix guide</p>
          <h1 className="mt-3 text-4xl leading-tight text-ink sm:text-5xl">From an idea to your first reel.</h1>
          <p className="mt-5 text-base leading-relaxed text-muted">You choose the story and its direction. Kendrix brings the production together, with room for you to review each stage.</p>
        </div>

        <nav aria-label="On this page" className="mt-7 flex flex-wrap gap-3">
          <a href="#first-reel" className="btn-secondary">Make your first reel</a>
          <a href="#troubleshooting" className="btn-ghost">If you get stuck</a>
        </nav>

        <section id="first-reel" aria-labelledby="first-reel-heading" className="mt-12 scroll-mt-6">
          <h2 id="first-reel-heading" className="text-2xl text-ink">Your first reel, step by step</h2>
          <ol className="mt-6 space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="card flex gap-4 p-5 sm:gap-5 sm:p-6">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pair-blue-purple font-mono text-sm font-700 text-white">{index + 1}</span>
                <div className="min-w-0">
                  <h3 className="text-lg text-ink">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-body">{step.copy}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{step.tip}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="mt-6 rounded-lg border border-accent-ring bg-brand-wash p-5 sm:p-6">
          <h2 className="text-lg text-ink">Free while we build together</h2>
          <p className="mt-2 leading-relaxed text-muted">Early access is free, with a production allowance. Amounts shown while making a reel track production usage; they are not charges to you. See <Link href="/account" className="font-600 text-accent underline underline-offset-2">Account</Link> for your current limits and reset dates.</p>
        </aside>

        <section id="troubleshooting" aria-labelledby="troubleshooting-heading" className="mt-12 scroll-mt-6">
          <h2 id="troubleshooting-heading" className="text-2xl text-ink">If you get stuck</h2>
          <div className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {troubleshooting.map((item) => (
              <details key={item.title} className="group px-5 py-4 sm:px-6">
                <summary className="cursor-pointer rounded-sm text-sm font-700 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{item.title}</summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{item.copy}</p>
              </details>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <a href="https://kendrix.io/contact" className="btn-secondary">Contact the studio</a>
            <a href="mailto:hello@kendrix.io" className="text-sm font-600 text-accent underline underline-offset-2">hello@kendrix.io</a>
          </div>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <p className="text-sm text-muted">Your next story starts in your channel.</p>
          <Link href="/dashboard" className="btn-primary">Open studio</Link>
        </div>
      </main>
    </div>
  )
}
