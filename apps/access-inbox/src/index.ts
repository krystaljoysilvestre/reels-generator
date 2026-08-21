import { EmailMessage } from 'cloudflare:email'
import { createMimeMessage } from 'mimetext'

/**
 * Receives "Get access" requests from apps/landing's /api/subscribe route.
 *
 * Two jobs, in priority order:
 *   1. RECORD the address in D1 — this is the waitlist, and it is the part that must not fail.
 *   2. NOTIFY the studio inbox via Email Routing, so a signup is visible the moment it happens.
 *
 * The notification is best-effort on purpose: a bounced notification must never lose a signup,
 * so a send failure still returns ok once the row is committed.
 *
 * Payload is Buttondown-shaped (`email_address` + `email`) because the landing route was written
 * against a hosted list. That means switching to a hosted provider later is an env-var change with
 * no code edit on either side — and `GET /export` hands over the list to make that switch cheap.
 *
 * Auth: `Authorization: Token <ACCESS_TOKEN>` on every route.
 */

interface Env {
  DB: D1Database
  INBOX: SendEmail
  DESTINATION: string
  ACCESS_TOKEN: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Envelope sender. Must be an address established on the kendrix.io zone in Email Routing. */
const SENDER = 'access-form@kendrix.io'

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.headers.get('authorization') !== `Token ${env.ACCESS_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { pathname } = new URL(req.url)

    // The whole list as CSV — the migration path onto a hosted provider whenever one is chosen.
    if (req.method === 'GET' && pathname === '/export') {
      const { results } = await env.DB.prepare(
        'SELECT email, created_at, source, channel FROM access_requests ORDER BY created_at',
      ).all<{ email: string; created_at: string; source: string | null; channel: string | null }>()
      const csv = [
        'email,created_at,source,channel',
        ...results.map((r) =>
          [r.email, r.created_at, r.source ?? '', r.channel ?? ''].map(csvCell).join(','),
        ),
      ].join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="kendrix-access-requests.csv"',
        },
      })
    }

    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    let payload: { email?: unknown; email_address?: unknown; tags?: unknown; channel?: unknown }
    try {
      payload = (await req.json()) as typeof payload
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    const raw = typeof payload.email === 'string' ? payload.email : payload.email_address
    if (typeof raw !== 'string') return new Response('Bad request', { status: 400 })
    // Trim BEFORE validating — a pasted address often carries a trailing space, and the regex
    // rejects surrounding whitespace, so validating first turned a good signup into a 400.
    const email = raw.trim().toLowerCase()
    // Defense in depth: the landing route validates, but this endpoint is reachable directly.
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return new Response('Bad request', { status: 400 })
    }
    const source = Array.isArray(payload.tags) ? payload.tags.filter((t) => typeof t === 'string').join(' ') : ''
    // What the person says their channel is about. Optional, free text, never validated — it's the
    // difference between a list of addresses and a list of qualified creators.
    const channel = typeof payload.channel === 'string' ? payload.channel.trim().slice(0, 200) : ''

    let notified = false
    let duplicate = false
    try {
      const res = await env.DB.prepare(
        'INSERT INTO access_requests (email, source, channel) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
      )
        .bind(email, source, channel)
        .run()
      // Someone re-submitting is a success from their side, and must not send a second notification.
      duplicate = (res.meta?.changes ?? 0) === 0
    } catch {
      return new Response('Storage failed', { status: 502 })
    }

    // Checked before we hand anything to Cloudflare. A misconfigured DESTINATION (the secret was
    // once set to a bare token) otherwise gets echoed back inside the provider's rejection text,
    // which then lands in the logs — so a config mistake quietly becomes a secret disclosure.
    if (!duplicate && !EMAIL_RE.test(env.DESTINATION ?? '')) {
      console.error(
        'access-inbox: DESTINATION secret is not an email address — notification skipped. ' +
          'Re-set it to a verified Email Routing destination. Value withheld: it may be a credential.',
        { email },
      )
    } else if (!duplicate) {
      try {
        const mime = createMimeMessage()
        mime.setSender({ name: 'Kendrix access requests', addr: SENDER })
        mime.setRecipient(env.DESTINATION)
        mime.setSubject(`[Kendrix · access] ${email}`)
        mime.addMessage({
          contentType: 'text/plain',
          data: [
            `Email:   ${email}`,
            `Channel: ${channel || '(not given)'}`,
            `Source:  ${source || 'landing'}`,
            '',
            '—',
            'Requested access via kendrix.io. Recorded in the access-requests list;',
            'GET /export on this worker returns the full list as CSV.',
          ].join('\n'),
        })
        await env.INBOX.send(new EmailMessage(SENDER, env.DESTINATION, mime.asRaw()))
        notified = true
      } catch (err) {
        // Still swallowed — the signup is recorded, and losing it to a mail problem would be the
        // one genuinely bad outcome. But swallowing it SILENTLY is what let two real signups sit
        // unannounced, so the failure is now loud in the logs and visible in the response.
        // Providers quote the offending input back at you, so the raw message can carry whatever
        // DESTINATION holds. Redact it before logging rather than trusting it to be an address.
        const raw = err instanceof Error ? err.message : String(err)
        console.error('access-inbox: notification failed', {
          email,
          error: env.DESTINATION ? raw.split(env.DESTINATION).join('[DESTINATION]') : raw,
        })
      }
    }

    return Response.json({ ok: true, duplicate, notified })
  },
}
