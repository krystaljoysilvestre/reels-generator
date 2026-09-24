/** Match the studio's explicit launch switch. Unset remains the existing invitation list. */
export function landingAccess() {
  const url = new URL(process.env.KENDRIX_APP_URL || 'https://app.kendrix.io')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('KENDRIX_APP_URL must be an HTTPS app URL, or localhost for development.')
  }
  const open = process.env.SIGNUP_MODE === 'open'
  return {
    open,
    signupUrl: new URL('/signup', url.origin).href,
    signinUrl: new URL('/signin', url.origin).href,
    helpUrl: new URL('/help', url.origin).href,
  }
}
