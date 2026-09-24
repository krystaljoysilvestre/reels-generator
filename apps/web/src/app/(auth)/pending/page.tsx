import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'
import { getCurrentUser } from '@/lib/auth'
import { isAccountEmailConfigured } from '@/lib/account-email'
import { isOpenSignup } from '@/lib/signup-policy'
import { ACCOUNT_UNAVAILABLE } from '@/lib/user-profile'
import { AuthShell } from '../AuthShell'
import { PendingActions } from './PendingActions'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  if (user.status === 'active') redirect('/dashboard')
  if (user.status === ACCOUNT_UNAVAILABLE) throw new Error('Account lookup is temporarily unavailable.')
  const suspended = user.status === 'suspended'
  const [row] = await getDb().select({ emailVerified: users.emailVerified }).from(users).where(eq(users.id, user.id))
  const canActivate = user.status === 'pending' && Boolean(row?.emailVerified) && isOpenSignup()
  const verify = !suspended && !row?.emailVerified && isAccountEmailConfigured()
  return (
    <AuthShell title={suspended ? 'Access is paused' : canActivate ? 'Your studio is ready' : verify ? 'Check your email' : 'You’re on the list'} subtitle={suspended ? 'Your account is currently suspended.' : canActivate ? 'Free early access is now open.' : verify ? 'Confirm your email to continue.' : 'Your account is waiting for approval.'}>
      <p className="text-sm leading-relaxed text-night-body">
        {suspended ? 'Signing in again won’t restore access. Contact us below if you need help with your account.' : canActivate ? 'Your email is confirmed. Enter the studio to start your first channel.' : verify ? `Use the confirmation link sent to ${user.email ?? 'your email'}, or request a new one below. ${isOpenSignup() ? 'Once confirmed, you can start your first channel.' : 'We’ll review your access after you confirm.'}` : 'We’re welcoming creators gradually. Return here to check your access, or follow your invitation link if you have one.'}
      </p>
      <PendingActions canVerify={verify} canRefresh={!suspended && !canActivate} canActivate={canActivate} />
    </AuthShell>
  )
}
