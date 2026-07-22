import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { listVoices } from '@reels/providers'
import { requireApiUser } from '@/lib/api-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  try {
    const language = req.nextUrl.searchParams.get('language') ?? undefined
    const voices = await listVoices(language)
    return NextResponse.json({ voices })
  } catch (err) {
    console.error('[voices] failed to load:', err)
    return NextResponse.json({ error: 'Failed to load voices' }, { status: 502 })
  }
}
