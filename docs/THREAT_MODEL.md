# Threat Model & Security Checklist

Scope: OWASP Top 10 (2021) + OWASP API Security Top 10 (2023), mapped to this system.
Asset inventory: worker/engineer personal data, customer contact data, financial
records (quotes/invoices/payments), credentials/sessions, uploaded documents,
company settings, audit trail.

Trust boundaries: (1) internet → reverse proxy → app, (2) public users vs staff,
(3) staff roles vs each other, (4) app → PostgreSQL, (5) app → SMTP, (6) app → disk store.

## Threat matrix and implemented mitigations

| # | Threat (STRIDE/OWASP) | Where it applies | Mitigation implemented | Verified by |
|---|---|---|---|---|
| A01 | **Broken access control / IDOR** | every `/api/*` record route | Deny-by-default RBAC (`lib/rbac.ts`) checked in handlers, not UI; resource-scope checks (notification owner, project team membership, customer link); personnel sensitive fields stripped per role; file downloads authorized per `owner_type` | integration tests (IDOR: cross-user notification 404; role 403 matrix), smoke suite |
| A01 | Privilege escalation via mass assignment | create/update endpoints | Zod explicit schemas; unknown keys dropped; role changes owner-only; self-demotion/self-suspend blocked; `personnelId`/`customerId` links only settable by `users.manage` | users API tests |
| A02 | **Cryptographic failures** | passwords, sessions, tokens | bcrypt (cost 12); sessions/tokens stored **hashed** (SHA-256) — DB leak ≠ session hijack; HTTPS enforced in prod config (`COOKIE_SECURE` required true when `NODE_ENV=production`, server refuses to boot otherwise) | config guardrails; code review |
| A02 | Weak passwords | signup/reset/change | Policy: ≥10 chars, letters+digits, common-password denylist; strength errors returned without leaking policy internals | unit tests |
| A03 | **Injection (SQL)** | all queries | Drizzle parameterized queries; raw `sql` templates always bind parameters (no string concatenation of user input) | code review + integration tests |
| A03 | XSS | SPA + stored content | React auto-escaping; **no `dangerouslySetInnerHTML` anywhere**; CSP `script-src 'self'`; user content rendered as text (`white-space: pre-line`) | grep + CSP header check in smoke |
| A03 | XSS via uploaded files | file downloads | Downloads served with `X-Content-Type-Options: nosniff`, `Content-Disposition` (attachment by default), private files `no-store`; SVG/HTML **not** in the upload allowlist | files.ts allowlist; upload tests |
| A01/A05 | **CSRF** | cookie sessions | Double-submit HttpOnly cookie + `X-CSRF-Token` header on every non-GET `/api` call, constant-time compare, rotated at login/MFA verify | smoke: login without header → 403 |
| A04 | Session fixation / hijack | login | New opaque session per login; logout destroys server row; password change revokes other sessions; SameSite=Lax + HttpOnly + Secure(prod); 12h TTL; suspension/role-change revokes sessions | auth tests |
| A07 | **Identification & authentication failures** (brute force, credential stuffing) | login, reset, MFA | Per-IP rate limit (12/15min login); per-account lockout after 10 failures (15 min); generic 401 for unknown account vs bad password (no enumeration); forgot-password always returns the same message; reset tokens single-use, hashed, 30-min TTL; MFA (TOTP) for privileged users; recent-auth step-up for sensitive actions | smoke (429 + identical errors), integration tests |
| A07 | Account enumeration via tracking | public track endpoints | Reference+token both required; hash compare; identical 404 for wrong ref/token | integration tests |
| A04/A08 | **Insecure design — workflow abuse** | applications, requests, quotes, invoices | Server-side transition maps reject invalid jumps (400 + allowed list); conversion requires accepted state; approval concurrency guards (conditional UPDATE ⇒ 409) | workflow unit tests + integration tests |
| A08 | **Software & data integrity** — duplicate/over payments | receipts | Transaction + `FOR UPDATE` row lock; balance re-check inside txn; partial unique index `(invoice_id, external_ref)`; void reverses under lock | integration tests (409 dup, 400 overpay) |
| A08 | Currency mixing errors | all money paths | decimal.js string math; `sumSameCurrency` throws on mismatch; every report requires explicit currency; conversions require stored rate+source+date | money unit tests, report tests |
| A09 | **Security misconfiguration** | deployment | Helmet: CSP (no inline scripts), `frame-ancestors 'none'`, `object-src 'none'`, nosniff, referrer-policy; CORS **allowlist only** (no wildcard with credentials); error handler hides internals in prod; DB user is least-privilege (not superuser); Docker runs as non-root; health endpoint reveals nothing beyond status | CSP asserted in smoke; prod config refuses insecure env |
| A09 | Public form abuse / spam | apply, request-quote, track, forgot | Rate limits (5/h submissions, 20/10min tracking, 5/h forgot); hidden honeypot field (silent discard, 200 to avoid bot feedback); consent required; Zod max lengths | integration tests (honeypot) |
| A10 | **SSRF** | — | No server-side URL fetching of user-supplied URLs exists (mapUrl is rendered client-side as a link only). If added later: allowlist hosts, block private ranges | code review |
| A06 | Vulnerable components | npm deps | `npm audit` run: 0 critical/high (remaining moderate advisories are dev-only tooling — esbuild inside drizzle-kit CLI; documented); lockfile committed; guidance in DEPLOYMENT.md | audit output recorded in VERIFICATION.md |
| A06 | Secret leakage | repo/runtime | No secrets in code; `.env` git-ignored; `.env.example` placeholders only; audit summaries recursively redact password/token/secret keys; logs never print bodies | grep + audit tests |
| — | **Malicious uploads** | all upload endpoints | Extension+MIME allowlist (PDF/Office/images/text), magic-byte sniffing rejects mismatches, per-file + per-request size caps, random UUID filenames (client name never used as path), `0600` perms, directory outside web root, owner-typed authorization on download | integration tests (disguised file 400, oversized 400/413) |
| — | Path traversal | downloads | Stored name format validated (`^[0-9a-f-]{36}\.ext$`) before disk access | files.ts |
| — | Sensitive data exposure | personnel/applications | Public site never queries personnel; phone/address/compensation/emergency contacts role-gated; print view excludes sensitive fields by default; CSV export permissioned + audited; internal notes never serialized to public track endpoints | integration tests (notes not leaked), rbac tests |
| — | Logging/monitoring gaps | global | Structured pino logs with request IDs; audit events for auth, personnel, applications, requests, projects, quotes, invoices, receipts, exports, settings; delivery status for notifications | audit tests |
| — | DoS via payload/queries | API | 2MB JSON body limit; multipart field/file caps; server-side pagination (max 100/page) on all lists; indexed filters; rate limits | schema review |
| — | Data privacy (Phase 14) | personal data | Data minimization (no national IDs collected); purpose limitation stated in privacy notice; retention guidance (24 months applications; legal retention for finance); correction/deletion request channel recorded for HR action; no third-party AI/external services receive personal data (email only via configured SMTP) | privacy page + data-request endpoint tests |

## Residual risks & required operational controls (documented, not code-fixable here)

1. **Single-instance rate limiting** — in-memory; behind a load balancer with multiple
   instances, move to Redis (`@fastify/rate-limit` supports it) before scaling out.
2. **Backups** — `pg_dump` schedule, offsite copy, encryption at rest and **restore
   drills** are operator responsibilities (runbook in DEPLOYMENT.md).
3. **Lebanese legal compliance** — tax, invoicing, employment and contract
   requirements must be verified by the company's accountant/legal adviser; generated
   documents are templates, not legal instruments.
4. **SMTP credentials** live in the environment; rotate them on staff changes and use
   an app-specific mailbox with least privilege.
5. **Key rotation** — rotate `SESSION_SECRET` (invalidates sessions by design) and DB
   passwords periodically; procedure in DEPLOYMENT.md.
6. **Incident response** — audit log + structured logs give timeline reconstruction;
   define escalation contacts and a disclosure policy before production launch.

## Security checklist (pre-production gate)

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, strong unique `SESSION_SECRET` (server refuses weak config)
- [ ] Database role is non-superuser; separate credentials per environment; not published to the internet
- [ ] TLS terminated at reverse proxy; HSTS enabled there; `TRUST_PROXY=true` only behind a correctly configured proxy
- [ ] `CORS_ORIGINS` unset (same-origin) or exact allowlist
- [ ] `UPLOAD_DIR` on a private volume; web server never serves it statically
- [ ] SMTP configured with dedicated credentials; test delivery; monitor `data/outbox` growth otherwise
- [ ] Owner account created via `setup:owner` with token; MFA enrolled for owner/admin/hr/accountant
- [ ] Demo seed NOT run (`ALLOW_DEMO_SEED=false`); demo accounts absent
- [ ] `npm audit` clean for prod dependencies; dependency update cadence assigned
- [ ] Backup + restore tested; migration rollback rehearsed (see DEPLOYMENT.md)
- [ ] Rate limits reviewed for expected traffic; Redis store if multi-instance
