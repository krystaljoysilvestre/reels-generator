import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

function createDb(url: string) {
  const conn = postgres(url, { max: 10 })
  return drizzle(conn, { schema })
}

// Singleton for app usage; tests create their own instance.
let _db: ReturnType<typeof createDb> | undefined

export function getDb() {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL is not set')
  _db ??= createDb(url)
  return _db
}

export type Db = ReturnType<typeof createDb>
