import { NextRequest, NextResponse } from 'next/server'
import { listVoices } from '@reels/providers'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const language = req.nextUrl.searchParams.get('language') ?? undefined
    const voices = await listVoices(language)
    return NextResponse.json({ voices })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load voices'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
