import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

function createDb(url: string) {
  // PgBouncer in transaction-pooling mode can't hold server-side prepared statements across pooled
  // connections, so disable them when routed through a bouncer (set PGBOUNCER=true). Direct-Postgres
  // (local + today's prod) keeps prepared statements for their perf benefit.
  const usingPgBouncer = process.env['PGBOUNCER'] === 'true'
  // Pin every connection's session timezone to UTC. Budget/quota/kill-switch windows are computed as UTC
  // day/month boundaries (Date.UTC in usage.ts) and compared against timestamp columns; without this the
  // session TZ defaults to the server's config, so those windows would silently shift off UTC and mis-bin
  // spend near day/month edges. Set as a startup parameter → applied per connection, pool-safe (no leak).
  const conn = postgres(url, { max: 10, prepare: !usingPgBouncer, connection: { TimeZone: 'UTC' } })
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
