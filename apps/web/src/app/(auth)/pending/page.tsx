'use client'
import { signOut } from 'next-auth/react'
import { AuthShell } from '../AuthShell'

export default function PendingPage() {
  return (
    <AuthShell title="Almost there" subtitle="Your account is awaiting approval.">
      <p className="text-sm text-muted">
        Thanks for signing up! An admin needs to approve your account before you can start. Access opens
        as soon as that happens — check back shortly.
      </p>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/signin' })}
        className="btn-secondary w-full mt-5"
      >
        Sign out
      </button>
    </AuthShell>
  )
}
