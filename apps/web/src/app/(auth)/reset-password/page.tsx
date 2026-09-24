import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RecoveryForm } from '../RecoveryForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Set a new password', referrer: 'no-referrer', robots: { index: false, follow: false } }

export default function Page() {
  return <Suspense><RecoveryForm kind="reset" /></Suspense>
}
