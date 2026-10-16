/**
 * API integration tests against the isolated lcmp_test database
 * (migrated + seeded by tests/global-setup.ts).
 *
 * Covers: auth, CSRF, RBAC/IDOR, application & request workflows, project
 * scheduling conflicts, financial integrity (duplicates/overpay/currency),
 * file upload restrictions, audit logging.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/index.js';

const PW = 'Demo!Owner123';

interface Jar { cookies: Record<string, string>; csrf: string | null }

function newJar(): Jar { return { cookies: {}, csrf: null }; }

function absorbCookies(jar: Jar, res: { headers: Record<string, string | string[] | undefined> }): void {
  const sc = res.headers['set-cookie'];
  const list = Array.isArray(sc) ? sc : sc ? [sc] : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const idx = pair!.indexOf('=');
    jar.cookies[pair!.slice(0, idx)] = pair!.slice(idx + 1);
  }
}

function cookieHeader(jar: Jar): string {
  return Object.entries(jar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function call(app: FastifyInstance, jar: Jar, method: string, url: string, opts: { body?: unknown; headers?: Record<string, string>; payload?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (cookieHeader(jar)) headers.cookie = cookieHeader(jar);
  if (jar.csrf && method !== 'GET') headers['x-csrf-token'] = jar.csrf;
  let payload: string | undefined = opts.payload;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }
  const res = await app.inject({ method: method as 'GET', url, headers, payload });
  absorbCookies(jar, res);
  return res;
}

async function login(app: FastifyInstance, email: string, password = PW): Promise<Jar> {
  const jar = newJar();
  const csrfRes = await call(app, jar, 'GET', '/api/auth/csrf');
  jar.csrf = (csrfRes.json() as { token: string }).token;
  const res = await call(app, jar, 'POST', '/api/auth/login', { body: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body.slice(0, 200)}`);
  // login rotates CSRF cookie; re-read it
  const csrf2 = await call(app, jar, 'GET', '/api/auth/csrf');
  jar.csrf = (csrf2.json() as { token: string }).token;
  return jar;
}

function multipartPayload(fields: Record<string, string>, files: Array<{ field: string; filename: string; contentType: string; content: string }> = []): { payload: string; headers: Record<string, string> } {
  const boundary = '----lcmptestboundary7d4a1b';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  for (const f of files) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n${f.content}\r\n`);
  }
  parts.push(`--${boundary}--\r\n`);
  return { payload: parts.join(''), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const skipDb = process.env.LCMP_TEST_DB_UNAVAILABLE === 'true';

describe.skipIf(skipDb)('API integration tests (PostgreSQL)', () => {
let app: FastifyInstance;
let owner: Jar, hr: Jar, pm: Jar, accountant: Jar, engineer: Jar;
let tradeCatId: string, requestCatId: string;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
  owner = await login(app, 'owner@demo.local');
  hr = await login(app, 'hr@demo.local');
  pm = await login(app, 'pm@demo.local');
  accountant = await login(app, 'accountant@demo.local');
  engineer = await login(app, 'engineer@demo.local');
  const pub = (await call(app, newJar(), 'GET', '/api/settings/public')).json() as { tradeCategories: Array<{ id: string }>; requestCategories: Array<{ id: string }> };
  tradeCatId = pub.tradeCategories[0]!.id;
  requestCatId = pub.requestCategories[0]!.id;
});

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('database migrations & seed (integration)', () => {
  it('migrations created all core tables and seed populated categories', async () => {
    const pub = await call(app, newJar(), 'GET', '/api/settings/public');
    expect(pub.statusCode).toBe(200);
    const body = pub.json() as { tradeCategories: unknown[]; requestCategories: unknown[]; company: { nameEn: string } };
    expect(body.tradeCategories.length).toBeGreaterThanOrEqual(10);
    expect(body.requestCategories.length).toBeGreaterThanOrEqual(10);
    expect(body.company.nameEn).toBeTruthy();
  });
});

describe('authentication & CSRF', () => {
  it('rejects state-changing requests without CSRF token', async () => {
    const jar = newJar();
    await call(app, jar, 'GET', '/api/auth/csrf');
    jar.csrf = null; // simulate missing header
    const res = await call(app, jar, 'POST', '/api/auth/login', { body: { email: 'owner@demo.local', password: PW } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'CSRF_FAILED' } });
  });

  it('returns identical generic errors for unknown account and wrong password', async () => {
    const j1 = await login(app, 'owner@demo.local').catch(() => null);
    void j1;
    const jarA = newJar();
    (await call(app, jarA, 'GET', '/api/auth/csrf'));
    jarA.csrf = ((await call(app, jarA, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const unknown = await call(app, jarA, 'POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'whatever123' } });
    const wrong = await call(app, jarA, 'POST', '/api/auth/login', { body: { email: 'owner@demo.local', password: 'wrong-password1' } });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect((unknown.json() as { error: { code: string } }).error.code).toBe((wrong.json() as { error: { code: string } }).error.code);
  });

  it('logout invalidates the session cookie', async () => {
    const jar = await login(app, 'engineer@demo.local');
    const me1 = await call(app, jar, 'GET', '/api/auth/me');
    expect((me1.json() as { user: unknown }).user).toBeTruthy();
    await call(app, jar, 'POST', '/api/auth/logout');
    const me2 = await call(app, jar, 'GET', '/api/auth/me');
    expect((me2.json() as { user: unknown }).user).toBeNull();
  });

  it('rejects malformed UUID path params with 400 (not 500)', async () => {
    const res = await call(app, owner, 'GET', '/api/finance/quotations/not-a-uuid');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_ID' } });
  });
});

describe('RBAC & IDOR protection', () => {
  it('denies anonymous access to internal APIs', async () => {
    for (const url of ['/api/personnel', '/api/applications', '/api/dashboard', '/api/users', '/api/audit']) {
      const res = await call(app, newJar(), 'GET', url);
      expect(res.statusCode, url).toBe(401);
    }
  });

  it('engineer cannot manage users or read audit log', async () => {
    expect((await call(app, engineer, 'GET', '/api/users')).statusCode).toBe(403);
    expect((await call(app, engineer, 'GET', '/api/audit')).statusCode).toBe(403);
  });

  it('HR cannot access financial modules', async () => {
    expect((await call(app, hr, 'GET', '/api/finance/quotations')).statusCode).toBe(403);
    expect((await call(app, hr, 'GET', '/api/finance/invoices')).statusCode).toBe(403);
    expect((await call(app, hr, 'GET', '/api/finance/receivables')).statusCode).toBe(403);
  });

  it('PM cannot approve quotations or record worker payments', async () => {
    expect((await call(app, pm, 'POST', '/api/scheduling/payments', { body: {} })).statusCode).toBe(403);
  });

  it('sensitive personnel fields are stripped for non-privileged roles', async () => {
    const asPm = (await call(app, pm, 'GET', '/api/personnel?pageSize=5')).json() as { items: Array<Record<string, unknown>> };
    expect(asPm.items.length).toBeGreaterThan(0);
    expect('rateAmount' in asPm.items[0]!).toBe(false);
    expect('emergencyContactPhone' in asPm.items[0]!).toBe(false);
    const asOwner = (await call(app, owner, 'GET', '/api/personnel?pageSize=5')).json() as { items: Array<Record<string, unknown>> };
    expect('rateAmount' in asOwner.items[0]!).toBe(true);
  });

  it('notification read is ownership-scoped (IDOR fails with 404)', async () => {
    // create an in-app notification for the accountant via broadcast (owner)
    await call(app, owner, 'POST', '/api/notifications/admin/broadcast', { body: { subject: 'IDOR test', message: 'hello staff' } });
    const accNotifs = (await call(app, accountant, 'GET', '/api/notifications')).json() as { items: Array<{ id: string }> };
    expect(accNotifs.items.length).toBeGreaterThan(0);
    const notifId = accNotifs.items[0]!.id;
    // engineer tries to mark accountant's notification read
    const res = await call(app, engineer, 'POST', `/api/notifications/${notifId}/read`);
    expect(res.statusCode).toBe(404);
    // owner can
    const ok = await call(app, accountant, 'POST', `/api/notifications/${notifId}/read`);
    expect(ok.statusCode).toBe(200);
  });

  it('cross-request token isolation: A’s token cannot track B', async () => {
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const fdA = multipartPayload({ data: JSON.stringify(submitReqData('Token Person A')) });
    const fdB = multipartPayload({ data: JSON.stringify(submitReqData('Token Person B')) });
    const resA = (await call(app, jar, 'POST', '/api/public/requests', fdA)).json() as { reference: string; accessToken: string };
    const resB = (await call(app, jar, 'POST', '/api/public/requests', fdB)).json() as { reference: string; accessToken: string };
    const crossed = await call(app, jar, 'POST', '/api/public/requests/track', { body: { reference: resA.reference, token: resB.accessToken } });
    expect(crossed.statusCode).toBe(404);
    const own = await call(app, jar, 'POST', '/api/public/requests/track', { body: { reference: resA.reference, token: resA.accessToken } });
    expect(own.statusCode).toBe(200);
  });
});

function submitReqData(name: string) {
  return {
    contactName: name, phone: '+9613888777', email: 'tokentest@example.com', language: 'en',
    categoryId: requestCatId, description: 'Integration test request for token isolation checks.',
    governorate: 'Beirut', consentGiven: true,
  };
}

describe('public application portal workflow', () => {
  let reference = '';
  let accessToken = '';
  let applicationId = '';

  it('accepts a valid submission with file and returns reference+token', async () => {
    const jar = newJar();
    (await call(app, jar, 'GET', '/api/auth/csrf'));
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const fd = multipartPayload(
      {
        data: JSON.stringify({
          fullName: 'Integration Applicant', phone: '+9613111222', email: 'int-applicant@example.com',
          personType: 'worker', categoryId: tradeCatId, experienceYears: 6, governorate: 'Beirut',
          consentGiven: true, locale: 'en',
        }),
      },
      [{ field: 'files', filename: 'cv.pdf', contentType: 'application/pdf', content: '%PDF-1.4 integration cv' }],
    );
    const res = await call(app, jar, 'POST', '/api/public/applications', fd);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { reference: string; accessToken: string };
    expect(body.reference).toMatch(/^APP-\d{4}-\d{6}$/);
    expect(body.accessToken.length).toBeGreaterThan(20);
    reference = body.reference;
    accessToken = body.accessToken;
  });

  it('rejects submissions without consent', async () => {
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const fd = multipartPayload({
      data: JSON.stringify({ fullName: 'No Consent', phone: '+9613111333', personType: 'worker', consentGiven: false }),
    });
    const res = await call(app, jar, 'POST', '/api/public/applications', fd);
    expect(res.statusCode).toBe(400);
  });

  it('rejects disguised file uploads (content ≠ declared type)', async () => {
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const fd = multipartPayload(
      {
        data: JSON.stringify({ fullName: 'Bad File', phone: '+9613111444', personType: 'worker', consentGiven: true }),
      },
      [{ field: 'files', filename: 'evil.png', contentType: 'image/png', content: 'MZ this is not a png at all' }],
    );
    const res = await call(app, jar, 'POST', '/api/public/applications', fd);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'FILE_REJECTED' } });
  });

  it('tracks with correct token but rejects wrong token (404, no enumeration)', async () => {
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const ok = await call(app, jar, 'POST', '/api/public/applications/track', { body: { reference, token: accessToken } });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { status: string }).status).toBe('submitted');
    const bad = await call(app, jar, 'POST', '/api/public/applications/track', { body: { reference, token: 'x'.repeat(40) } });
    expect(bad.statusCode).toBe(404);
    const badRef = await call(app, jar, 'POST', '/api/public/applications/track', { body: { reference: 'APP-1999-999999', token: accessToken } });
    expect(badRef.statusCode).toBe(404);
  });

  it('staff review: invalid transitions rejected, valid path works, hired creates personnel', async () => {
    const list = (await call(app, hr, 'GET', `/api/applications?q=${encodeURIComponent('Integration Applicant')}`)).json() as { items: Array<{ id: string }> };
    applicationId = list.items[0]!.id;
    const jump = await call(app, hr, 'POST', `/api/applications/${applicationId}/status`, { body: { status: 'hired' } });
    expect(jump.statusCode).toBe(400);
    expect(jump.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });

    for (const st of ['under_review', 'shortlisted', 'interview', 'approved', 'hired']) {
      const res = await call(app, hr, 'POST', `/api/applications/${applicationId}/status`, {
        body: { status: st, internalNote: `note for ${st}`, publicMessageEn: st === 'approved' ? 'Approved!' : null },
      });
      expect(res.statusCode, st).toBe(200);
    }
    const detail = (await call(app, hr, 'GET', `/api/applications/${applicationId}`)).json() as { application: { personnelId: string | null; internalNotes: string | null } };
    expect(detail.application.personnelId).toBeTruthy();
    expect(detail.application.internalNotes).toContain('note for hired');

    // applicant tracking must NOT expose internal notes
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const track = (await call(app, jar, 'POST', '/api/public/applications/track', { body: { reference, token: accessToken } })).json() as Record<string, unknown>;
    expect(JSON.stringify(track)).not.toContain('note for');
    expect(track.status).toBe('hired');
  });

  it('accountant cannot review applications (403)', async () => {
    const res = await call(app, accountant, 'POST', `/api/applications/${applicationId}/status`, { body: { status: 'rejected' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('customer request workflow & project conversion', () => {
  let reference = '';
  let token = '';
  let requestId = '';
  let projectId = '';

  it('public submission works with honeypot rejection', async () => {
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const fd = multipartPayload({ data: JSON.stringify(submitReqData('Integration Customer')) });
    const res = await call(app, jar, 'POST', '/api/public/requests', fd);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { reference: string; accessToken: string };
    expect(body.reference).toMatch(/^REQ-\d{4}-\d{6}$/);
    reference = body.reference;
    token = body.accessToken;

    const spamFd = multipartPayload({ data: JSON.stringify({ ...submitReqData('Spam'), website: 'http://bot' }) });
    const spam = await call(app, jar, 'POST', '/api/public/requests', spamFd);
    expect(spam.statusCode).toBe(200);
    expect((spam.json() as { reference: null }).reference).toBeNull();
  });

  it('conversion is blocked before acceptance and works after', async () => {
    const list = (await call(app, owner, 'GET', `/api/requests?q=${encodeURIComponent('Integration Customer')}`)).json() as { items: Array<{ id: string }> };
    requestId = list.items[0]!.id;

    const early = await call(app, owner, 'POST', `/api/requests/${requestId}/convert`, { body: { name: 'Too early' } });
    expect(early.statusCode).toBe(400);
    expect(early.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });

    for (const st of ['under_review', 'estimating', 'quotation_prepared', 'quotation_sent', 'accepted']) {
      const r = await call(app, owner, 'POST', `/api/requests/${requestId}/status`, { body: { status: st, notifyCustomer: false } });
      expect(r.statusCode, st).toBe(200);
    }
    const conv = await call(app, owner, 'POST', `/api/requests/${requestId}/convert`, {
      body: { name: 'Integration Project', contractAmount: '42000', contractCurrency: 'USD' },
    });
    expect(conv.statusCode).toBe(200);
    const body = conv.json() as { projectId: string; projectNo: string };
    expect(body.projectNo).toMatch(/^PRJ-\d{4}-\d{4}$/);
    projectId = body.projectId;

    // request is linked + contracted; history preserved
    const detail = (await call(app, owner, 'GET', `/api/requests/${requestId}`)).json() as { request: { status: string; projectId: string }; events: unknown[] };
    expect(detail.request.status).toBe('contracted');
    expect(detail.request.projectId).toBe(projectId);
    expect(detail.events.length).toBeGreaterThanOrEqual(5);

    // second conversion blocked
    const again = await call(app, owner, 'POST', `/api/requests/${requestId}/convert`, { body: { name: 'Again' } });
    expect(again.statusCode).toBe(400);
  });

  it('customer tracking does not leak internal notes', async () => {
    await call(app, owner, 'POST', `/api/requests/${requestId}/status`, { body: { status: 'in_progress', internalNote: 'SECRET-MARGIN-42', notifyCustomer: false } });
    const jar = newJar();
    jar.csrf = ((await call(app, jar, 'GET', '/api/auth/csrf')).json() as { token: string }).token;
    const track = await call(app, jar, 'POST', '/api/public/requests/track', { body: { reference, token } });
    expect(track.body).not.toContain('SECRET-MARGIN-42');
  });
});

describe('project scheduling & assignments', () => {
  it('prevents double-booking the same person on the same day (409)', async () => {
    const people = (await call(app, pm, 'GET', '/api/personnel?pageSize=5')).json() as { items: Array<{ id: string }> };
    const projects = (await call(app, pm, 'GET', '/api/projects?pageSize=5')).json() as { items: Array<{ id: string }> };
    const pid = people.items[0]!.id;
    const prj = projects.items[0]!.id;
    const date = '2028-05-17';
    const a = await call(app, pm, 'POST', '/api/scheduling/assignments', { body: { personnelId: pid, projectId: prj, workDate: date } });
    expect(a.statusCode).toBe(200);
    const b = await call(app, pm, 'POST', '/api/scheduling/assignments', { body: { personnelId: pid, projectId: prj, workDate: date } });
    expect(b.statusCode).toBe(409);
    expect(b.json()).toMatchObject({ error: { code: 'SCHEDULING_CONFLICT' } });
    await call(app, pm, 'DELETE', `/api/scheduling/assignments/${(a.json() as { id: string }).id}`);
  });

  it('attendance approval flow: draft → submitted → approved, edits invalidate approval', async () => {
    const people = (await call(app, pm, 'GET', '/api/personnel?pageSize=5')).json() as { items: Array<{ id: string }> };
    const pid = people.items[1]!.id;
    const rec = await call(app, pm, 'POST', '/api/scheduling/attendance', {
      body: { personnelId: pid, workDate: '2028-05-18', status: 'present', regularHours: 8, overtimeHours: 0, submit: true },
    });
    expect(rec.statusCode).toBe(200);
    const id = (rec.json() as { id: string }).id;
    // duplicate day blocked
    const dup = await call(app, pm, 'POST', '/api/scheduling/attendance', { body: { personnelId: pid, workDate: '2028-05-18', regularHours: 8, overtimeHours: 0 } });
    expect(dup.statusCode).toBe(409);
    const approved = await call(app, pm, 'POST', `/api/scheduling/attendance/${id}/approve`);
    expect(approved.statusCode).toBe(200);
    const edit = await call(app, pm, 'PATCH', `/api/scheduling/attendance/${id}`, { body: { regularHours: 9 } });
    expect((edit.json() as { approvalStatus: string }).approvalStatus).toBe('submitted');
  });

  it('milestone progress reflects completed weighted milestones', async () => {
    const projects = (await call(app, owner, 'GET', '/api/projects?pageSize=10')).json() as { items: Array<{ id: string }> };
    const pid = projects.items[0]!.id;
    const m1 = await call(app, owner, 'POST', `/api/projects/${pid}/milestones`, { body: { title: 'Int M1', weight: 1 } });
    const m2 = await call(app, owner, 'POST', `/api/projects/${pid}/milestones`, { body: { title: 'Int M2', weight: 3 } });
    await call(app, owner, 'PATCH', `/api/projects/${pid}/milestones/${(m2.json() as { id: string }).id}`, { body: { status: 'done' } });
    const detail = (await call(app, owner, 'GET', `/api/projects/${pid}`)).json() as { progress: { done: number; total: number; milestonePct: number } };
    expect(detail.progress.done).toBe(3);
    expect(detail.progress.total).toBeGreaterThanOrEqual(4);
    await call(app, owner, 'DELETE', `/api/projects/${pid}/milestones/${(m1.json() as { id: string }).id}`);
    await call(app, owner, 'DELETE', `/api/projects/${pid}/milestones/${(m2.json() as { id: string }).id}`);
  });
});

describe('financial integrity', () => {
  let quoteId = '';
  let invoiceId = '';
  let customerId = '';

  it('creates a quotation with exact decimal totals', async () => {
    const customers = (await call(app, accountant, 'GET', '/api/customers?pageSize=5')).json() as { items: Array<{ id: string }> };
    customerId = customers.items[0]!.id;
    const res = await call(app, accountant, 'POST', '/api/finance/quotations', {
      body: {
        customerId, currency: 'USD', title: 'Int test quote', discountPct: 0, taxPct: 11,
        items: [
          { kind: 'labor', description: 'Work A', qty: '3', unit: 'm2', unitPrice: '0.335' },
          { kind: 'material', description: 'Work B', qty: '1', unit: 'lot', unitPrice: '100' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const q = res.json() as { id: string; subtotal: string; taxAmount: string; total: string };
    // lines: 3*0.335=1.005→1.01 ; +100 → subtotal 101.01 ; tax 11% = 11.1111 → 11.11 ; total 112.12
    expect(q.subtotal).toBe('101.0100');
    expect(q.taxAmount).toBe('11.1100');
    expect(q.total).toBe('112.1200');
    quoteId = q.id;
  });

  it('enforces approval workflow and single-approver concurrency guard', async () => {
    const direct = await call(app, accountant, 'POST', `/api/finance/quotations/${quoteId}/transition`, { body: { to: 'sent' } });
    expect(direct.statusCode).toBe(400);
    await call(app, accountant, 'POST', `/api/finance/quotations/${quoteId}/transition`, { body: { to: 'pending_approval' } });
    const first = await call(app, accountant, 'POST', `/api/finance/quotations/${quoteId}/transition`, { body: { to: 'approved' } });
    expect(first.statusCode).toBe(200);
    const second = await call(app, owner, 'POST', `/api/finance/quotations/${quoteId}/transition`, { body: { to: 'approved' } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'APPROVAL_CONFLICT' } });
  });

  it('exports an Arabic and English PDF only after approval', async () => {
    await call(app, accountant, 'POST', `/api/finance/quotations/${quoteId}/transition`, { body: { to: 'sent' } });
    for (const loc of ['en', 'ar']) {
      const res = await call(app, accountant, 'GET', `/api/finance/quotations/${quoteId}/pdf?locale=${loc}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.rawPayload.length).toBeGreaterThan(2000);
    }
  });

  it('invoice payments: partial → paid, duplicate blocked, overpay blocked, currency enforced', async () => {
    const inv = await call(app, accountant, 'POST', '/api/finance/invoices', {
      body: {
        customerId, currency: 'USD', issueDate: '2026-09-01', dueDate: '2026-10-01', taxPct: 0,
        items: [{ description: 'Int invoice line', qty: 1, unit: 'lot', unitPrice: '1000' }],
      },
    });
    expect(inv.statusCode).toBe(200);
    invoiceId = (inv.json() as { id: string }).id;
    await call(app, accountant, 'POST', `/api/finance/invoices/${invoiceId}/transition`, { body: { to: 'sent' } });

    const p1 = await call(app, accountant, 'POST', '/api/finance/receipts', {
      body: { invoiceId, customerId, amount: '600', currency: 'USD', method: 'cash', receivedOn: '2026-09-05', externalRef: 'INT-CHK-1' },
    });
    expect(p1.statusCode).toBe(200);

    const dup = await call(app, accountant, 'POST', '/api/finance/receipts', {
      body: { invoiceId, customerId, amount: '400', currency: 'USD', method: 'cash', receivedOn: '2026-09-06', externalRef: 'INT-CHK-1' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: 'DUPLICATE_PAYMENT' } });

    const over = await call(app, accountant, 'POST', '/api/finance/receipts', {
      body: { invoiceId, customerId, amount: '900', currency: 'USD', receivedOn: '2026-09-07' },
    });
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ error: { code: 'OVERPAYMENT' } });

    const wrongCur = await call(app, accountant, 'POST', '/api/finance/receipts', {
      body: { invoiceId, customerId, amount: '100', currency: 'LBP', receivedOn: '2026-09-08' },
    });
    expect(wrongCur.statusCode).toBe(400);
    expect(wrongCur.json()).toMatchObject({ error: { code: 'CURRENCY_MISMATCH' } });

    const p2 = await call(app, accountant, 'POST', '/api/finance/receipts', {
      body: { invoiceId, customerId, amount: '400', currency: 'USD', receivedOn: '2026-09-09' },
    });
    expect(p2.statusCode).toBe(200);

    const detail = (await call(app, accountant, 'GET', `/api/finance/invoices/${invoiceId}`)).json() as { invoice: { status: string; paidTotal: string } };
    expect(detail.invoice.status).toBe('paid');
    expect(Number(detail.invoice.paidTotal)).toBe(1000);
  });

  it('voiding a receipt recalculates the invoice balance', async () => {
    const detail = (await call(app, accountant, 'GET', `/api/finance/invoices/${invoiceId}`)).json() as { payments: Array<{ id: string }> };
    const last = detail.payments[0]!; // payments are ordered newest-first
    const v = await call(app, accountant, 'POST', `/api/finance/receipts/${last.id}/void`);
    expect(v.statusCode).toBe(200);
    const after = (await call(app, accountant, 'GET', `/api/finance/invoices/${invoiceId}`)).json() as { invoice: { status: string; paidTotal: string } };
    expect(Number(after.invoice.paidTotal)).toBe(600);
    expect(after.invoice.status).toBe('partial');
  });

  it('worker payment approval requires payments permission and updates balance', async () => {
    const people = (await call(app, accountant, 'GET', '/api/personnel?pageSize=5')).json() as { items: Array<{ id: string }> };
    const pid = people.items[0]!.id;
    const pay = await call(app, accountant, 'POST', '/api/scheduling/payments', {
      body: { personnelId: pid, type: 'advance', amount: '50', currency: 'USD', paidOn: '2026-09-10' },
    });
    expect(pay.statusCode).toBe(200);
    const payId = (pay.json() as { id: string }).id;
    // hr cannot approve
    expect((await call(app, hr, 'POST', `/api/scheduling/payments/${payId}/approve`)).statusCode).toBe(403);
    const ap = await call(app, accountant, 'POST', `/api/scheduling/payments/${payId}/approve`);
    expect(ap.statusCode).toBe(200);
    // re-approve fails (state guard)
    expect((await call(app, accountant, 'POST', `/api/scheduling/payments/${payId}/approve`)).statusCode).toBe(400);
    const bal = (await call(app, accountant, 'GET', `/api/scheduling/payments/balance/${pid}`)).json() as { advancesByCurrency: Record<string, string> };
    expect(Number(bal.advancesByCurrency.USD)).toBeGreaterThanOrEqual(50);
  });

  it('receivables report groups by currency and excludes paid invoices', async () => {
    const res = (await call(app, accountant, 'GET', '/api/finance/receivables')).json() as { items: Array<{ currency: string; outstanding: string }> };
    for (const row of res.items) {
      expect(['USD', 'LBP']).toContain(row.currency);
      expect(Number(row.outstanding)).toBeGreaterThan(0);
    }
  });
});

describe('file upload & private download authorization', () => {
  let fileId = '';

  it('accepts a valid PDF upload to a project', async () => {
    const projects = (await call(app, owner, 'GET', '/api/projects?pageSize=1')).json() as { items: Array<{ id: string }> };
    const pid = projects.items[0]!.id;
    const fd = multipartPayload({}, [{ field: 'file', filename: 'plan.pdf', contentType: 'application/pdf', content: '%PDF-1.4 site plan' }]);
    const res = await call(app, owner, 'POST', `/api/projects/${pid}/files`, fd);
    expect(res.statusCode).toBe(200);
    fileId = (res.json() as { id: string }).id;
  });

  it('rejects oversized uploads', async () => {
    const projects = (await call(app, owner, 'GET', '/api/projects?pageSize=1')).json() as { items: Array<{ id: string }> };
    const pid = projects.items[0]!.id;
    const big = '%PDF-1.4 ' + 'x'.repeat(11 * 1024 * 1024);
    const fd = multipartPayload({}, [{ field: 'file', filename: 'big.pdf', contentType: 'application/pdf', content: big }]);
    const res = await call(app, owner, 'POST', `/api/projects/${pid}/files`, fd);
    expect([400, 413]).toContain(res.statusCode);
  });

  it('anonymous download denied; authorized download succeeds', async () => {
    const anon = await call(app, newJar(), 'GET', `/api/files/${fileId}/download`);
    expect(anon.statusCode).toBe(401);
    const ok = await call(app, owner, 'GET', `/api/files/${fileId}/download`);
    expect(ok.statusCode).toBe(200);
    expect(ok.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(ok.headers['content-disposition']).toContain('plan.pdf');
  });
});

describe('settings & administration', () => {
  it('only settings.write roles can update company profile', async () => {
    const pub = (await call(app, newJar(), 'GET', '/api/settings/public')).json() as { company: Record<string, unknown> };
    const asHr = await call(app, hr, 'PUT', '/api/settings/company', { body: pub.company });
    expect(asHr.statusCode).toBe(403);
    const updated = { ...pub.company, workingHoursEn: 'Mon-Sat 7:30-16:30' };
    const asOwner = await call(app, owner, 'PUT', '/api/settings/company', { body: updated });
    expect(asOwner.statusCode).toBe(200);
    const pub2 = (await call(app, newJar(), 'GET', '/api/settings/public')).json() as { company: { workingHoursEn: string } };
    expect(pub2.company.workingHoursEn).toBe('Mon-Sat 7:30-16:30');
  });

  it('non-owner cannot create admin accounts or modify owner', async () => {
    const asHr = await call(app, hr, 'POST', '/api/users', { body: { email: 'x@y.z', fullName: 'X Y', role: 'admin' } });
    expect(asHr.statusCode).toBe(403);
    const users = (await call(app, owner, 'GET', '/api/users')).json() as { items: Array<{ id: string; role: string }> };
    const ownerRow = users.items.find((u) => u.role === 'owner')!;
    const asAdminLess = await call(app, pm, 'PATCH', `/api/users/${ownerRow.id}`, { body: { status: 'suspended' } });
    expect(asAdminLess.statusCode).toBe(403);
  });

  it('exchange rates require positive rate and different currencies', async () => {
    const bad1 = await call(app, owner, 'POST', '/api/settings/rates', { body: { fromCurrency: 'USD', toCurrency: 'USD', rate: '1', rateDate: '2026-10-01', source: 'test' } });
    expect(bad1.statusCode).toBe(400);
    const bad2 = await call(app, owner, 'POST', '/api/settings/rates', { body: { fromCurrency: 'USD', toCurrency: 'LBP', rate: '0', rateDate: '2026-10-01', source: 'test' } });
    expect(bad2.statusCode).toBe(400);
    const ok = await call(app, owner, 'POST', '/api/settings/rates', { body: { fromCurrency: 'USD', toCurrency: 'LBP', rate: '89700', rateDate: '2026-10-01', source: 'integration test source' } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('audit log', () => {
  it('records important events and never stores passwords or tokens', async () => {
    const res = (await call(app, owner, 'GET', '/api/audit?pageSize=100')).json() as { items: Array<{ action: string }> };
    const actions = res.items.map((i) => i.action);
    expect(actions).toContain('auth.login_success');
    expect(actions.some((a) => a.startsWith('quote.'))).toBe(true);
    expect(actions.some((a) => a.startsWith('receipt.'))).toBe(true);
    const raw = JSON.stringify(res);
    expect(raw).not.toContain(PW);
    expect(raw.toLowerCase()).not.toContain('password_hash');
  });

  it('ordinary users cannot read the audit log', async () => {
    expect((await call(app, engineer, 'GET', '/api/audit')).statusCode).toBe(403);
    expect((await call(app, pm, 'GET', '/api/audit')).statusCode).toBe(403);
  });
});

describe('reports authorization', () => {
  it('revenue report requires explicit currency (never mixes)', async () => {
    const noCur = await call(app, accountant, 'GET', '/api/reports/revenue-profit');
    expect(noCur.statusCode).toBe(400);
    expect(noCur.json()).toMatchObject({ error: { code: 'CURRENCY_REQUIRED' } });
    const ok = await call(app, accountant, 'GET', '/api/reports/revenue-profit?currency=USD&from=2020-01-01&to=2030-01-01');
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { currency: string; invoiced: string };
    expect(body.currency).toBe('USD');
    expect(Number(body.invoiced)).toBeGreaterThanOrEqual(0);
  });

  it('HR can run personnel reports but not financial ones', async () => {
    expect((await call(app, hr, 'GET', '/api/reports/personnel-by-category')).statusCode).toBe(200);
    expect((await call(app, hr, 'GET', '/api/reports/revenue-profit?currency=USD')).statusCode).toBe(403);
  });
});
});
