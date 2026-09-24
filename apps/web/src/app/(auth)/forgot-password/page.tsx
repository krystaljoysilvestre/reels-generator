import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RecoveryForm } from '../RecoveryForm'
import { isAccountEmailConfigured } from '@/lib/account-email'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reset your password', referrer: 'no-referrer', robots: { index: false, follow: false } }

export default function Page() {
  return <Suspense><RecoveryForm kind="forgot" enabled={isAccountEmailConfigured()} /></Suspense>
}
