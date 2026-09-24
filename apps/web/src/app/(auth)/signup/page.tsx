import { publicAuthOptions } from '@/lib/signup-policy'
import { readInviteToken, validateInvite } from '@/lib/invite'
import { SignUpForm } from './SignUpForm'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  const token = await readInviteToken()
  const invited = Boolean(token && await validateInvite(token))
  return <SignUpForm {...publicAuthOptions()} invited={invited} />
}
