import { createHash } from 'node:crypto'

// input_hash = SHA-256 of (templateVersion + JSON-stable resolved inputs).
// Logged in pipeline_steps.input_hash for reproducibility [M5].
// Same hash = same call → idempotency skip.

export function buildInputHash(templateVersion: string, inputs: unknown): string {
  const payload = JSON.stringify({ v: templateVersion, i: inputs }, replacer)
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

// Deterministic JSON: sort object keys so key order doesn't break hashes.
function replacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  return value
}
