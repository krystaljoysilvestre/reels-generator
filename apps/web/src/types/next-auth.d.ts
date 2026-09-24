import type { DefaultSession } from 'next-auth'

// App-specific fields carried on the session + JWT (see auth.ts callbacks).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string // 'admin' | 'tester'
      // 'pending' | 'active' | 'suspended', plus 'unavailable' — not a stored value but the signal
      // that the account row could not be read this request (see lib/user-profile).
      status: string
    } & DefaultSession['user']
  }
  interface User {
    role?: string
    status?: string
    authVersion?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    authVersion?: number
  }
}
