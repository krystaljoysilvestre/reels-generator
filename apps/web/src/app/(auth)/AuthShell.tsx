'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import Link from 'next/link'
import { KendrixMark, Wordmark } from '@/components/Wordmark'

/** The four capability marks on the auth brand panel — one per gradient hue. */
const FEATURES: Array<{ hue: string; label: [string, string]; path: React.ReactNode }> = [
  {
    hue: '#2FA4FF',
    label: ['Story', 'development'],
    path: <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />,
  },
  {
    hue: '#9B3BFF',
    label: ['Storyboard', 'to visuals'],
    path: (
      <>
        <rect x="3" y="4" width="7" height="7" rx="1" />
        <rect x="14" y="4" width="7" height="7" rx="1" />
        <rect x="3" y="15" width="7" height="5" rx="1" />
        <rect x="14" y="15" width="7" height="5" rx="1" />
      </>
    ),
  },
  {
    hue: '#FF2D9B',
    label: ['Images', '& videos'],
    path: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  },
  {
    hue: '#FF9A3D',
    label: ['Ready', 'to export'],
    path: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  },
]

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-night text-night-ink">
      {/* ── LEFT · brand world ─────────────────────────────── */}
      <div className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-night-800 px-14 py-14 lg:flex lg:flex-[1.15]">
        <div className="brand-glow pointer-events-none absolute inset-0" />

        <Link href="/" className="relative"><Wordmark size={38} textClass="text-[22px]" onDark /></Link>

        <div className="relative my-5 max-w-[560px]">
          <KendrixMark
            size={132}
            className="animate-k-float mb-8 [filter:drop-shadow(0_16px_50px_rgba(155,59,255,0.55))]"
          />
          <h1 className="text-[40px] font-800 leading-[1.06] -tracking-[0.025em] sm:text-[46px]">
            Imagine it.
            <br />
            We produce it.
          </h1>
          <p className="mt-5 max-w-[460px] text-[17px] leading-relaxed text-night-body">
            Kendrix turns a single idea into publish-ready vertical video — story, storyboard,
            visuals, voice and sound. Review it, then download it to share.
          </p>
          <p className="mt-6 text-[13px] font-700 uppercase tracking-[0.18em]">
            <span className="text-brand-blue">Imagine.</span>{' '}
            <span className="text-brand-purple">Create.</span>{' '}
            <span className="text-brand-pink">Publish.</span>{' '}
            <span className="text-brand-orange">Share.</span>
          </p>
        </div>

        <div className="relative flex flex-wrap gap-7">
          {FEATURES.map((f) => (
            <div key={f.label.join(' ')} className="flex items-center gap-2.5">
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-sm"
                style={{ background: `${f.hue}1F`, border: `1px solid ${f.hue}4D` }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={f.hue} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {f.path}
                </svg>
              </div>
              <span className="text-xs leading-tight text-night-body">
                {f.label[0]}
                <br />
                {f.label[1]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT · form panel ─────────────────────────────── */}
      <div className="flex w-full items-center justify-center border-l border-white/[0.06] bg-night-700 px-6 py-10 lg:w-auto lg:min-w-[440px] lg:flex-[0.85]">
        <div className="w-full max-w-[360px]">
          {/* The brand panel is hidden on small screens, so carry the lockup here. */}
          <Link href="/" className="mb-8 block lg:hidden"><Wordmark size={30} textClass="text-lg" onDark /></Link>

          <div className="mb-7">
            <h2 className="text-[26px] font-700 -tracking-[0.02em]">{title}</h2>
            <p className="mt-2 text-sm text-night-muted">{subtitle}</p>
          </div>
          {children}
          <nav aria-label="Support and policies" className="mt-8 flex justify-center gap-5 text-xs text-night-muted">
            <a href="https://kendrix.io/contact" className="hover:text-white">Contact</a>
            <a href="https://kendrix.io/privacy" className="hover:text-white">Privacy</a>
            <a href="https://kendrix.io/terms" className="hover:text-white">Terms</a>
          </nav>
        </div>
      </div>
    </div>
  )
}

export function GoogleButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <>
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        setError(false)
        try { await signIn('google', { callbackUrl: '/dashboard' }) }
        catch { setError(true); setBusy(false) }
      }}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm font-600 text-night-ink transition-colors hover:border-white/20 hover:bg-white/[0.07]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
      </svg>
      {busy ? 'Connecting…' : label}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-night-danger">Could not connect to Google. Please try again.</p>}
    </>
  )
}

/** Hairline divider. `label` renders the mock's tracked micro-label between the rules. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  const micro = label !== 'or'
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className={micro ? 'text-[11px] uppercase tracking-[0.1em] text-night-faint' : 'text-xs text-night-muted'}>
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  )
}

/** Field label + control, styled for the dark auth panel. */
export function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-600 text-night-body">
        {label}
      </label>
      {children}
      {hint}
    </div>
  )
}
