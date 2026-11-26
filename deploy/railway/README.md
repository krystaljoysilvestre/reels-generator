# Railway operations

The accepted architecture and rollback boundary live in `specs/phase0-deployment.md`. Deploy triggers, rollback and
the release checklist live in `specs/release-runbook.md`.

## Services

| Service | Public | Image | Responsibility |
| --- | --- | --- | --- |
| `web` | `app.kendrix.io` | `Dockerfile.web` | Next.js UI, API, health check, enqueueing |
| `worker` | No | `Dockerfile.worker` | BullMQ pipeline, render, scheduler, private Bull Board |
| `Postgres` | No | Railway template | Durable application and cost ledger |
| `Redis` | No | Railway template | BullMQ only; rebuilt empty during migration |

All four services run in Railway's Singapore region. Web and worker use private reference variables for Postgres
and Redis. Only web receives a domain.

## Deployment invariants

- Run database migrations from the web service's pre-deploy command only.
- Keep exactly one worker replica and `RENDER_CONCURRENCY=1` until measured evidence requires a split.
- Do not deploy or restart the worker while a render job is active.
- Keep serverless sleeping disabled and restart policy set to always.
- Set the web health check to `/api/health`.
- Keep Bull Board, Postgres, Redis, and the worker private.
- Preserve the $30 usage alert and $50 monthly compute cap.
- Never copy `.env.local` into an image or print Railway variables.

## Data migration

1. Stop enqueueing new work and verify BullMQ has no active jobs.
2. Create a timestamped local `pg_dump` in ignored runtime storage.
3. Import the dump into the empty Railway Postgres service.
4. Run replay-safe migrations once.
5. Start the hosted worker against an empty Railway Redis service; it recreates repeatable schedules.
6. Compare row counts and spend totals before accepting the migration.

The local database remains untouched through the canary. Redis is deliberately not copied.

## Rollback triggers

Keep `app.kendrix.io` on the local tunnel until all of these pass on the Railway-generated domain:

- `/api/health` returns 200;
- operator sign-in and protected-page redirect behavior are correct;
- migrated channel, reel, publication, and spend totals match;
- one provider-free queue job completes and survives a worker restart; and
- R2 reads and writes succeed without exposing storage credentials.

After DNS cutover, roll back immediately if health fails twice, sign-in cannot complete, private services are
publicly reachable, or queue processing loses or duplicates work.
