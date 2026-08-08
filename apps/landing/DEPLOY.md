# Deploying kendrix.io

From "I own the domain and this repo" to a live site. Roughly 45 minutes, most of it waiting for
DNS.

Starting point assumed: kendrix.io registered at Cloudflare, this repo on GitHub, nothing deployed.

**Read this first — the one thing that can actually break something.** kendrix.io already runs
Cloudflare **Email Routing**: `hello@` and `privacy@` forward to a real inbox, and the contact form's
worker sends mail *as* `contact-form@kendrix.io`. That depends on the domain's **MX** and Email
Routing **TXT** records. Adding website DNS records below is safe, but if you ever "clean up" the
zone and delete those, the contact form silently stops delivering and replies to your published
address bounce. Add records; don't remove them.

---

## Phase 1 — the waitlist worker (do this first, ~10 min)

Do this before the site so the "Get access" form works the moment kendrix.io is live. Skip it and
the site still deploys fine — the form just says "requests aren't open just yet" and drops nothing,
because there's nowhere for it to drop things *to*.

Full detail in [scripts-adjacent README](../access-inbox/README.md); the short version:

```bash
cd apps/access-inbox
npx wrangler login                       # opens a browser, once per machine

npx wrangler d1 create kendrix-access    # prints a database_id
#   → paste that id into wrangler.toml, replacing REPLACE_WITH_D1_DATABASE_ID
npx wrangler d1 migrations apply kendrix-access --remote

# `pnpm run deploy`, not `pnpm deploy` — pnpm has a built-in command by that name, and the bare
# form silently does nothing (ERR_PNPM_NOTHING_TO_DEPLOY).
pnpm run deploy                          # note the printed *.workers.dev URL
npx wrangler secret put ACCESS_TOKEN     # paste a long random string — keep it, you need it twice
npx wrangler secret put DESTINATION      # the inbox hello@ already forwards to
```

Verify before moving on:

```bash
curl -s -X POST <workers.dev URL> \
  -H 'Content-Type: application/json' -H 'Authorization: Token <ACCESS_TOKEN>' \
  -d '{"email":"you@example.com","tags":["test"]}'
```

Expect `{"ok":true,"duplicate":false}` and an email. Send it twice — the second returns
`"duplicate":true` and sends nothing.

Keep two values for Phase 4: the **workers.dev URL** and the **ACCESS_TOKEN**.

---

## Phase 2 — deploy the site to Vercel (~10 min)

Vercel because this is a Next.js app and it's what the repo already assumes. The domain stays
registered and DNS-hosted at Cloudflare either way — you are not moving the domain.

1. Push to GitHub if you haven't. Vercel deploys from the repo, not from your laptop.
2. [vercel.com/new](https://vercel.com/new) → import this repository.
3. **The one setting that matters: set Root Directory to `apps/landing`.** This is a monorepo; left
   at the repo root the build will fail or build the wrong app. Vercel then auto-detects Next.js and
   fills in the build command and output directory correctly — leave those alone.
4. Deploy. First build takes 2–4 minutes.

`apps/landing` has no workspace dependencies (just `next`, `react`, `react-dom`), so it compiles
standalone — no `--filter` gymnastics, and none of the DB/worker/Redis setup the rest of the repo
needs. Vercel picks pnpm up from `pnpm-lock.yaml` automatically.

You'll get a `*.vercel.app` URL. **Open it and confirm the site loads.** The forms will report
"not open just yet" — correct at this stage, both endpoints are unset.

> If the build fails on the package manager, add `"packageManager": "pnpm@9.0.0"` to the **root**
> `package.json` and redeploy. The lockfile is v9 so Vercel normally infers this correctly; this is
> the fallback, not a required step.

---

## Phase 3 — point kendrix.io at it (~10 min + DNS propagation)

1. In Vercel: **Project → Settings → Domains → Add**, enter `kendrix.io`. Add `www.kendrix.io` too
   and let Vercel redirect one to the other (it offers this).
2. Vercel now shows you the exact DNS record(s) to create. **Use what Vercel displays**, not values
   from memory or a blog post — they change, and a wrong apex record is the most common failure here.
3. In Cloudflare: **kendrix.io → DNS → Records → Add record**, entering exactly what Vercel showed.
   Cloudflare supports CNAME flattening at the apex, so a `CNAME` on the root usually works.
4. **Set the proxy status to "DNS only" (grey cloud), not "Proxied" (orange).** Vercel issues and
   renews the TLS certificate itself; leaving Cloudflare's proxy on puts two CDNs in series and is
   the usual cause of certificate errors and redirect loops on a fresh Vercel domain.
5. Wait. Vercel's domain page flips to **Valid Configuration** once it sees the records — usually
   minutes, occasionally up to an hour.

Again: add records, don't delete any. The MX and Email Routing TXT entries must survive.

---

## Phase 4 — environment variables (~5 min)

**Project → Settings → Environment Variables.** Add all four to **Production** (and Preview, if you
want the forms live on preview builds):

| Variable | Value |
|---|---|
| `KENDRIX_CONTACT_ENDPOINT` | the contact worker's `workers.dev` URL |
| `KENDRIX_CONTACT_API_KEY` | its `CONTACT_TOKEN` |
| `KENDRIX_LIST_ENDPOINT` | the access worker's `workers.dev` URL (Phase 1) |
| `KENDRIX_LIST_API_KEY` | its `ACCESS_TOKEN` (Phase 1) |

The two contact values already exist in your local `apps/landing/.env.local` — that file is
gitignored and never reaches Vercel, which is why they must be entered by hand.

**Then redeploy.** Environment variables are read at build time; adding them does not retroactively
apply to the deployment that's already live. **Deployments → ⋯ → Redeploy.**

---

## Phase 5 — verify live (~5 min)

```bash
curl -sI https://kendrix.io | head -1          # 200, and https not http
curl -s  https://kendrix.io/robots.txt | head -3
curl -s  https://kendrix.io/sitemap.xml | head -5
curl -sI https://kendrix.io/og.png | head -1
```

Then by hand, because these are the parts a curl can't judge:

- Submit the **access form**. Expect the green confirmation, an email to your inbox, and the address
  in the list (`curl -s <access worker>/export -H 'Authorization: Token <ACCESS_TOKEN>'`).
- Submit the **contact form** at `/contact`. Expect an email whose Reply-To is the address you typed.
- Paste `https://kendrix.io` into Slack, iMessage or a draft X post and confirm the share card
  renders — that's the fastest real check that OG tags and `og.png` are being served correctly.

---

## Phase 6 — get indexed (~10 min, then it's out of your hands)

The SEO/AEO groundwork is already in the code; this is the part that has to happen after a real
domain exists.

1. [Google Search Console](https://search.google.com/search-console) → add `kendrix.io` as a
   **Domain** property. It'll ask for a TXT record — add it in Cloudflare (again: add, don't remove).
2. **Sitemaps → submit `https://kendrix.io/sitemap.xml`.**
3. **URL Inspection → `https://kendrix.io` → Request Indexing.** Same for `/about`.
4. Optional: repeat at [Bing Webmaster Tools](https://www.bing.com/webmasters) — it's the index
   several assistants read from, so it's worth the five minutes.
5. Confirm the structured data parses:
   [Rich Results Test](https://search.google.com/test/rich-results) on `https://kendrix.io`. Expect
   Organization, WebSite, SoftwareApplication and FAQPage.

Indexing takes days to weeks. Nothing is wrong if the site doesn't appear immediately.

---

## Rollback

Vercel keeps every deployment. **Deployments → pick the last good one → Promote to Production.**
DNS doesn't change, so it takes effect immediately.

---

## What is deliberately not here

- **Analytics.** None is installed, and the privacy policy is written to match. Adding one means
  updating that page.
- **A staging domain.** Preview deployments already give every branch a URL.
- **Cloudflare Pages instead of Vercel.** It would work via an adapter, but Next.js on Vercel is the
  path with the fewest moving parts, and the repo's own docs already assume it.
