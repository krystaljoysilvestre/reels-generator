import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { setSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string }
  const expected = process.env['OPERATOR_PASSWORD']
  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await setSession()
  return NextResponse.json({ ok: true })
}
