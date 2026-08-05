'use client'

import { useState } from 'react'

const TOPICS = ['Support', 'Feedback', 'Press', 'Other'] as const
type Topic = (typeof TOPICS)[number]
type FormState = 'idle' | 'sending' | 'done' | 'error'

const inputClasses =
  'w-full rounded-[11px] border border-white/[0.12] bg-white/[0.04] px-3.5 py-3 font-sans text-sm text-white outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-night-faint focus:border-accent focus:shadow-[0_0_0_3px_rgba(155,59,255,0.22)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="text-xs font-600 text-night-body">{label}</span>
      {children}
    </label>
  )
}

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<Topic>('Support')
  const [body, setBody] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message: body }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string }
      if (res.ok) {
        setState('done')
        setMessage(data.message ?? 'Message sent — we’ll reply within a day.')
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
      <div className="mono mt-[18px] flex items-center gap-2.5 rounded-xl border border-[rgba(67,192,138,0.4)] bg-[rgba(67,192,138,0.1)] px-5 py-3.5 text-sm text-[#C6F5DD]">
        ✓ {message}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-[18px] flex flex-col gap-3.5">
      <Field label="Name">
        <input
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={inputClasses}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@studio.com"
          className={inputClasses}
        />
      </Field>
      <div className="flex flex-col gap-[7px]">
        <span className="text-xs font-600 text-night-body">Topic</span>
        <div className="flex flex-wrap gap-[7px]">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              aria-pressed={topic === t}
              className={`mono cursor-pointer rounded-[9px] px-3 py-[7px] text-[11px] font-700 uppercase transition-colors ${
                topic === t
                  ? 'border-none bg-[linear-gradient(120deg,#9B3BFF,#FF2D9B)] text-white'
                  : 'border border-white/[0.12] bg-white/[0.05] text-night-body hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <Field label="Message">
        <textarea
          required
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="How can we help?"
          className={`${inputClasses} h-[104px] resize-none leading-normal`}
        />
      </Field>
      <button
        type="submit"
        disabled={state === 'sending'}
        className="kx-btn mt-0.5 flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-xl border-none bg-brand-3 p-3.5 font-display text-[15px] font-700 text-white shadow-[0_12px_30px_-10px_rgba(255,45,155,0.55)] disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send message'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
        </svg>
      </button>
      {state === 'error' && <p className="mono text-[11.5px] text-[#FF9C8A]">{message}</p>}
    </form>
  )
}
