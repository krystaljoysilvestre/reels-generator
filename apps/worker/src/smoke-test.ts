// Provider connectivity smoke-test. Run: pnpm --filter worker smoke
// Uses free/cheap endpoints only. Exits non-zero if any provider fails.
import './env.js'
import { uploadBuffer, downloadBuffer } from '@reels/providers'

const results: Array<{ name: string; ok: boolean; detail: string }> = []

async function check(name: string, fn: () => Promise<string>) {
  try {
    results.push({ name, ok: true, detail: await fn() })
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
}

async function main() {
  // ── R2: upload + read back a tiny object (validates all 4 R2 vars) ──
  await check('Cloudflare R2', async () => {
    const key = '__smoke_test__.txt'
    await uploadBuffer(key, Buffer.from('ok'), 'text/plain')
    const back = await downloadBuffer(key)
    if (back.toString() !== 'ok') throw new Error('round-trip mismatch')
    return `bucket "${process.env['R2_BUCKET_NAME']}" read+write OK`
  })

  // ── OpenAI: auth probe (gen — channel/story/scenes/images) ──
  await check('OpenAI', async () => {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env['OPENAI_API_KEY'] ?? ''}` },
    })
    if (res.status === 401) throw new Error('401 — bad OPENAI_API_KEY')
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    return 'auth OK'
  })

  // ── Anthropic: real 1-token call with the exact model QA uses ──
  await check('Anthropic (Claude — QA)', async () => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env['ANTHROPIC_API_KEY'] ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.status === 401) throw new Error('401 — bad ANTHROPIC_API_KEY')
    if (res.status === 404) throw new Error('404 — model id not found (check claude-sonnet-4-6)')
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    return 'model responded'
  })

  // ── ElevenLabs: try /v1/voices first (voices_read), fall back to /v1/user ──
  await check('ElevenLabs', async () => {
    const headers = { 'xi-api-key': process.env['ELEVENLABS_API_KEY'] ?? '' }
    const voices = await fetch('https://api.elevenlabs.io/v1/voices', { headers })
    if (voices.ok) {
      const v = (await voices.json()) as { voices?: unknown[] }
      return `auth OK — ${v.voices?.length ?? 0} voices available`
    }
    const body = (await voices.text()).slice(0, 200)
    throw new Error(`HTTP ${voices.status} — ${body}`)
  })

  // ── fal.ai: auth probe (video — image→video only) ──
  await check('fal.ai (video)', async () => {
    const key = process.env['FAL_KEY'] ?? ''
    if (!key.includes(':')) throw new Error('FAL_KEY missing id:secret format')
    const res = await fetch('https://queue.fal.run/fal-ai/kling-video/v1.6/standard/image-to-video', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    })
    const body = (await res.text()).slice(0, 200)
    if (res.status === 401 || res.status === 403) throw new Error(`${res.status} — ${body}`)
    return `auth OK (HTTP ${res.status})`
  })

  console.log('\n─── Provider connectivity ───')
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(20)} ${r.detail}`)
  }
  const allOk = results.every((r) => r.ok)
  console.log(allOk ? '\n✓ All providers reachable.\n' : '\n✗ Some failed — fix before running the pipeline.\n')
  process.exit(allOk ? 0 : 1)
}

void main()
