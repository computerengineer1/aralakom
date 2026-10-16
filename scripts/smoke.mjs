/**
 * End-to-end smoke test against a running server (default http://localhost:8080).
 * Exercises the core flows with real HTTP: CSRF, login, RBAC, public submissions,
 * tracking, dashboards, personnel, quotation → approval → PDF, invoice → receipt.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:8080';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'Demo!Owner123';

let failures = 0;
let passes = 0;
function check(name, cond, extra = '') {
  if (cond) { passes++; console.log(`  ✔ ${name}`); }
  else { failures++; console.log(`  ✘ ${name} ${extra}`); }
}

class Client {
  constructor() { this.cookies = {}; this.csrf = null; }
  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, path, { body, formData, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    const cookie = this.cookieHeader();
    if (cookie) h['Cookie'] = cookie;
    if (this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    let payload;
    if (formData) {
      const fd = new FormData();
      for (const [k, v] of formData) fd.append(k, v);
      payload = fd;
    } else if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const idx = pair.indexOf('=');
      this.cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
    return { status: res.status, body: json, headers: res.headers };
  }
  async initCsrf() {
    const r = await this.req('GET', '/api/auth/csrf');
    this.csrf = r.body.token;
    return r;
  }
  async login(email, password = PASSWORD, totp) {
    await this.initCsrf();
    const res = await this.req('POST', '/api/auth/login', { body: { email, password, totp } });
    // Login rotates the CSRF cookie; re-read the fresh token.
    if (res.status === 200 || res.body?.mfaRequired) await this.initCsrf();
    return res;
  }
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // ---- health & public
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health ok + db ok', health.status === 'ok' && health.db === 'ok', JSON.stringify(health));

  const pub = await fetch(`${BASE}/api/settings/public`).then((r) => r.json());
  check('public settings expose company + categories', Boolean(pub.company?.nameEn) && pub.tradeCategories?.length >= 10 && pub.requestCategories?.length >= 10);
  const portfolio = await fetch(`${BASE}/api/settings/portfolio`).then((r) => r.json());
  check('public portfolio published items', portfolio.items?.length >= 3);

  // ---- unauthorized access is denied
  const anonDash = await fetch(`${BASE}/api/dashboard`);
  check('anonymous dashboard blocked (401)', anonDash.status === 401);
  const anonPersonnel = await fetch(`${BASE}/api/personnel`);
  check('anonymous personnel blocked (401)', anonPersonnel.status === 401);

  // ---- CSRF enforcement
  const c0 = new Client();
  await c0.initCsrf();
  const noCsrf = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c0.cookieHeader() },
    body: JSON.stringify({ email: 'owner@demo.local', password: PASSWORD }),
  });
  check('login without CSRF header blocked (403)', noCsrf.status === 403);

  // ---- owner login + dashboard
  const owner = new Client();
  const loginRes = await owner.login('owner@demo.local');
  check('owner login', loginRes.status === 200 && loginRes.body.user?.role === 'owner', JSON.stringify(loginRes.body).slice(0, 120));
  const dash = await owner.req('GET', '/api/dashboard');
  check('owner dashboard returns aggregates', dash.body.kind === 'owner' && dash.body.activePersonnel > 0 && Array.isArray(dash.body.outstandingInvoices));

  const pers = await owner.req('GET', '/api/personnel?page=1&pageSize=5&q=Ahmad');
  check('personnel search works', pers.body.items?.length >= 1 && pers.body.items[0].fullName.includes('Ahmad'));
  check('personnel sensitive field visible to owner', pers.body.items[0]?.rateAmount !== undefined);

  // ---- bad login does not leak account existence
  const badLogin = await owner.req('POST', '/api/auth/login', { body: { email: 'nobody@demo.local', password: 'whatever123' } });
  const badLogin2 = await owner.req('POST', '/api/auth/login', { body: { email: 'owner@demo.local', password: 'wrongpassword1' } });
  check('login errors identical for unknown/bad password', badLogin.status === 401 && badLogin2.status === 401 && badLogin.body.error.code === badLogin2.body.error.code);

  // ---- public application submission + tracking
  const appClient = new Client();
  await appClient.initCsrf();
  const fd = new FormData();
  fd.append('data', JSON.stringify({
    fullName: 'Test Applicant', phone: '+9613999888', email: 'applicant@example.com',
    personType: 'worker', categoryId: pub.tradeCategories[0].id, experienceYears: 5,
    governorate: 'Beirut', availability: 'immediate', consentGiven: true, locale: 'en',
  }));
  fd.append('cv', new Blob(['%PDF-1.4 fake cv content'], { type: 'application/pdf' }), 'cv.pdf');
  const submitRes = await fetch(`${BASE}/api/public/applications`, { method: 'POST', headers: { Cookie: appClient.cookieHeader(), 'X-CSRF-Token': appClient.csrf }, body: fd });
  const submit = await submitRes.json();
  check('application submitted with reference+token', submitRes.status === 201 && /^APP-\d{4}-\d{6}$/.test(submit.reference ?? '') && submit.accessToken?.length > 20, JSON.stringify(submit).slice(0, 150));

  const track = await appClient.req('POST', '/api/public/applications/track', { body: { reference: submit.reference, token: submit.accessToken } });
  check('application tracking works', track.status === 200 && track.body.status === 'submitted');
  const badTrack = await appClient.req('POST', '/api/public/applications/track', { body: { reference: submit.reference, token: 'x'.repeat(30) } });
  check('tracking with wrong token denied (404)', badTrack.status === 404);

  // ---- public request submission
  const reqClient = new Client();
  await reqClient.initCsrf();
  const fd2 = new FormData();
  fd2.append('data', JSON.stringify({
    contactName: 'Test Customer', phone: '+9613777666', email: 'customer@example.com',
    language: 'ar', categoryId: pub.requestCategories[0].id,
    description: 'Need full apartment finishing, 150 m2, in Beirut area.',
    governorate: 'Beirut', propertyType: 'apartment', areaValue: 150, areaUnit: 'm2',
    budget: '50000', budgetCurrency: 'USD', preferredContact: 'whatsapp', consentGiven: true,
  }));
  const reqRes = await fetch(`${BASE}/api/public/requests`, { method: 'POST', headers: { Cookie: reqClient.cookieHeader(), 'X-CSRF-Token': reqClient.csrf }, body: fd2 });
  const reqSub = await reqRes.json();
  check('customer request submitted', reqRes.status === 201 && /^REQ-\d{4}-\d{6}$/.test(reqSub.reference ?? ''), JSON.stringify(reqSub).slice(0, 150));

  // honeypot
  const fd3 = new FormData();
  fd3.append('data', JSON.stringify({
    contactName: 'Spam Bot', phone: '+9613000000', categoryId: pub.requestCategories[0].id,
    description: 'spam spam spam spam spam', consentGiven: true, website: 'http://spam.example',
  }));
  const spamRes = await fetch(`${BASE}/api/public/requests`, { method: 'POST', headers: { Cookie: reqClient.cookieHeader(), 'X-CSRF-Token': reqClient.csrf }, body: fd3 });
  const spam = await spamRes.json();
  check('honeypot silently discards spam', spamRes.status === 200 && spam.reference === null);

  // ---- staff review workflow (HR sees application, transitions it)
  const hr = new Client();
  const hrLogin = await hr.login('hr@demo.local');
  check('hr login', hrLogin.status === 200);
  const apps = await hr.req('GET', '/api/applications?q=Test');
  const found = apps.body.items?.find((a) => a.reference === submit.reference);
  check('hr finds submitted application', Boolean(found));
  if (found) {
    const t1 = await hr.req('POST', `/api/applications/${found.id}/status`, { body: { status: 'under_review', internalNote: 'Phone screen scheduled' } });
    check('application → under_review', t1.status === 200);
    const bad = await hr.req('POST', `/api/applications/${found.id}/status`, { body: { status: 'hired' } });
    check('invalid transition under_review→hired rejected', bad.status === 400 && bad.body.error?.code === 'INVALID_TRANSITION');
    const t2 = await hr.req('POST', `/api/applications/${found.id}/status`, { body: { status: 'approved', publicMessageEn: 'Congratulations, you are approved.' } });
    check('application → approved', t2.status === 200);
    const t3 = await hr.req('POST', `/api/applications/${found.id}/status`, { body: { status: 'hired' } });
    check('application → hired converts to personnel', t3.status === 200);
    const after = await hr.req('GET', `/api/applications/${found.id}`);
    check('hired application linked to personnel record', Boolean(after.body.application.personnelId));
  }
  // HR cannot access finance
  const hrQuotes = await hr.req('GET', '/api/finance/quotations');
  check('hr blocked from quotations (403)', hrQuotes.status === 403);

  // ---- request workflow (PM/owner): transition + convert to project
  const reqList = await owner.req('GET', '/api/requests?q=Test');
  const foundReq = reqList.body.items?.find((r) => r.reference === reqSub.reference);
  check('staff finds customer request', Boolean(foundReq));
  if (foundReq) {
    const s1 = await owner.req('POST', `/api/requests/${foundReq.id}/status`, { body: { status: 'under_review' } });
    check('request → under_review', s1.status === 200);
    const badJump = await owner.req('POST', `/api/requests/${foundReq.id}/status`, { body: { status: 'accepted' } });
    check('invalid jump under_review→accepted rejected', badJump.status === 400);
    for (const st of ['estimating', 'quotation_prepared', 'quotation_sent', 'accepted']) {
      await owner.req('POST', `/api/requests/${foundReq.id}/status`, { body: { status: st, notifyCustomer: false } });
    }
    const conv = await owner.req('POST', `/api/requests/${foundReq.id}/convert`, { body: { name: 'Test Customer Apartment Finishing', managerId: null, contractAmount: '50000', contractCurrency: 'USD' } });
    check('request converted to project', conv.status === 200 && conv.body.projectNo?.startsWith('PRJ-'), JSON.stringify(conv.body).slice(0, 120));
  }

  // ---- finance: quotation approval + PDF + invoice + receipt + duplicate guard
  const acct = new Client();
  await acct.login('accountant@demo.local');
  const quotes = await acct.req('GET', '/api/finance/quotations');
  check('accountant lists quotations', Array.isArray(quotes.body.items) && quotes.body.items.length >= 1);
  const cust = await acct.req('GET', '/api/customers');
  const custId = cust.body.items?.[0]?.id;
  const newQuote = await acct.req('POST', '/api/finance/quotations', {
    body: {
      customerId: custId, currency: 'USD', title: 'Smoke test quote', validUntil: '2027-01-01',
      discountPct: 0, taxPct: 11,
      items: [{ kind: 'labor', description: 'Painting 100m2', qty: '100', unit: 'm2', unitPrice: '3.5' }],
    },
  });
  check('create quotation (totals: 350 + 11% tax = 388.50)', newQuote.status === 200 && Number(newQuote.body.total) === 388.5, JSON.stringify(newQuote.body).slice(0, 150));
  const qid = newQuote.body.id;
  const sendBeforeApprove = await acct.req('POST', `/api/finance/quotations/${qid}/transition`, { body: { to: 'sent' } });
  check('draft cannot jump to sent', sendBeforeApprove.status === 400);
  await acct.req('POST', `/api/finance/quotations/${qid}/transition`, { body: { to: 'pending_approval' } });
  const appr = await acct.req('POST', `/api/finance/quotations/${qid}/transition`, { body: { to: 'approved' } });
  check('quotation approved', appr.status === 200);
  await acct.req('POST', `/api/finance/quotations/${qid}/transition`, { body: { to: 'sent' } });
  if (!qid) { console.log('  !! skipping PDF checks: quotation creation failed'); }
  const pdf = qid ? await acct.req('GET', `/api/finance/quotations/${qid}/pdf?locale=en`, { raw: true }) : { status: 0, buffer: Buffer.alloc(0) };
  check('quotation PDF export (en)', pdf.status === 200 && pdf.buffer.subarray(0, 5).toString() === '%PDF-', `status=${pdf.status}`);
  const pdfAr = qid ? await acct.req('GET', `/api/finance/quotations/${qid}/pdf?locale=ar`, { raw: true }) : { status: 0, buffer: Buffer.alloc(0) };
  check('quotation PDF export (ar)', pdfAr.status === 200 && pdfAr.buffer.subarray(0, 5).toString() === '%PDF-');

  const inv = await acct.req('POST', '/api/finance/invoices', {
    body: { customerId: custId, currency: 'USD', issueDate: '2026-10-01', dueDate: '2026-11-01', taxPct: 0, items: [{ description: 'Advance', qty: 1, unit: 'lot', unitPrice: '1000' }] },
  });
  check('create invoice', inv.status === 200 && Number(inv.body.total) === 1000);
  const invId = inv.body.id;
  await acct.req('POST', `/api/finance/invoices/${invId}/transition`, { body: { to: 'sent' } });
  const rec1 = await acct.req('POST', '/api/finance/receipts', { body: { invoiceId: invId, customerId: custId, amount: '600', currency: 'USD', method: 'cash', receivedOn: '2026-10-05', externalRef: 'CHK-001' } });
  check('partial receipt recorded', rec1.status === 200);
  const dup = await acct.req('POST', '/api/finance/receipts', { body: { invoiceId: invId, customerId: custId, amount: '400', currency: 'USD', method: 'cash', receivedOn: '2026-10-05', externalRef: 'CHK-001' } });
  check('duplicate receipt (same external ref) blocked', dup.status === 409, `status=${dup.status} ${JSON.stringify(dup.body).slice(0, 100)}`);
  const over = await acct.req('POST', '/api/finance/receipts', { body: { invoiceId: invId, customerId: custId, amount: '900', currency: 'USD', receivedOn: '2026-10-06' } });
  check('overpayment blocked', over.status === 400 && over.body.error?.code === 'OVERPAYMENT');
  const wrongCur = await acct.req('POST', '/api/finance/receipts', { body: { invoiceId: invId, customerId: custId, amount: '100', currency: 'LBP', receivedOn: '2026-10-06' } });
  check('cross-currency payment blocked', wrongCur.status === 400 && wrongCur.body.error?.code === 'CURRENCY_MISMATCH');
  const rec2 = await acct.req('POST', '/api/finance/receipts', { body: { invoiceId: invId, customerId: custId, amount: '400', currency: 'USD', receivedOn: '2026-10-07' } });
  check('final receipt marks invoice paid', rec2.status === 200);
  const invAfter = await acct.req('GET', `/api/finance/invoices/${invId}`);
  check('invoice status=paid, paidTotal=1000', invAfter.body.invoice.status === 'paid' && Number(invAfter.body.invoice.paidTotal) === 1000);

  // accountant cannot review applications
  const acctApps = await acct.req('POST', '/api/applications/00000000-0000-0000-0000-000000000000/status', { body: { status: 'approved' } });
  check('accountant blocked from application review (403)', acctApps.status === 403);

  // ---- PM: scheduling conflict
  const pm = new Client();
  await pm.login('pm@demo.local');
  const projList = await pm.req('GET', '/api/projects?page=1');
  const p1 = projList.body.items?.[0];
  const persList = await pm.req('GET', '/api/personnel?pageSize=50');
  const w1 = persList.body.items?.[0];
  if (p1 && w1) {
    const date = '2027-01-15';
    const a1 = await pm.req('POST', '/api/scheduling/assignments', { body: { personnelId: w1.id, projectId: p1.id, workDate: date } });
    check('assignment created', a1.status === 200);
    const a2 = await pm.req('POST', '/api/scheduling/assignments', { body: { personnelId: w1.id, projectId: p1.id, workDate: date } });
    check('conflicting double-booking rejected (409)', a2.status === 409 && a2.body.error?.code === 'SCHEDULING_CONFLICT');
    if (a1.status === 200) await pm.req('DELETE', `/api/scheduling/assignments/${a1.body.id}`);
  }
  // PM cannot approve worker payments
  const pmPay = await pm.req('POST', '/api/scheduling/payments', { body: { personnelId: w1?.id, amount: '100', currency: 'USD', paidOn: '2026-10-01' } });
  check('pm blocked from worker payments (403)', pmPay.status === 403);

  // ---- engineer: scoped access
  const eng = new Client();
  await eng.login('engineer@demo.local');
  const engDash = await eng.req('GET', '/api/dashboard');
  check('engineer dashboard scoped', engDash.status === 200 && engDash.body.kind === 'worker');
  const engUsers = await eng.req('GET', '/api/users');
  check('engineer blocked from user management (403)', engUsers.status === 403);

  // ---- audit log
  const audit = await owner.req('GET', '/api/audit?pageSize=50');
  const actions = (audit.body.items ?? []).map((a) => a.action);
  check('audit trail recorded key events', actions.includes('auth.login_success') && actions.some((a) => a.startsWith('quote.')) && actions.some((a) => a.startsWith('receipt.')), actions.slice(0, 8).join(','));
  const pwLeak = JSON.stringify(audit.body).match(/Demo!Owner123|password_hash|"password"/i);
  check('audit contains no passwords/secrets', !pwLeak);

  // ---- files: unauthorized download denied
  const fileList = await hr.req('GET', `/api/applications`);
  const anonFile = await fetch(`${BASE}/api/files/00000000-0000-0000-0000-000000000000/download`);
  check('anonymous file download denied', anonFile.status === 401);
  void fileList;

  // ---- settings protection
  const hrCompanyPut = await hr.req('PUT', '/api/settings/company', { body: { ...pub.company } });
  check('hr blocked from writing company settings (403)', hrCompanyPut.status === 403);

  // ---- rate limit on auth (12 per 15 min) — send burst
  let limited = false;
  for (let i = 0; i < 14; i++) {
    const c = new Client();
    await c.initCsrf();
    const r = await c.req('POST', '/api/auth/login', { body: { email: 'ratelimit-test@demo.local', password: 'wrongwrong1' } });
    if (r.status === 429) { limited = true; break; }
  }
  check('login rate limiting kicks in', limited);

  console.log(`\nRESULT: ${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Smoke crashed:', e); process.exit(2); });
