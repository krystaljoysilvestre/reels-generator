# Release runbook

How each part of Kendrix gets built and deployed, how to roll it back, and the checklist for a release. Written for
[#26](https://github.com/krystaljoysilvestre/reels-generator/issues/26) (criteria 2 and 4). The configuration below
was read from the live services on 2026-11-26, not copied from older docs; where it disagrees with an older doc, this
file says so. Architecture and history stay in `specs/phase0-deployment.md`; signup-specific gates stay in
`specs/early-access-launch.md`.

## What deploys, and what triggers it

| Part | Host | Trigger | Built from | Verified |
| --- | --- | --- | --- | --- |
| Studio web (`app.kendrix.io`) | Railway `web`, Singapore | **Manual only**: `scripts/deploy-railway.sh web` or `all` | `deploy/railway/Dockerfile.web`, uploaded from the local working tree | Railway service has no repo source (`source.repo: null`), so no push deploys it |
| Worker | Railway `worker`, Singapore, private | **Manual only**: `scripts/deploy-railway.sh worker` or `all` | `deploy/railway/Dockerfile.worker`, uploaded from the local working tree | Same: no repo source |
| Postgres, Redis | Railway templates | Not deployed from this repo | `postgres-ssl:18`, `redis:8.2` images | Read from Railway |
| Marketing site (`kendrix.io`) | Vercel project `reels-generator-landing` | **Automatic**: every push to `main` deploys production; every other pushed branch gets a preview | `apps/landing` (root directory), Next.js preset, Node 24 | Read from Vercel. No ignored-build-step command is set |
| Waitlist and contact workers | Cloudflare Workers (`kendrix-access-inbox`, `kendrix-contact-inbox`) | Manual: `pnpm run deploy` in `apps/access-inbox` or `apps/contact-inbox` | `wrangler.toml` in each app | **Not verified**: reading deployments needs `CLOUDFLARE_API_TOKEN`, which this machine doesn't have |
| CI | GitHub Actions `ci.yml` | Every PR and every push to `main` | The commit under test | Deploys nothing |
| "Deployed builds" report | GitHub Actions `deployed-builds.yml` | Manual (`workflow_dispatch`) | — | Never run: needs the `RAILWAY_PRODUCTION_TOKEN` secret, not set |

Things that are easy to get wrong:

- **Merging to `main` deploys the marketing site and nothing else.** Studio web and worker change only when someone
  runs the deploy script.
- **Vercel also rebuilds the marketing site for merges that don't touch it.** Observed 2026-11-24: #41, #40 and #46
  (worker, studio and CI changes) each produced a new production deployment. One studio-only merge (#44, files only
  under `apps/web`) was skipped as "Not affected". Treat every merge to `main` as a marketing-site deploy.
- **The deploy script uploads the working directory, not a commit.** It refuses a dirty tree or an unpushed commit, so
  run it from a clean worktree checked out at the release commit, not from a checkout with work in progress.
- **Migrations run only from the web service's pre-deploy command** (`pnpm db:migrate`, verified in Railway). Deploy
  web before worker; `scripts/deploy-railway.sh all` does this.
- **Marketing previews sit behind Vercel sign-in** (deployment protection "all except custom domains"). Checking one
  needs a share link for that specific deployment; a link for one deployment doesn't open another.

### Live settings that differ from older docs or from CI

Recorded, not changed. Each is a founder decision.

| Setting | Live | Elsewhere |
| --- | --- | --- |
| Worker restart policy | `ON_FAILURE`, max 10 retries | `deploy/railway/README.md` says "restart policy set to always" (web is `ALWAYS`) |
| Redis version | 8.2 | CI and `docker-compose.yml` use Redis 7 |
| Postgres version | 18 | CI uses Postgres 16 |
| Node version | Vercel 24.x | CI and both studio Dockerfiles use Node 22 |

## Rollback

| Part | How | Exercised? |
| --- | --- | --- |
| Studio web and worker | Redeploy the previous release commit with the same script, from a clean worktree at that commit: `scripts/deploy-railway.sh all`. Then read `/api/health` for both builds. | The forward path is exercised (2026-11-24, `8c7898e`). No rollback has been run. Railway lists earlier deployments as `REMOVED`, so don't count on re-activating one from the dashboard |
| Database | None. Migrations are additive and replay-safe; never attempt a destructive schema rollback (`specs/phase0-deployment.md`). A release whose code depends on a new migration can't be rolled back past that migration without checking the old code tolerates the new schema | — |
| Marketing site | `vercel rollback` to the previous production deployment (from `apps/landing`, linked to `reels-generator-landing`). **After a rollback, Vercel stops assigning new `main` deployments to `kendrix.io`** until the rollback is undone with `vercel promote` or in the dashboard; the next merge will build but not go live (Vercel's documented Instant Rollback behavior) | Not exercised. Previous production deployment IDs are in the handoff for each release |
| Cloudflare workers | `npx wrangler rollback` in the worker's app directory | Not exercised, not verified |

## Release checklist

Mark each line with the kind of evidence it has: **local** (your machine), **pushed** (on a remote branch), **CI**
(a GitHub Actions run), or **deployed** (read back from the running service). Don't let one kind stand in for
another.

**Before**

1. Pick the release commit. It must be on `main` (or another pushed branch, by explicit choice), with a passing
   `ci.yml` run on that exact commit. Record the run link. *(pushed, CI)*
2. Note what's currently deployed: `curl -s https://app.kendrix.io/api/health` gives `build` and `workerBuild`. Both
   must be known. `unknown` is a blocker, not a pass. That commit is the rollback target. *(deployed)*
3. Diff the two: `git diff --stat <deployed>..<release>`. List new migrations with
   `git diff --name-only <deployed>..<release> -- packages/db/migrations`. For each, confirm it's additive and that the
   currently deployed code tolerates it, because the migration runs before the new code is up. *(local)*
4. Check configuration prerequisites the release introduces: new environment variables on `web` or `worker`, new
   secrets, changed signup mode. Set them before deploying, never print them. Signup changes follow
   `specs/early-access-launch.md`. *(deployed)*
5. Confirm the worker is idle: no render or pipeline job in `railway logs -s worker --lines 40`. The script also
   checks, and asks before restarting a busy worker. *(deployed)*
6. Get founder approval for the deploy, naming the commit. *(—)*

**Deploy**

7. From a clean worktree at the release commit (`git worktree add --detach ../reels-generator-deploy <sha>`, then
   `railway link` to project `kendrix`, environment `production`), run `scripts/deploy-railway.sh all`, or `web` /
   `worker` alone when only one changed. It refuses a dirty tree or an unpushed commit, stamps the build, and waits for
   each service to report it. *(deployed)*

**After: verify each service separately**

8. Web: `/api/health` returns `ok: true` with `build` equal to the release commit. *(deployed)*
9. Worker: `/api/health` `workerBuild` equals the release commit (the worker refreshes it every 5 minutes), and the
   boot log shows `[worker] build=<sha> (source=stamp)`. *(deployed)*
10. Exercise what the release changed on the live service (for example, load the affected page). A health check alone
    doesn't show a feature works. *(deployed)*
11. Marketing site, when the release touches `apps/landing` or merges to `main`: `vercel inspect https://kendrix.io`
    shows the new deployment, and the page loads at phone and desktop widths. *(deployed)*
12. Record in the handoff (`ROADMAP.md` "Current handoff"): release commit, Railway deployment IDs, the health
    response with its UTC time, the CI run link, and the rollback target. Expect the worker's restart to log one
    trend refresh (about 2¢). *(—)*

**If something fails:** roll back as in the table above, then repeat steps 8–11 against the rollback commit.
