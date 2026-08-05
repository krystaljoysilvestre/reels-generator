import { NextResponse } from 'next/server'

/**
 * Contact-form capture. Forwards the message to the inbox webhook configured via env:
 *
 *   KENDRIX_CONTACT_ENDPOINT — POST target (e.g. a form-inbox or Slack/email webhook)
 *   KENDRIX_CONTACT_API_KEY  — optional bearer token for that endpoint
 *
 * Keys stay server-side; the client only ever talks to this route.
 */

const TOPICS = ['Support', 'Feedback', 'Press', 'Other']

export async function POST(req: Request) {
  let payload: { name?: unknown; email?: unknown; topic?: unknown; message?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const { name, email, topic, message } = payload
  if (typeof name !== 'string' || !name.trim() || name.length > 120) {
    return NextResponse.json({ message: 'Add your name so we know who to reply to.' }, { status: 400 })
  }
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 })
  }
  if (typeof topic !== 'string' || !TOPICS.includes(topic)) {
    return NextResponse.json({ message: 'Pick a topic for your message.' }, { status: 400 })
  }
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
    return NextResponse.json({ message: 'Write a message before sending.' }, { status: 400 })
  }

  const endpoint = process.env.KENDRIX_CONTACT_ENDPOINT
  if (!endpoint) {
    return NextResponse.json(
      { message: 'The form isn’t open just yet — email hello@kendrix.io and we’ll reply within a day.' },
      { status: 503 },
    )
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = process.env.KENDRIX_CONTACT_API_KEY
  if (apiKey) headers.Authorization = `Token ${apiKey}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name.trim(),
        email,
        topic,
        message: message.trim(),
        source: 'landing-contact',
      }),
    })
    if (!res.ok) {
      return NextResponse.json(
        { message: 'That didn’t go through — try again in a moment.' },
        { status: 502 },
      )
    }
  } catch {
    return NextResponse.json(
      { message: 'That didn’t go through — try again in a moment.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ message: 'Message sent — we’ll reply within a day.' })
}
