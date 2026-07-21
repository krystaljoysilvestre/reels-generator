import { requireAuth } from '@/lib/auth'
import { Shell } from './Shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  return (
    <Shell isAdmin={user.role === 'admin'} userLabel={user.name || user.email || 'Account'}>
      {children}
    </Shell>
  )
}
