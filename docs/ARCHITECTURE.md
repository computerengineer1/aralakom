# Architecture Overview

## 1. Style: secure modular monolith

One Node.js process (Fastify) exposes a JSON API under `/api/*` and serves the
compiled React SPA. Modules are folder-separated with explicit dependencies
(`modules/* → lib/* → db/*`). This matches the team size, deployment reality and
transaction needs of a contracting company; nothing prevents extracting a module
into a service later because all cross-module calls go through the DB layer and
shared libs, not through request globals.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 19 SPA (ar/en, RTL/LTR)   Public site │ Internal app      │
│  - no tokens in localStorage (session cookie is HttpOnly)        │
│  - CSRF token: double-submit (HttpOnly cookie + X-CSRF-Token)    │
└───────────────▲──────────────────────────────────────────────────┘
                │ HTTPS (reverse proxy in production)
┌───────────────┴──────────────────────────────────────────────────┐
│ Fastify server                                                    │
│  helmet/CSP · CORS allowlist · rate limits · multipart limits     │
│  auth plugin: session cookie → user → requirePerm/requireOwner    │
│  modules: auth settings users personnel applications requests     │
│           projects scheduling finance dashboard reports           │
│           notifications audit files                               │
│  libs: rbac money pdf notify files audit ref tokens i18n settings │
└───────▲───────────────▲───────────────────▲──────────────────────┘
        │               │                   │
   PostgreSQL 15    Private file store   SMTP (optional)
   (Drizzle ORM,    data/uploads/        else data/outbox/
    SQL migrations) (outside web root)    (honest fallback)
```

## 2. Cross-cutting decisions

| Concern | Decision |
|---|---|
| IDs | UUIDv4 (`gen_random_uuid()`), unguessable, safe in URLs |
| Timestamps | `TIMESTAMPTZ`, stored UTC, rendered in the user's locale |
| Money | `numeric(18,4)` ↔ JS **string** ↔ `decimal.js`; explicit currency column next to every amount; aggregation helpers throw on currency mismatch |
| Soft delete | `deleted_at` / `archived_at` on personnel, users, customers, projects; audit + history tables are append-only |
| Auth | Server-side sessions (opaque 256-bit token, only SHA-256 hash stored), HttpOnly + SameSite=Lax cookies, Secure in production, 12h TTL, sliding last-seen |
| MFA | TOTP (otplib); partial session until verified; privileged roles are flagged for enrollment |
| CSRF | Double-submit: HttpOnly `lcmp_csrf` cookie paired with `X-CSRF-Token` header; rotated at login; constant-time compare |
| AuthZ | Static role→permission map (`lib/rbac.ts`), deny-by-default, plus resource-level checks (ownership, project team membership, notification ownership) inside handlers |
| Sensitive actions | `requireRecentAuth(15–30min)`: quotation approval, receipt recording/voiding, worker payment approval, MFA disable, company settings save |
| Rate limiting | @fastify/rate-limit: global 300/min/IP; login 12/15min; forgot-password 5/h; public submissions 5/h; tracking 20/10min. In-memory store — use Redis for multi-instance (documented) |
| Validation | Zod schemas on every input; unknown fields stripped (mass-assignment safe); DB constraints (CHECK, UNIQUE, FK) as second line |
| Errors | Central handler: typed codes, no stack traces to clients in production, request IDs in logs |
| Auditing | `lib/audit.ts` writes actor/action/entity/minimal summary with recursive redaction of password/token/secret keys; no update/delete API exists |
| Files | Extension+MIME allowlist, magic-byte sniffing, 10MB default cap, random stored names, `0600` perms, authorized download route only |
| i18n | Full ar/en dictionaries (parity-tested), `dir` switching at `<html>`, mixed-direction helpers (`ltr-span`, `dir=ltr`) for phones/numbers/codes, server-side email catalogue |
| PDF | pdfkit + Arabic shaping (arabic-reshaper) + bidi reordering (bidi-js) + Amiri font; disclaimer printed on every document |

## 3. Entity relationship model (logical)

```
users ──< sessions, password_resets
users(role) ──1:0..1── personnel (engineer/worker accounts)
users ──1:0..1── customers (customer accounts)

categories(kind: trade|engineering|request|other) ──< personnel, applications, requests
services, portfolio_projects                     (public CMS content)

applications ──< application_events              (status history; internal vs applicant visibility)
applications ──0..1→ personnel                   (explicit HR "hired" conversion)
files(owner_type=application) ──> applications

customers ──< requests ──< request_events        (internal vs customer visibility)
requests ──< site_visits ; requests ──0..1→ projects (conversion preserves history)
files(owner_type=request) ──> requests

projects ──< milestones, tasks, issues, project_notes, completion_checklist
projects ──< project_team >── personnel | users  (unique per project+person)
projects ──< expenses >── suppliers
projects ──< assignments (UNIQUE personnel+date ⇒ no double-booking)
projects ──< attendance  (UNIQUE personnel+date; draft→submitted→approved)
personnel ──< worker_payments (advance/payment/settlement; approval states)
personnel ──< personnel_history (field-level change log, sensitive values masked)

quotations ──< quotation_items ; quotations(version, supersedes_id)
quotations → customers, requests?, projects?
contracts → customers, projects?, quotations? ; contracts ──< contract_payments
contracts ──< change_orders
invoices ──< invoice_items ; invoices → customers, projects?, contracts?, quotations?
invoices ──< receipts (UNIQUE(invoice, external_ref) ⇒ duplicate-payment guard;
                       paid_total maintained under row lock FOR UPDATE)
exchange_rates(from,to,rate,date,source)         (never invented; manual/verified source)

notifications(channel, status, attempts, dedupe_key unique)
audit_events(append-only) ; settings(key/jsonb) ; doc_counters(numbering, FOR UPDATE)
```

Physical schema (Drizzle): `server/src/db/schema.ts` — single source of truth;
migrations in `server/src/db/migrations/` (generated SQL, reviewed, transactional runner).

### Referential integrity & concurrency highlights

- `assignments UNIQUE(personnel_id, work_date)` and `attendance UNIQUE(personnel_id, work_date)`
  make scheduling conflicts impossible at the DB level; the API translates 23505 into a
  friendly 409 `SCHEDULING_CONFLICT`.
- Receipt posting locks the invoice row (`SELECT … FOR UPDATE`), re-checks the
  outstanding balance, then updates `paid_total`/status in the same transaction.
  A partial unique index blocks the same bank/check reference twice per invoice.
- Quotation approval uses a conditional `UPDATE … WHERE status='pending_approval'`
  so only the first approver wins (second gets 409 `APPROVAL_CONFLICT`).
- Document numbers (`PRJ-2026-0001`, `QUO-…`, `INV-…`, `EMP-000001`, …) come from
  `doc_counters` advanced atomically (`INSERT … ON CONFLICT DO UPDATE … RETURNING`).
- Request→project conversion and application→personnel conversion run inside
  transactions; no partial states are possible.

## 4. Frontend architecture

- **One design system** (`styles.css` tokens + `components/ui.tsx`): buttons, fields,
  badges/status colors, server-paginated DataTable, modals, confirm dialogs, toasts,
  breadcrumbs, tabs, progress, pure-SVG bar charts, empty/loading/error states.
- **Public site** (`PublicLayout`) and **internal shell** (`AppLayout`) are separate
  layouts; internal nav is permission-filtered (mirrors server RBAC for UX only —
  the server re-checks everything).
- Data fetching via a single `api()` client: cookie credentials, CSRF bootstrap +
  one automatic retry on rotation, normalized `ApiError`, abortable `useApi` hook
  (no duplicate in-flight requests per mount).
- Lazy-loaded route bundles for internal pages; the public bundle stays small.
- RTL: `dir` on `<html>`, logical CSS properties (`inset-inline-*`, `margin-inline`),
  and `.ltr-span dir=ltr` islands for phones/emails/references/numbers inside Arabic text.
- Accessibility: semantic landmarks, skip link, `aria-sort`/`aria-live`, focus-visible
  outlines, 40px touch targets, `prefers-reduced-motion` honored.

## 5. What is intentionally NOT included (honest boundaries)

- **Payroll/tax/statutory calculation** — attendance hours and agreed rates are
  tracked, but official Lebanese payroll, taxes, CNSS/social obligations are NOT
  computed; the balance endpoint prints a disclaimer and requires accountant review.
- **Legally binding contract generation** — contract records + change orders are
  managed, and PDFs are templates explicitly labeled as *not lawyer-approved*.
- **SMS/WhatsApp sending** — the notification layer models channels and consent, but
  only SMTP email is implemented; WhatsApp/SMS require a legitimately configured
  provider (interface + docs prepared, no hardcoded credentials).
- **Automated exchange-rate feeds** — rates are manually entered with source/date,
  or a verified provider must be configured; the app never fabricates rates.
- **Redis-backed rate limiting/sessions** — in-memory stores are used; documented
  swap path for multi-instance deployments.
