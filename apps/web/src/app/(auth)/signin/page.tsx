import { Suspense } from 'react'
import { publicAuthOptions } from '@/lib/signup-policy'
import { SignInForm } from './SignInForm'

export const dynamic = 'force-dynamic'

export default function SignInPage() {
  return <Suspense><SignInForm {...publicAuthOptions()} /></Suspense>
}
