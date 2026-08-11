import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'

// Cloudflare R2 via S3-compat API. Zero egress fees. (docs/02)
//
// COST ACCOUNTING: deliberately NOT attributed per call, and this note is the record of that decision
// rather than an oversight. Every other paid call in this codebase returns a `costCents` (see the
// api-cost-accounting rule); R2 is the one external service that does not, so the reason is written down.
//
// R2 bills per MILLION operations plus stored volume — roughly $4.50/M Class A (writes: PutObject,
// CreateMultipartUpload), $0.36/M Class B (reads: GetObject), $0.015/GB-month stored, egress free
// (Cloudflare R2 pricing, as of 2026-08). Composing one cover is ~2 operations, i.e. of the order of
// 0.001c — three to four orders of magnitude below the cheapest metered call we track (a 1c LLM call), and
// well under the 1c rounding granularity `costCents` uses as an integer. Attributing it would round to
// zero on every call while adding a cost parameter to every storage helper.
//
// What this means when reading per-reel economics: storage is INFRASTRUCTURE here, not per-reel unit cost,
// the same way render/render_qa CPU time is `costCents: 0`. It is a fixed monthly line, and the figure that
// actually grows with the library is STORED VOLUME (~$0.015/GB-month), which is a capacity question rather
// than a per-reel one. Revisit if that bill becomes material — a 1080p long-form render plus its scene
// images is order-of-GB per reel, so this stops being negligible at library scale even though each call
// never will be.

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
    // Retry transient failures (throttling / 5xx / connection errors).
    //
    // requestTimeout does NOT abort a slow request — without throwOnRequestTimeout the SDK only logs
    // "a request has exceeded the configured 60000 ms requestTimeout" and keeps waiting, so maxAttempts
    // never engages either.
    //
    // Uploads now go through multipart (see putObject below), so this 60s ceiling applies PER PART rather
    // than to a whole hundreds-of-MB file — which is the precondition that makes throwOnRequestTimeout a
    // viable follow-up (it would let a genuinely stuck part fail fast and be retried by maxAttempts).
    // Deliberately still NOT enabled: it converts a slow-but-working part into a hard failure, and no
    // upload has actually failed yet. Flip it on its own evidence, not as a side effect of this change.
    //
    // What genuinely bounds a stuck upload today is withJobTimeout in apps/worker/src/pipeline/liveness.ts
    // (per-step ceiling) plus the boot reaper — not anything configured here.
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 60_000 },
  })
}

export function getBucket(): string {
  return process.env['R2_BUCKET_NAME'] ?? 'reels-assets'
}

// Multipart upload settings. A render's final mp4 is hundreds of MB (355 MB measured) and the render writes
// TWO of them, which measured as ~32% of the whole render step (2026-08-04).
//
// ON SPEED, the measurements are messy and worth stating honestly rather than tidying up. A single upload
// measured 0.75–0.89 MB/s, which first looked like a saturated uplink — but the render's TWO concurrent
// uploads then moved 710 MB in 257s (~2.76 MB/s aggregate, 2026-08-04). So the uplink is NOT the ceiling;
// throughput scales with concurrent streams, and the slow single-upload numbers were taken while the box was
// CPU-starved (load ~87), which throttles TLS/stream work. Treat any upload throughput figure measured under
// load as unreliable. The parallelism that clearly pays is at the FILE level (see the overlapped upload in
// render-step.ts); whether partSize/queueSize tuning adds more on top is unmeasured — don't assume either way.
//
// What multipart buys independently of speed, and why it stays regardless:
//   • Streaming (see uploadFile) — a 355 MB file never has to exist as a Buffer in the heap.
//   • The 60s requestTimeout becomes a PER-PART ceiling instead of being unenforceable on a whole file.
//   • leavePartsOnError:false cleans up after a failure instead of leaving billable orphan parts in R2.
//
// 8 MB parts: comfortably above S3/R2's 5 MB minimum, and ~45 parts for a 355 MB file — small enough that a
// part finishes well inside the request timeout even on a slow link, large enough not to be all overhead.
const UPLOAD_PART_SIZE = 8 * 1024 * 1024
const UPLOAD_QUEUE_SIZE = 4 // parts in flight; the win comes from parallelism when one connection is the limit

// Shared upload path. lib-storage's Upload sends a single PutObject when the body is smaller than one part, so
// small assets (images, audio clips) behave exactly as before and only large files take the multipart route.
async function putObject(key: string, body: Buffer | Readable, contentType: string): Promise<string> {
  const upload = new Upload({
    client: getR2Client(),
    params: { Bucket: getBucket(), Key: key, Body: body, ContentType: contentType },
    partSize: UPLOAD_PART_SIZE,
    queueSize: UPLOAD_QUEUE_SIZE,
    leavePartsOnError: false, // abort the multipart upload on failure so R2 doesn't accrue billable orphan parts
  })
  await upload.done()
  return key
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  return putObject(key, body, contentType)
}

// Upload straight from a file on disk. Prefer this over uploadBuffer for anything large: it streams, so a
// 355 MB render never sits in the heap as a Buffer — which matters now that the render step has two big
// uploads in flight at once.
export async function uploadFile(key: string, filePath: string, contentType: string): Promise<string> {
  return putObject(key, createReadStream(filePath), contentType)
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
