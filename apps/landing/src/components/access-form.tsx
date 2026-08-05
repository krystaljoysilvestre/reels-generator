'use client'

import { useState } from 'react'

type FormState = 'idle' | 'sending' | 'done' | 'error'

export function AccessForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string }
      if (res.ok) {
        setState('done')
        setMessage(data.message ?? 'You’re on the list — we’ll be in touch.')
      } else {
        setState('error')
        setMessage(data.message ?? 'That didn’t go through — try again in a moment.')
      }
    } catch {
      setState('error')
      setMessage('That didn’t go through — try again in a moment.')
    }
  }

  if (state === 'done') {
    return (
      <div className="mono inline-flex items-center gap-2.5 rounded-xl border border-[rgba(67,192,138,0.4)] bg-[rgba(67,192,138,0.1)] px-5 py-3.5 text-sm text-[#C6F5DD]">
        ✓ {message}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="inline-flex flex-col items-center gap-2">
      <div className="flex overflow-hidden rounded-xl border border-white/[0.16] bg-black/25">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@studio.com"
          aria-label="Email address"
          className="mono w-[180px] border-none bg-transparent px-4 py-3.5 text-sm text-white outline-none placeholder:text-night-faint sm:w-[220px]"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="kx-btn cursor-pointer whitespace-nowrap border-none bg-brand-3 px-[22px] font-display text-sm font-700 text-white disabled:opacity-60"
        >
          {state === 'sending' ? 'Sending…' : 'Request →'}
        </button>
      </div>
      {state === 'error' && (
        <p className="mono max-w-[320px] text-[11.5px] text-[#FF9C8A]">{message}</p>
      )}
    </form>
  )
}
