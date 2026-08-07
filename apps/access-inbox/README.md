# access-inbox

Cloudflare Worker behind the landing page's "Get access" form
(`apps/landing` → `/api/subscribe` → this worker). It does two things:

1. **Records** the address in a D1 table — this is the waitlist.
2. **Notifies** the studio inbox via Email Routing, so a signup is visible immediately.

Free, no external vendor, same shape as [contact-inbox](../contact-inbox/README.md).

**Status: built and locally verified, NOT deployed.** Deploying needs `wrangler login`
(browser approval), so the one-time steps below are the owner's. Until they run,
`KENDRIX_LIST_ENDPOINT` stays unset and the form keeps its honest
"requests aren't open just yet" reply rather than pretending to accept signups.

## Why this and not Buttondown

The landing route was written against a hosted list, and the payload here is deliberately
Buttondown-shaped (`email_address` + `email` + `tags`). So moving to a hosted provider later is an
env-var change with **no code edit on either side**, and `GET /export` hands over the accumulated
list as CSV to make that switch cheap. This exists because a form that drops every submission is
worse than either option, and standing up a vendor account isn't something the repo can do for you.

## One-time deploy

```bash
cd apps/access-inbox
npx wrangler login                       # browser approval, once per machine

npx wrangler d1 create kendrix-access    # prints a database_id
#   → paste it into wrangler.toml, replacing REPLACE_WITH_D1_DATABASE_ID
npx wrangler d1 migrations apply kendrix-access --remote

pnpm deploy                              # note the printed *.workers.dev URL
npx wrangler secret put ACCESS_TOKEN     # paste a long random token
npx wrangler secret put DESTINATION      # the inbox hello@/privacy@ forward to
```

Then set both in `apps/landing` env (`.env.local` locally, Vercel env in prod):

- `KENDRIX_LIST_ENDPOINT=<the workers.dev URL>`
- `KENDRIX_LIST_API_KEY=<the same ACCESS_TOKEN>`

`DESTINATION` must already be verified under kendrix.io → Email Routing → Destination addresses,
exactly as for contact-inbox.

## Verify after deploying

```bash
curl -s -X POST <workers.dev URL> \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Token <token>' \
  -d '{"email":"you@example.com","tags":["landing"]}'
```

→ `{"ok":true,"duplicate":false}`, an email in the inbox, and a row in the list. Send it a second
time: `duplicate` flips to `true` and **no second email arrives**. Then submit the real form on the
site end to end.

## Reading the list

```bash
curl -s <workers.dev URL>/export -H 'Authorization: Token <token>'   # CSV
pnpm export                                                          # or straight from D1
```

## Behaviour worth knowing

- **Addresses are trimmed and lower-cased before validation and storage.** A pasted address
  routinely carries a trailing space and the email pattern rejects surrounding whitespace, so
  validating first turned good signups into 400s. Lower-casing is what makes `Ada@…` and `ada@…`
  one person.
- **The email is best-effort; the row is not.** Once the D1 insert commits, a failed notification
  is swallowed and the request still succeeds — losing a signup to a mail problem is the one
  genuinely bad outcome. A storage failure, by contrast, returns 502 so the visitor is told.
- **Re-submitting is a success, not an error.** The route returns the same friendly message, and
  the worker sends no second notification.
- Every route requires `Authorization: Token <ACCESS_TOKEN>`, including `/export`.

## Local development

```bash
printf 'ACCESS_TOKEN=local\nDESTINATION=inbox@example.com\n' > .dev.vars   # gitignored
npx wrangler d1 migrations apply kendrix-access --local
pnpm dev                                                                   # :8787
```

`wrangler dev` binds Send Email locally and writes each message to
`.wrangler/tmp/email/**/*.eml`, so the notification can be read without sending anything. Point the
landing app at it with `KENDRIX_LIST_ENDPOINT=http://localhost:8787` and the matching key.

## Later hardening (optional)

Cloudflare Turnstile on the form, verified here — same account, same note as contact-inbox. Worth
doing before the list is publicly advertised, since the endpoint accepts any well-formed address.
