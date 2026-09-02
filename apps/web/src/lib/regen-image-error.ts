import { NextResponse } from 'next/server'

export function unexpectedRegenImageError(error: unknown): NextResponse {
  console.error('[regen-image] unexpected failure', error)
  return NextResponse.json({ error: 'That take didn’t come through.' }, { status: 500 })
}
