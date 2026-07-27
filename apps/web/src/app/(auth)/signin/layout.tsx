import type { Metadata } from 'next'

// The page itself is a client component and can't export metadata, so the title lives here.
export const metadata: Metadata = { title: 'Sign in' }

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
