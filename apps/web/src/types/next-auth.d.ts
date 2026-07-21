import type { DefaultSession } from 'next-auth'

// App-specific fields carried on the session + JWT (see auth.ts callbacks).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string // 'admin' | 'tester'
      status: string // 'pending' | 'active' | 'suspended'
    } & DefaultSession['user']
  }
  interface User {
    role?: string
    status?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
  }
}
