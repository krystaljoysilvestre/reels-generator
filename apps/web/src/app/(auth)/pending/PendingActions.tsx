'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

export function PendingActions({ canVerify, canRefresh, canActivate }: { canVerify: boolean; canRefresh: boolean; canActivate: boolean }) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [sending, setSending] = useState(false)
  const [entering, setEntering] = useState(false)
  const [message, setMessage] = useState('')
  async function resend() {
    setSending(true)
    setMessage('')
    try {
      const res = await fetch('/api/account/request-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json() as { error?: string }
      setMessage(res.ok ? 'Confirmation email sent. Check your inbox and spam folder.' : data.error ?? 'Could not send the email. Please try again.')
    } catch { setMessage('Could not connect. Please try again.') }
    finally { setSending(false) }
  }
  async function enterStudio() {
    setEntering(true)
    setMessage('')
    try {
      const res = await fetch('/api/account/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setMessage(data.error ?? 'Could not open your studio. Please try again.')
        router.refresh()
        return
      }
      router.replace('/dashboard')
      router.refresh()
    } catch { setMessage('Could not connect. Please try again.') }
    finally { setEntering(false) }
  }
  return <div className="mt-6 space-y-3">
    {canActivate && <button className="btn-primary w-full" disabled={entering} onClick={enterStudio}>{entering ? 'Opening…' : 'Enter studio'}</button>}
    {canVerify && <button className="btn-primary w-full" disabled={sending} onClick={resend}>{sending ? 'Sending…' : 'Resend confirmation'}</button>}
    {canRefresh && <button className="btn-secondary w-full" disabled={refreshing} onClick={() => { setMessage('Access checked. This page opens your studio when your account is ready.'); startTransition(() => router.refresh()) }}>{refreshing ? 'Checking…' : 'Check access'}</button>}
    {message && <p role="status" className="text-xs leading-relaxed text-night-body">{message}</p>}
    <div className="flex justify-between pt-3 text-xs text-night-body"><Link href="/help" className="hover:text-white">Getting started</Link><button onClick={() => signOut({ callbackUrl: '/signin' })} className="hover:text-white">Sign out</button></div>
  </div>
}
