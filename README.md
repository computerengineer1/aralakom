# Lebanon Contracting Management Platform (LCMP)

A complete, secure, **bilingual (Arabic RTL / English LTR)** construction & contracting
management platform for a real Lebanese finishing and contracting company.

It serves three connected purposes:

1. **Internal management system** — personnel directory, projects, scheduling,
   attendance, quotations, contracts, invoices, payments, reports, audit log.
2. **Public application portal** — workers, technicians and engineers apply online
   and track their application with an unguessable reference + token.
3. **Public customer portal** — customers request construction/finishing contracts,
   track status, and (optionally) hold accounts for their own requests.

> Brand, company name, contact details, currencies, categories, services and public
> content are all **administrator-configurable** (Settings). The name "Lebanon
> Contracting Management Platform" is a placeholder.

---

## Tech stack (verified compatible versions)

| Layer | Technology |
|---|---|
| Runtime | Node.js **20.x** (verified on 20.20.2) |
| Language | TypeScript 5.9 (strict) |
| Backend | Fastify 5 + official plugins (cookie, helmet, multipart, rate-limit, static) |
| Database | **PostgreSQL 15** (verified on 15.19) |
| ORM / migrations | Drizzle ORM 0.45 + drizzle-kit (SQL migrations, validated) |
| Validation | Zod 4 (server-side, explicit schemas) |
| Passwords | bcryptjs (cost 12); MFA: TOTP via otplib (RFC 6238) |
| Money | decimal.js — `numeric(18,4)` in DB, string-safe in JS, **currencies never mixed** |
| PDF | pdfkit + arabic-reshaper + bidi-js + bundled Amiri font (OFL) for true Arabic PDFs |
| Email | nodemailer (SMTP). If unconfigured: files land in `data/outbox` (never fake "sent") |
| Frontend | React 19 + Vite 7 + react-router 7 + i18next (ar/en), custom design system, no UI kit lock-in |
| Tests | Vitest (unit + API integration vs. isolated test DB), Testing Library (jsdom), Playwright (Chromium E2E), plus an HTTP smoke suite |

Architecture: **modular monolith** — one deployable server exposing `/api/*` and
serving the built SPA. Modules are separated by folder (`server/src/modules/*`),
with shared libs (`server/src/lib/*`).

---

## Quick start (local development)

Prerequisites: **Node 20+**, **npm 10+**, **PostgreSQL 14–16** running locally.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env          # then edit DATABASE_URL etc. (placeholders only in git)

# 3. Create the database (least-privilege role, not the postgres superuser)
sudo -u postgres psql -c "CREATE ROLE lcmp LOGIN PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE lcmp OWNER lcmp;"

# 4. Migrate
npm run db:migrate            # server workspace: drizzle migrations

# 5. Create the initial OWNER account (secure, interactive, no default password)
OWNER_SETUP_TOKEN=$(openssl rand -hex 16) bash -c '
  echo "OWNER_SETUP_TOKEN=$OWNER_SETUP_TOKEN" >> .env
  npm run setup:owner -- --email you@company.com --token "$OWNER_SETUP_TOKEN"'
# password is prompted hidden (never stored in shell history / argv)

# 6. (Optional, development only) demo data
ALLOW_DEMO_SEED=true npm run db:seed
# demo accounts (password Demo!Owner123): owner@demo.local, admin@demo.local,
# hr@demo.local, pm@demo.local, accountant@demo.local, engineer@demo.local

# 7. Run
npm run dev                   # API on :8080 + Vite dev server on :5173 (proxied)
# — or production-style single port —
npm run build && npm start    # API + built SPA on :8080
```

### Quality gates

```bash
npm run typecheck     # tsc strict, both workspaces
npm run lint          # eslint (typescript-eslint), both workspaces
npm test              # vitest: 73 server tests (isolated lcmp_test DB) + 19 web tests
node scripts/smoke.mjs  # 52 end-to-end HTTP checks against a running server
cd web && npx playwright test   # 14 browser E2E tests (Chromium)
npm run build         # production build (server dist + web dist)
```

The server test suite requires a disposable database:
`CREATE DATABASE lcmp_test OWNER lcmp;` (it is dropped/re-migrated/re-seeded each run).

---

## Project structure

```
lcmp/
├── server/                  # Fastify API + SPA host (modular monolith)
│   ├── src/
│   │   ├── app.ts           # app builder: helmet/CSP, CORS allowlist, rate limit, CSRF, errors
│   │   ├── config.ts        # env config with production guardrails
│   │   ├── index.ts         # entrypoint (+ email retry loop, graceful shutdown)
│   │   ├── db/              # schema.ts (single source of truth), migrations/, migrate.ts
│   │   ├── lib/             # rbac, money, password, audit, notify, files, pdf, i18n, settings
│   │   ├── plugins/auth.ts  # session cookie auth, permission decorators, CSRF gate
│   │   ├── modules/         # auth, settings, users, personnel, applications, requests,
│   │   │                    # projects, scheduling, finance, dashboard, reports,
│   │   │                    # notifications, audit, files
│   │   ├── seed.ts          # DEMO seed (refuses unless ALLOW_DEMO_SEED=true)
│   │   └── setup-owner.ts   # secure initial owner CLI (token-gated, no default password)
│   ├── assets/fonts/        # Amiri (Arabic, OFL) + DejaVu (licenses included)
│   └── tests/               # vitest: unit + API integration (real HTTP via inject)
├── web/                     # React SPA
│   ├── src/i18n/            # en.ts / ar.ts full dictionaries + RTL handling
│   ├── src/components/      # design system (DataTable, Modal, forms, icons, charts)
│   ├── src/layouts/         # PublicLayout (site) + AppLayout (internal shell)
│   ├── src/pages/public/    # Home, Services, Projects, About, Contact, Apply,
│   │                        # RequestQuote, Track, Login/Reset, Privacy, Terms, 404
│   ├── src/pages/app/       # Dashboard, Personnel, Applications, Requests, Projects,
│   │                        # Schedule, Payments, Quotations, Invoices, Contracts,
│   │                        # Reports, Users, Settings, Audit, Notifications, Profile, MyWork
│   └── e2e/                 # Playwright browser tests
├── scripts/smoke.mjs        # HTTP end-to-end smoke suite (52 checks)
├── docs/                    # architecture, ERD, threat model, admin guide, deployment,
│                            # verification report
├── data/uploads/            # PRIVATE file storage (outside web root; volume in prod)
├── data/outbox/             # email fallback when SMTP is not configured (dev)
├── Dockerfile, docker-compose.yml
└── .env.example             # placeholders only — never commit real secrets
```

---

## Key behaviors worth knowing

- **Default locale** is configurable (Settings → Company). The UI language switcher
  preserves the current page/context; `dir=rtl` + Arabic typography for العربية.
- **Roles** (server-enforced, deny-by-default): owner, admin, hr, pm, accountant,
  engineer, worker, customer. Hiding UI is never the control — every API checks
  permissions *and* resource ownership/assignment (IDOR-safe).
- **Workflows are validated server-side** (application review states, customer request
  states, quotation draft→approval→sent→accepted, invoice states). Invalid jumps 400.
- **Money**: every amount carries an explicit currency (LBP/USD). Aggregations refuse
  to mix currencies. Exchange rates are entered with source + date — the system never
  invents rates.
- **Files**: allowlisted types, magic-byte sniffing, size limits, random on-disk names,
  stored outside the web root; downloads go through an authorized API route.
- **Audit log** is append-only (no update/delete endpoints exist) and redacts
  secrets. Exports and PDF downloads are audited.
- **Notifications**: in-app always; email only when SMTP is configured. Delivery
  status is honest (`sent` / `failed` / `skipped` with reason), with retry + dedupe.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable` | Copy `.env.example` → `.env` and fill values. |
| `ECONNREFUSED 127.0.0.1:5432` | Start PostgreSQL; check `DATABASE_URL`. |
| Login always 401 | Wrong password, or account locked after 10 failures (15 min). Owner can unlock: `UPDATE users SET failed_login_count=0, locked_until=NULL WHERE email='…';` |
| 403 `CSRF_FAILED` | Refresh the page (client auto-refetches token once); ensure cookies are not blocked. |
| 429 everywhere | Rate limits are per-IP in memory; restart clears them. Behind a proxy set `TRUST_PROXY=true` **and** configure proxy headers correctly. |
| Emails not arriving | Check Settings → System health → SMTP. Without SMTP, mail is written to `data/outbox/*.json`. |
| PDF export fails | Ensure `server/assets/fonts/*` exist (bundled). |
| Seed refuses to run | Set `ALLOW_DEMO_SEED=true` (dev only). |
| Playwright "Target crashed" | Sandboxed hosts: use full Chromium with `--headless=new` (see `web/playwright.config.ts`). |

More: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) ·
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) ·
[docs/VERIFICATION.md](docs/VERIFICATION.md)
