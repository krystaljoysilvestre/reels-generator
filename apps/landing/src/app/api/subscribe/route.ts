import { NextResponse } from 'next/server'

/**
 * Access-request capture. Forwards the email to the hosted list configured via env:
 *
 *   KENDRIX_LIST_ENDPOINT — POST target (e.g. Buttondown's subscriber API)
 *   KENDRIX_LIST_API_KEY  — optional bearer token for that endpoint
 *
 * Keys stay server-side; the client only ever talks to this route.
 */
export async function POST(req: Request) {
  let email: unknown
  let channel: unknown
  try {
    ;({ email, channel } = (await req.json()) as { email?: unknown; channel?: unknown })
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  // Trimmed before validating: a pasted address routinely carries a trailing space, and the
  // pattern rejects surrounding whitespace — validating first rejected good signups.
  const address = typeof email === 'string' ? email.trim() : ''
  if (!address || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 })
  }

  const endpoint = process.env.KENDRIX_LIST_ENDPOINT
  if (!endpoint) {
    return NextResponse.json(
      { message: 'Requests aren’t open just yet — check back soon.' },
      { status: 503 },
    )
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = process.env.KENDRIX_LIST_API_KEY
  if (apiKey) headers.Authorization = `Token ${apiKey}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email_address: address,
        email: address,
        tags: ['landing'],
        // Optional and never validated beyond a length cap — it's free text a human will read,
        // and rejecting a signup over the shape of this field would be the wrong trade.
        channel: typeof channel === 'string' ? channel.trim().slice(0, 200) : '',
      }),
    })
    if (!res.ok && res.status !== 409) {
      // 409 = already subscribed — treat as success from the requester's side.
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

  return NextResponse.json({ message: 'You’re on the list — we’ll be in touch.' })
}
