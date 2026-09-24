import { createHash } from 'node:crypto'
import type { AccountTokenPurpose } from './account-tokens'

function emailConfig(): { apiKey: string; from: string; origin: string } | null {
  const apiKey = process.env['RESEND_API_KEY']?.trim()
  const from = process.env['AUTH_EMAIL_FROM']?.trim()
  const base = process.env['AUTH_URL']?.trim()
  if (!apiKey || !from || !base) return null
  try {
    const url = new URL(base)
    // HTTP is only useful for local development. Never derive bearer links from request headers.
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) return null
    return { apiKey, from, origin: url.origin }
  } catch {
    return null
  }
}

export function isAccountEmailConfigured(): boolean {
  return emailConfig() !== null
}

export async function sendAccountEmail(email: string, purpose: AccountTokenPurpose, token: string): Promise<void> {
  const config = emailConfig()
  if (!config) throw new Error('Account email is not configured. Set RESEND_API_KEY, AUTH_EMAIL_FROM, and AUTH_URL.')
  const link = new URL(purpose === 'verify' ? '/verify-email' : '/reset-password', config.origin)
  link.searchParams.set('token', token)
  const subject = purpose === 'verify' ? 'Verify your Kendrix email' : 'Reset your Kendrix password'
  const text = purpose === 'verify'
    ? `Confirm your email to continue with Kendrix:\n\n${link.href}\n\nThis link expires in 24 hours and works once. If you did not request it, you can ignore this email.`
    : `Choose a new password for Kendrix:\n\n${link.href}\n\nThis link expires in 1 hour and works once. If you did not request it, you can ignore this email. Your password will stay the same.`
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `account-${createHash('sha256').update(`${purpose}:${token}`).digest('hex')}`,
      },
      body: JSON.stringify({ from: config.from, to: [email], subject, text }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Provider errors may include the request body. Keep addresses, links, and secrets out of logs.
    throw new Error('Account email could not be sent. Please try again shortly.')
  }
  if (!response.ok) throw new Error('Account email could not be sent. Please try again shortly.')
}
