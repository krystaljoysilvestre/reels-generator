import { handlers } from '@/auth'

// Auth.js owns every /api/auth/* route (signin, callback/google, session, csrf, signout, …).
export const { GET, POST } = handlers
