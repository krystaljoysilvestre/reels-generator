# Single-operator deployment

This is Kendrix's free Phase 0 deployment target: one production build on the founder's Mac, with durable local
Postgres and Redis, a supervised web process, and a supervised all-role worker. It is deliberately not the
multi-user hosting architecture.

## Boundary

- Web listens only on `127.0.0.1:3000`.
- Postgres (`5433`), Redis (`6380`), and Bull Board (`3001`) stay on loopback.
- Only the web process may be exposed through Cloudflare Tunnel.
- The `kendrix-cloudflared` connector uses Docker's default bridge network and reaches the loopback-only web
  service through `host.docker.internal`; it does not share the host network.
- Docker volumes preserve database and queue data across restarts.
- The Mac must remain powered, awake, online, and signed in. If that cannot be guaranteed during the acceptance
  lap, move the same services to always-on hosting rather than weakening the gate.

## Build and install

```bash
bash scripts/local-prod/build.sh
bash scripts/local-prod/install-launchd.sh
bash scripts/local-prod/install-tunnel.sh
bash scripts/local-prod/status.sh
```

The build script starts the data services, installs the lockfile exactly, migrates the database, creates the web
production build, and type-compiles the worker. The worker runs its TypeScript entrypoint without watch mode
because the monorepo's internal packages intentionally export source files. The installer registers login-time
`launchd` services and restarts them after a crash.

The tunnel installer expects the remotely managed `kendrix-local` connector token at
`.local-prod/cloudflared/token` with mode `0600`. The token is runtime state, is ignored by Git, and must never be
committed or printed. The connector publishes only `https://app.kendrix.io` to
`http://host.docker.internal:3000`, is named `kendrix-cloudflared`, and restarts unless explicitly stopped.

## Operate

```bash
bash scripts/local-prod/status.sh
tail -f .local-prod/logs/web.log .local-prod/logs/worker.log
```

Bull Board is an emergency operator surface at `http://127.0.0.1:3001/queues`. It has no authentication and must
never be placed behind the public tunnel.

The public health endpoint reports only `{"ok":true}` after both Postgres and Redis are ready. It does not expose
tenant data, mutate state, or invoke a paid provider. The status script checks the local app, the private queue
monitor, the connector container, and the public endpoint.

After a code change, run the build script and restart the two application services:

```bash
launchctl kickstart -k "gui/$(id -u)/com.kendrix.web"
launchctl kickstart -k "gui/$(id -u)/com.kendrix.worker"
```

## Roll back supervision

```bash
bash scripts/local-prod/uninstall-launchd.sh
```

This removes only the three Kendrix launch agents. It leaves the Postgres and Redis containers and their volumes
intact. The tunnel container is independent and may be stopped with `docker stop kendrix-cloudflared`; its
Cloudflare route and local token remain intact for recovery.
