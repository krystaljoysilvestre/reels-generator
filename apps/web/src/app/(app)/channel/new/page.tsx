import { requireAuth } from '@/lib/auth'
import { NewChannelWizard } from './NewChannelWizard'

export const dynamic = 'force-dynamic'

export default async function NewChannelPage() {
  await requireAuth()
  return <NewChannelWizard />
}
