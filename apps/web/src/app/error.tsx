'use client'
import Link from 'next/link'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
    <div className="max-w-md">
      <h1 className="text-3xl text-ink">We couldn’t open this page.</h1>
      <p className="mt-4 text-base leading-relaxed text-muted">Something didn’t come through. Try loading the page again, or visit the guide for help.</p>
      <div className="mt-7 flex flex-wrap gap-3"><button onClick={reset} className="btn-primary">Try again</button><Link href="/help" className="btn-secondary">Get help</Link></div>
    </div>
  </main>
}
