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
  const open = isOpenSignup()
  const emailConfigured = isAccountEmailConfigured()
  const canActivate = user.status === 'pending' && Boolean(row?.emailVerified) && open
  const verify = !suspended && !row?.emailVerified && emailConfigured
  const verificationUnavailable = !suspended && !row?.emailVerified && open && !emailConfigured
  const title = suspended ? 'Access is paused' : canActivate ? 'Your studio is ready' : verificationUnavailable ? 'Email confirmation is unavailable' : verify ? 'Check your email' : 'You’re on the list'
  const subtitle = suspended ? 'Your account is currently suspended.' : canActivate ? 'Free early access is now open.' : verificationUnavailable ? 'Your account still needs email confirmation.' : verify ? 'Confirm your email to continue.' : 'Your account is waiting for approval.'
  return (
    <AuthShell title={title} subtitle={subtitle}>
      <p className="text-sm leading-relaxed text-night-body">
        {suspended ? 'Signing in again won’t restore access. Contact us below if you need help with your account.' : canActivate ? 'Your email is confirmed. Enter the studio to start your first channel.' : verificationUnavailable ? 'We can’t send confirmation emails right now. Contact us for help, or return here to try again later.' : verify ? `Check ${user.email ?? 'your inbox'} for a confirmation link, or request a new one below. ${open ? 'Once confirmed, you can start your first channel.' : 'We’ll review your access after you confirm.'}` : 'We’re welcoming creators gradually. Return here to check your access, or follow your invitation link if you have one.'}
      </p>
      {verificationUnavailable && <a href="https://kendrix.io/contact" className="mt-4 inline-block text-sm text-accent hover:underline">Get account help</a>}
      <PendingActions canVerify={verify} canRefresh={!suspended && !canActivate} canActivate={canActivate} />
    </AuthShell>
  )
}
