import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'

// Cloudflare R2 via S3-compat API. Zero egress fees. (docs/02)

function getR2Client() {
  const accountId = process.env['R2_ACCOUNT_ID']
  const accessKeyId = process.env['R2_ACCESS_KEY_ID']
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY']
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 env vars not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // Resilience: retry transient failures (throttling/5xx/timeouts) and never
    // hang — cap connection + per-request time so a blip surfaces fast.
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 60_000 },
  })
}

export function getBucket(): string {
  return process.env['R2_BUCKET_NAME'] ?? 'reels-assets'
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getR2Client()
  await client.send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType }),
  )
  return key
}

export async function downloadBuffer(key: string): Promise<Buffer> {
  const client = getR2Client()
  const res = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }))
  if (!res.Body) throw new Error(`Empty body for R2 key: ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export interface DownloadStream {
  body: Readable
  contentType?: string | undefined
  contentLength?: number | undefined
  contentRange?: string | undefined
  // 206 when a Range was honored, else 200.
  statusCode: 200 | 206
}

// Stream an object straight from R2, honoring an HTTP Range header. Lets the caller pipe bytes to the
// client without buffering the whole object in memory, and gives <video> byte-range seeking (Safari
// refuses to play a source that doesn't advertise range support). R2 parses/validates the range and
// returns 206 + Content-Range, or throws (416) on an unsatisfiable one.
export async function downloadStream(key: string, range?: string | null): Promise<DownloadStream> {
  const client = getR2Client()
  const res = await client.send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key, ...(range ? { Range: range } : {}) }),
  )
  if (!res.Body) throw new Error(`Empty body for R2 key: ${key}`)
  return {
    body: res.Body as Readable,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    statusCode: res.ContentRange ? 206 : 200,
  }
}

export function publicUrl(key: string): string {
  const base = process.env['R2_PUBLIC_URL']
  if (!base) return key
  return `${base.replace(/\/$/, '')}/${key}`
}
