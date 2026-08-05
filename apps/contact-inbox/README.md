# contact-inbox

Cloudflare Email Worker that delivers kendrix.io contact-form submissions
(`apps/landing` → `/api/contact` → this worker) to the studio inbox via
Email Routing's `send_email` binding. Free; no external vendor.

Deployed: `https://kendrix-contact-inbox.contact-inbox.workers.dev`
(2026-08-05, E2E-verified). Secrets DESTINATION + CONTACT_TOKEN are set;
the landing's `.env.local` carries the matching endpoint + key.

## One-time deploy

1. `npx wrangler login` (browser approval, once per machine)
2. In `wrangler.toml`, replace both `REPLACE_WITH_VERIFIED_DESTINATION`
   with the inbox address verified under kendrix.io → Email Routing →
   Destination addresses (the one hello@/privacy@ forward to).
3. `pnpm deploy` — note the printed `*.workers.dev` URL.
4. `npx wrangler secret put CONTACT_TOKEN` — paste a long random token.
5. In `apps/landing` env (`.env.local` locally, Vercel env in prod):
   - `KENDRIX_CONTACT_ENDPOINT=<the workers.dev URL>`
   - `KENDRIX_CONTACT_API_KEY=<the same token>`

## Verify

```
curl -s -X POST <workers.dev URL> \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Token <token>' \
  -d '{"name":"Test","email":"you@example.com","topic":"Support","message":"ping"}'
```

→ `{"ok":true}` and an email lands in the inbox with Reply-To set to the
sender. Then submit the real form at `/contact` end-to-end.

## Later hardening (optional)

Cloudflare Turnstile on the form + verification here — same account,
already anticipated by decision-log 2026-08-04-001.
