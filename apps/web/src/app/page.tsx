import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function Home() {
  const ok = await getSession()
  if (ok) redirect('/dashboard')
  redirect('/login')
}
