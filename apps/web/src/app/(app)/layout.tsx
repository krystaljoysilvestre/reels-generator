import { requireAuth } from '@/lib/auth'
import { Shell } from './Shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()
  return <Shell>{children}</Shell>
}
