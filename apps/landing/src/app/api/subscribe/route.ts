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
  try {
    ;({ email } = (await req.json()) as { email?: unknown })
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
      body: JSON.stringify({ email_address: email, email, tags: ['landing'] }),
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
