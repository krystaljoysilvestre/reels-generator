import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { isOpenSignup } from '@/lib/signup-policy'
import { Wordmark } from '@/components/Wordmark'

export const dynamic = 'force-dynamic'

const JOURNEY = [
  { title: 'Find your story', copy: 'Start with an idea, bring your own script, or shape a direction for your channel.' },
  { title: 'Make it yours', copy: 'Review the story and storyboard. Choose the voice, look and moments that matter.' },
  { title: 'Bring it together', copy: 'Kendrix produces the visuals, narration, sound and captions in one workflow.' },
  { title: 'Share the finished reel', copy: 'Review the cut, download your video and post it on your own channels.' },
]

export default async function Home() {
  const user = await getCurrentUser()
  if (user) redirect(user.status === 'active' ? '/dashboard' : '/pending')
  const open = isOpenSignup()
  return (
    <div className="min-h-screen bg-night text-night-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <Link href="/" aria-label="Kendrix home"><Wordmark size={34} onDark textClass="text-xl" /></Link>
        <nav className="flex items-center gap-6 text-sm text-night-body" aria-label="Main navigation"><Link href="/help" className="hover:text-white">How it works</Link><Link href="/signin" className="font-700 text-white">Sign in</Link></nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:px-10 sm:pt-20">
        <div className="grid items-start gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <p className="mb-6 text-sm text-night-body">{open ? 'Free early access' : 'Early access is opening gradually'}</p>
            <h1 className="max-w-xl text-[48px] font-800 leading-[1.04] -tracking-[0.04em] sm:text-[68px]">Your story.<br />A finished reel.</h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-night-body">From the first idea to the final cut. Shape your story while Kendrix brings the visuals, voice and sound together.</p>
            <div className="mt-9 flex flex-wrap items-center gap-5"><Link href="/signup" className="btn-primary px-7 py-3.5">{open ? 'Start creating' : 'Request early access'}</Link><Link href="/help" className="text-sm text-night-body hover:text-white">Explore the workflow</Link></div>
            <p className="mt-4 text-xs leading-relaxed text-night-muted">Free during early access. No card required.<br />Production limits apply; you can check them in your account.</p>
          </div>
          <ol className="border-l border-night-frame pl-7 sm:pl-9" aria-label="From idea to finished reel">
            {JOURNEY.map((step, i) => <li key={step.title} className="relative pb-9 last:pb-0">
              <span className="absolute -left-[41px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-night-rule bg-night text-xs text-night-body sm:-left-[49px]" aria-hidden>{i + 1}</span>
              <h2 className="text-xl font-700 text-white">{step.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-night-body">{step.copy}</p>
            </li>)}
          </ol>
        </div>
        <section className="mt-20 border-t border-night-frame pt-9 sm:mt-28" aria-labelledby="early-access">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]"><h2 id="early-access" className="text-xl font-700">Room to create.<br />Room to improve.</h2><p className="max-w-2xl text-sm leading-relaxed text-night-body">Kendrix is in early access. You can set up a channel, develop a story and work toward a finished video. Review your work before you share it. If production stops, the app shows what happened and gives you a way to retry.</p></div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-night-frame px-6 py-6 text-xs text-night-muted sm:px-10"><span>Kendrix — a storytelling operating system.</span><Link href="/help" className="text-night-body hover:text-white">Getting started & help</Link></footer>
    </div>
  )
}
