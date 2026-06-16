import * as Sentry from '@sentry/node'

export function initSentry(): void {
  const dsn = process.env['SENTRY_DSN']
  if (!dsn) {
    console.warn('[sentry] SENTRY_DSN not set — error reporting disabled')
    return
  }
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0.1,
  })
  console.log('[sentry] initialized')
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) scope.setContext('pipeline', context)
    Sentry.captureException(err)
  })
}
