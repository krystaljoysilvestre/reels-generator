import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

function createDb(url: string) {
  // PgBouncer in transaction-pooling mode can't hold server-side prepared statements across pooled
  // connections, so disable them when routed through a bouncer (set PGBOUNCER=true). Direct-Postgres
  // (local + today's prod) keeps prepared statements for their perf benefit.
  const usingPgBouncer = process.env['PGBOUNCER'] === 'true'
  const conn = postgres(url, { max: 10, prepare: !usingPgBouncer })
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
