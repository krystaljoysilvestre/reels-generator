import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Account access' }

export default function PendingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
