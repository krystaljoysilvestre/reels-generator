import { EmailMessage } from 'cloudflare:email'
import { createMimeMessage, Mailbox } from 'mimetext'

/**
 * Receives contact-form submissions from apps/landing's /api/contact route
 * and emails them to the studio inbox via Cloudflare Email Routing.
 *
 * Auth: the landing route sends `Authorization: Token <KENDRIX_CONTACT_API_KEY>`;
 * it must match the CONTACT_TOKEN secret here.
 */

interface Env {
  INBOX: SendEmail
  DESTINATION: string
  CONTACT_TOKEN: string
}

const TOPICS = ['Support', 'Feedback', 'Press', 'Other']

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    if (req.headers.get('authorization') !== `Token ${env.CONTACT_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    let payload: { name?: unknown; email?: unknown; topic?: unknown; message?: unknown }
    try {
      payload = (await req.json()) as typeof payload
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    // Defense-in-depth: the landing route validates, but this endpoint is public.
    const { name, email, topic, message } = payload
    if (
      typeof name !== 'string' || !name.trim() || name.length > 120 ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof topic !== 'string' || !TOPICS.includes(topic) ||
      typeof message !== 'string' || !message.trim() || message.length > 4000
    ) {
      return new Response('Bad request', { status: 400 })
    }

    try {
      const cleanName = name.trim().replace(/[<>"\r\n]/g, '')
      const mime = createMimeMessage()
      mime.setSender({ name: 'Kendrix contact form', addr: 'contact-form@kendrix.io' })
      mime.setRecipient(env.DESTINATION)
      mime.setHeader('Reply-To', new Mailbox({ addr: email, name: cleanName }))
      mime.setSubject(`[Kendrix · ${topic}] ${cleanName}`)
      mime.addMessage({
        contentType: 'text/plain',
        data: [
          `Topic:   ${topic}`,
          `From:    ${name.trim()} <${email}>`,
          '',
          message.trim(),
          '',
          '—',
          'Sent via the kendrix.io contact form. Reply goes to the sender.',
        ].join('\n'),
      })
      await env.INBOX.send(
        new EmailMessage('contact-form@kendrix.io', env.DESTINATION, mime.asRaw()),
      )
    } catch {
      return new Response('Delivery failed', { status: 502 })
    }

    return Response.json({ ok: true })
  },
}
