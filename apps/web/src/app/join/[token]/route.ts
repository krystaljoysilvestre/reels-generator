import { type NextRequest, NextResponse } from 'next/server'
import { validateInvite, setInviteCookie, consumeInviteForUser } from '@/lib/invite'
import { getCurrentUser } from '@/lib/auth'
import { invalidateUserProfile } from '@/lib/user-profile'

// Invite entry point. Validates the token, stashes it in a short-lived cookie, and sends the visitor
// to sign up (or sign in with Google) — account creation then consumes the invite (active + its role).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const origin = req.nextUrl.origin
  const invite = await validateInvite(token)
  if (!invite) {
    return NextResponse.redirect(new URL('/signin?error=invite', origin))
  }
  await setInviteCookie(token)
  const user = await getCurrentUser()
  if (user) {
    await consumeInviteForUser(user.id)
    invalidateUserProfile(user.id)
    return NextResponse.redirect(new URL('/dashboard', origin))
  }
  return NextResponse.redirect(new URL('/signup?invite=1', origin))
}
