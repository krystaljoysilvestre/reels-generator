import { type NextRequest, NextResponse } from 'next/server'
import { validateInvite, setInviteCookie } from '@/lib/invite'

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
  return NextResponse.redirect(new URL('/signup?invite=1', origin))
}
