import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'

function encryptionKey(): Buffer {
  const encoded = process.env['PUBLISHING_CREDENTIALS_KEY']
  if (!encoded) throw new Error('PUBLISHING_CREDENTIALS_KEY is not configured')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('PUBLISHING_CREDENTIALS_KEY must be a base64-encoded 32-byte key')
  return key
}

export function publishingCredentialsConfigured(): boolean {
  try {
    encryptionKey()
    return true
  } catch {
    return false
  }
}

export function encryptCredential(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptCredential(value: string): string {
  const [version, iv, tag, ciphertext] = value.split('.')
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted credential')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

type OAuthState = { channelId: string; userId: string; nonce: string; expiresAt: number }

function stateSecret(): string {
  const secret = process.env['AUTH_SECRET']
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return secret
}

export function signOAuthState(payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyOAuthState(state: string): OAuthState | null {
  const [body, signature] = state.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', stateSecret()).update(body).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
    if (!parsed.channelId || !parsed.userId || !parsed.nonce || parsed.expiresAt < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}
