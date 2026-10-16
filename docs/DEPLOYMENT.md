# Deployment & Operations Guide

## 1. Prerequisites (production)

- Linux host (Debian 12+/Ubuntu 22.04+ tested) or Docker.
- Node.js **20.x LTS**, npm 10+.
- PostgreSQL **15** (14–16 supported).
- A TLS-terminating reverse proxy (nginx/Caddy/Traefik) — the app must not face
  the internet over plain HTTP.
- Optional: SMTP relay credentials; Redis (only if you scale to multiple app instances).

## 2. Bare-metal deployment

```bash
git clone <your-repo> /opt/lcmp && cd /opt/lcmp
npm ci                                  # lockfile install
cp .env.example .env                    # edit ALL values (see below)
npm run build                           # server dist + web dist

# DB role: least privilege, NOT the postgres superuser
sudo -u postgres psql -c "CREATE ROLE lcmp LOGIN PASSWORD '<strong-unique>';"
sudo -u postgres psql -c "CREATE DATABASE lcmp OWNER lcmp;"

npm run db:migrate                      # applies SQL migrations transactionally
OWNER_SETUP_TOKEN='<random>' npm run setup:owner -- --email owner@company.com --token '<random>'

# run under a process manager (systemd example below)
NODE_ENV=production npm start           # serves API + SPA on :8080
```

### systemd unit (example)

```ini
[Unit]
Description=LCMP
After=network.target postgresql.service

[Service]
Type=simple
User=lcmp
WorkingDirectory=/opt/lcmp/server
EnvironmentFile=/opt/lcmp/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/opt/lcmp/data

[Install]
WantedBy=multi-user.target
```

### Production environment values

| Var | Production value |
|---|---|
| `NODE_ENV` | `production` (server refuses to boot with weak SESSION_SECRET/insecure cookies) |
| `DATABASE_URL` | dedicated least-privilege role; unique password |
| `SESSION_SECRET` | ≥ 64 random hex (`openssl rand -hex 32`) |
| `COOKIE_SECURE` / `CSRF_COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` **only** behind your proxy (and set forwarded headers there) |
| `APP_BASE_URL` | public https URL (used in emails) |
| `UPLOAD_DIR` | private path outside any web root, mode 750, owned by the app user |
| `CORS_ORIGINS` | empty (same-origin) or exact allowlist |
| `SMTP_*`, `MAIL_FROM` | real provider credentials (dedicated mailbox) |
| `ALLOW_DEMO_SEED` | `false` (seed must refuse to run) |

### nginx reverse proxy (TLS + headers)

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name app.company.com;
  ssl_certificate     /etc/letsencrypt/live/app.company.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.company.com/privkey.pem;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  client_max_body_size 12m;             # ≥ MAX_UPLOAD_MB

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
  }
}
server { listen 80; server_name app.company.com; return 301 https://$host$request_uri; }
```

## 3. Docker deployment

```bash
# .env next to docker-compose.yml (compose reads it automatically)
POSTGRES_PASSWORD=<strong-unique>
SESSION_SECRET=<openssl rand -hex 32>
APP_BASE_URL=https://app.company.com
OWNER_SETUP_TOKEN=<openssl rand -hex 16>
# SMTP_* optional

docker compose up -d --build
docker compose exec app node dist/db/migrate.js   # or: npx tsx src/db/migrate.ts on host mount
docker compose exec -e OWNER_SETUP_TOKEN=$OWNER_SETUP_TOKEN app \
  node dist/setup-owner.js --email owner@company.com --token "$OWNER_SETUP_TOKEN"
```

Notes: the `uploads` volume persists private files; `pgdata` persists the database.
The app container runs as non-root, binds 8080 on loopback only — put the reverse
proxy in front. Never publish the `db` port to the internet.

## 4. Migrations & rollback strategy

- Migrations are **generated SQL** in `server/src/db/migrations/` — review every
  generated file before deploying (drizzle-kit is configured `strict`).
- The runner applies pending migrations in a transaction; a failure rolls back that
  migration and leaves previous ones intact.
- **Forward-first policy**: prefer additive migrations (new columns/tables) so the
  previous app version keeps running. For destructive changes: deploy in two steps
  (expand → migrate data → contract), and take a fresh backup before the contract step.
- Rollback: restore code to the previous tag; roll the database back from the
  pre-deploy backup (drizzle does not auto-generate down-migrations by design —
  reviewed SQL + backups is the safety net).
- Never edit an applied migration file; add a new one.

## 5. Backup & restore (runbook)

```bash
# Nightly (cron): database + uploads + env (secrets separately!)
sudo -u postgres pg_dump -Fc lcmp > /backup/lcmp-$(date +%F).dump
tar -C /opt/lcmp/data -czf /backup/uploads-$(date +%F).tgz .
# Copy offsite; encrypt at rest (e.g. age/gpg with keys stored OUTSIDE the backup).

# Restore drill (quarterly — a backup that isn't tested isn't a backup)
sudo -u postgres psql -c "CREATE DATABASE lcmp_restore OWNER lcmp;"
pg_restore -d lcmp_restore --no-owner /backup/lcmp-YYYY-MM-DD.dump
DATABASE_URL=postgres://lcmp:...@127.0.0.1:5432/lcmp_restore npm run db:migrate  # should be no-op
# boot the app against lcmp_restore and spot-check dashboards
```

Retention suggestion: 14 daily, 8 weekly, 12 monthly. Financial data retention must
satisfy Lebanese accounting requirements — confirm with the company accountant.

## 6. Logging & monitoring

- Structured JSON logs (pino) on stdout with request IDs; `LOG_LEVEL=info` in prod.
- Health endpoint: `GET /api/health` → `{status, db, uptime}` (safe to poll; expose
  only internally or via authenticated uptime checks).
- Alert on: process restarts, 5xx rate, `db != ok`, disk usage of `UPLOAD_DIR`,
  growth of `data/outbox` (means SMTP is failing/unconfigured), repeated
  `auth.login_failed`/`auth.login_locked` in the audit log, 429 spikes.
- Ship logs to your aggregator; **never** log request bodies (the app doesn't).

## 7. Secrets & key rotation

- Secrets live only in `.env` / orchestrator secret stores — never in git (verified:
  repo contains `.env.example` placeholders only).
- Rotate `SESSION_SECRET` (forces re-login for everyone — schedule it), DB password,
  SMTP password on staff changes and at least yearly.
- `OWNER_SETUP_TOKEN` is single-purpose: delete it from `.env` after initial setup.

## 8. Dependency updates & vulnerability response

```bash
npm audit --omit=dev          # production surface must be clean
npm audit                     # full tree; dev-only advisories evaluated case by case
npm outdated                  # monthly review
```

- Cadence: security patches immediately (rebuild + redeploy), minor updates monthly,
  majors quarterly with changelog review.
- After updates: `npm run typecheck && npm run lint && npm test && npm run build`,
  then `node scripts/smoke.mjs` against a staging instance.
- Current known state (recorded in VERIFICATION.md): 0 critical/high; 4 moderate
  advisories are dev-only (esbuild inside the drizzle-kit CLI dev server surface).

## 9. Scaling notes

- Single instance is sufficient for a contracting company workload. For multiple
  instances: move rate-limit store to Redis (`@fastify/rate-limit` `redis` option),
  keep sessions in Postgres (already shared), put uploads on shared/object storage
  with the same private-access pattern.
- Do not enable any shared HTTP caching of `/api/*` responses (authorization-sensitive).

## 10. Deployment checklist

- [ ] Backups taken & restore-tested
- [ ] `.env` production values verified (secure cookies, strong secret, real DB role)
- [ ] `npm ci && npm run build` from a clean checkout
- [ ] Migrations reviewed & applied; app boots; `/api/health` = ok
- [ ] Owner created via `setup:owner` (token), MFA enrolled, demo seed NOT run
- [ ] TLS + HSTS at proxy; HTTP→HTTPS redirect; proxy headers + `TRUST_PROXY` correct
- [ ] `data/uploads` volume private (750, app-user owned), not web-served
- [ ] SMTP test email delivered (or outbox fallback acknowledged)
- [ ] Smoke suite passes against staging: `node scripts/smoke.mjs https://staging…`
- [ ] Monitoring/alerts wired; log shipping verified
- [ ] Rollback plan + responsible person identified

## 11. Troubleshooting (production)

| Symptom | First checks |
|---|---|
| App won't boot | Logs: missing env (`SESSION_SECRET`, `COOKIE_SECURE`), DB reachable? |
| 500s after deploy | Did migrations run? Version of code vs DB schema; check request-ID in logs |
| Logins fail for everyone | Time skew breaks TOTP (NTP); or sessions table locked; check audit `auth.*` |
| Emails missing | Settings→health SMTP flag; `data/outbox`; provider logs; `notifications` table status/lastError |
| Uploads fail | Proxy `client_max_body_size`, `MAX_UPLOAD_MB`, disk space/permissions on `UPLOAD_DIR` |
| SPA assets return HTML after redeploy | The build replaced `web/dist` while the old process was running. Always **restart the app after `npm run build`** (asset serving stats files under the root captured at boot). |
| Slow lists | `EXPLAIN` the query; confirm indexes present (migrations create them); check N+1 regressions in logs |
