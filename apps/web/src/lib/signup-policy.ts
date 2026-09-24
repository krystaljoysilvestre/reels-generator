import { isAccountEmailConfigured } from './account-email'

export function isOpenSignup(): boolean {
  return process.env['SIGNUP_MODE'] === 'open'
}

/** Public capabilities only: no credentials are serialized to the browser. */
export function publicAuthOptions() {
  const emailRecoveryEnabled = isAccountEmailConfigured()
  return {
    open: isOpenSignup(),
    googleEnabled: Boolean(process.env['AUTH_GOOGLE_ID'] && process.env['AUTH_GOOGLE_SECRET']),
    emailSignupEnabled: !isOpenSignup() || emailRecoveryEnabled,
    emailRecoveryEnabled,
  }
}
