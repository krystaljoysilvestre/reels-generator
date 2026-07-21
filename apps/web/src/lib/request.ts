// Best-effort client IP for rate-limiting. Behind a proxy/CDN the first x-forwarded-for hop is the
// client; falls back to x-real-ip, then a constant so the limiter still buckets (coarsely) in dev where
// no forwarding header is present. Not used for anything security-critical beyond rate-limit keying.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
