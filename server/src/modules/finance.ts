import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  quotations, quotationItems, contracts, contractPayments, changeOrders,
  invoices, invoiceItems, receipts, customers, requests, projects, suppliers,
} from '../db/schema.js';
import { parseWith, badRequest, notFound, conflict, forbidden, HttpError, isUniqueViolation } from '../lib/http.js';
import { hasPerm } from '../lib/rbac.js';
import { auditFromReq } from '../lib/audit.js';
import { nextReference } from '../lib/ref.js';
import { computeTotals, lineTotal, sumSameCurrency, type Currency } from '../lib/money.js';
import { parsePagination } from './common.js';
import { generateQuotationPdf } from '../lib/pdf.js';
import { getCompany } from '../lib/settings.js';
import { notify } from '../lib/notify.js';

const moneyStr = z.string().regex(/^\d{0,14}(\.\d{1,4})?$/);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['sent', 'draft', 'cancelled'],
  sent: ['accepted', 'declined', 'expired'],
  accepted: [],
  declined: [],
  expired: [],
  cancelled: [],
};

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['partial', 'paid', 'cancelled'],
  partial: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export function assertTransition(map: Record<string, string[]>, from: string, to: string, label: string): void {
  if (from === to) return;
  if (!(map[from] ?? []).includes(to)) {
    throw badRequest('INVALID_TRANSITION', `Cannot move ${label} from '${from}' to '${to}'`, { allowed: map[from] ?? [] });
  }
}

export function registerFinanceRoutes(app: FastifyInstance): void {
  // ================= QUOTATIONS =================

  app.get('/api/finance/quotations', async (req) => {
    const user = req.requirePerm('quotes.read');
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.status) conditions.push(eq(quotations.status, q.status as 'draft'));
    if (q.customerId) conditions.push(eq(quotations.customerId, q.customerId));
    if (q.projectId) conditions.push(eq(quotations.projectId, q.projectId));
    if (q.q) conditions.push(sql`quote_no ILIKE ${'%' + q.q.slice(0, 30) + '%'}`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(quotations).where(where);
    const rows = await req.db.select({
      id: quotations.id, quoteNo: quotations.quoteNo, version: quotations.version, status: quotations.status,
      currency: quotations.currency, total: quotations.total, validUntil: quotations.validUntil,
      createdAt: quotations.createdAt, customerId: quotations.customerId, projectId: quotations.projectId,
      customerName: customers.name,
    }).from(quotations).leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(where).orderBy(desc(quotations.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    void user;
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });

  const quoteItemSchema = z.object({
    kind: z.enum(['labor', 'material', 'equipment', 'other']).default('other'),
    description: z.string().trim().min(1).max(400),
    qty: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(30).default('unit'),
    unitPrice: moneyStr,
  });

  const quoteSchema = z.object({
    customerId: z.string().uuid(),
    requestId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    currency: z.enum(['LBP', 'USD']),
    title: z.string().max(200).optional().nullable(),
    scopeOfWork: z.string().max(10000).optional().nullable(),
    assumptions: z.string().max(5000).optional().nullable(),
    exclusions: z.string().max(5000).optional().nullable(),
    paymentTerms: z.string().max(2000).optional().nullable(),
    validUntil: dateStr.optional().nullable(),
    discountPct: z.coerce.number().min(0).max(100).default(0),
    taxPct: z.coerce.number().min(0).max(100).default(0),
    items: z.array(quoteItemSchema).min(1).max(200),
  });

  function computeQuoteTotals(input: z.infer<typeof quoteSchema>) {
    const lines = input.items.map((it) => lineTotal(it.qty, it.unitPrice));
    return computeTotals(lines, input.discountPct, input.taxPct);
  }

  app.post('/api/finance/quotations', async (req) => {
    const actor = req.requirePerm('quotes.write');
    const body = parseWith(quoteSchema, req.body);
    const db = req.db;
    const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, body.customerId)).limit(1);
    if (!cust) throw badRequest('CUSTOMER_NOT_FOUND', 'Customer not found');
    const totals = computeQuoteTotals(body);
    const quoteNo = await nextReference(db, { prefix: 'QUO', width: 4 });
    const row = await db.transaction(async (tx) => {
      const [q] = await tx.insert(quotations).values({
        quoteNo, customerId: body.customerId, requestId: body.requestId ?? null, projectId: body.projectId ?? null,
        currency: body.currency, title: body.title ?? null,
        scopeOfWork: body.scopeOfWork ?? null, assumptions: body.assumptions ?? null,
        exclusions: body.exclusions ?? null, paymentTerms: body.paymentTerms ?? null,
        validUntil: body.validUntil ?? null,
        discountPct: String(body.discountPct), taxPct: String(body.taxPct),
        ...totals, createdBy: actor.id,
      }).returning();
      await tx.insert(quotationItems).values(body.items.map((it, idx) => ({
        quotationId: q!.id, kind: it.kind, description: it.description,
        qty: String(it.qty), unit: it.unit, unitPrice: it.unitPrice,
        lineTotal: lineTotal(it.qty, it.unitPrice), sortOrder: idx,
      })));
      return q!;
    });
    void auditFromReq(req, db)('quote.created', { type: 'quotation', id: row.id }, { quoteNo, total: row.total, currency: row.currency });
    return row;
  });

  app.get('/api/finance/quotations/:id', async (req) => {
    req.requirePerm('quotes.read');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!q) throw notFound();
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)).orderBy(sql`sort_order`);
    const [cust] = q.customerId ? await db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1) : [null];
    return { quotation: q, items, customer: cust };
  });

  /** Edit — only while draft (or after being returned to draft). Items are replaced atomically. */
  app.put('/api/finance/quotations/:id', async (req) => {
    req.requirePerm('quotes.write');
    const { id } = req.params as { id: string };
    const body = parseWith(quoteSchema.omit({ customerId: true }), req.body);
    const db = req.db;
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!q) throw notFound();
    if (q.status !== 'draft') throw conflict('NOT_EDITABLE', 'Only draft quotations can be edited; create a new version instead');
    const totals = computeQuoteTotals({ ...body, customerId: q.customerId });
    await db.transaction(async (tx) => {
      await tx.update(quotations).set({
        requestId: body.requestId ?? null, projectId: body.projectId ?? null,
        title: body.title ?? null, scopeOfWork: body.scopeOfWork ?? null,
        assumptions: body.assumptions ?? null, exclusions: body.exclusions ?? null,
        paymentTerms: body.paymentTerms ?? null, validUntil: body.validUntil ?? null,
        discountPct: String(body.discountPct), taxPct: String(body.taxPct),
        ...totals, updatedAt: new Date(),
      }).where(and(eq(quotations.id, id), eq(quotations.status, 'draft')));
      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
      await tx.insert(quotationItems).values(body.items.map((it, idx) => ({
        quotationId: id, kind: it.kind, description: it.description,
        qty: String(it.qty), unit: it.unit, unitPrice: it.unitPrice,
        lineTotal: lineTotal(it.qty, it.unitPrice), sortOrder: idx,
      })));
    });
    void auditFromReq(req, db)('quote.updated', { type: 'quotation', id }, { total: totals.total });
    return { ok: true };
  });

  /** Status transitions with server-side validation + concurrency guard on approval. */
  app.post('/api/finance/quotations/:id/transition', async (req) => {
    const actor = req.requireAuth();
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({ to: z.string().max(30) }), req.body);
    const db = req.db;
    const to = body.to;
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!q) throw notFound();
    assertTransition(QUOTE_TRANSITIONS, q.status, to, 'quotation');

    // permission per transition
    if (to === 'pending_approval' || to === 'draft') {
      if (!hasPerm(actor.role, 'quotes.write')) throw forbidden();
    } else if (to === 'approved') {
      if (!hasPerm(actor.role, 'quotes.approve')) throw forbidden();
    } else if (['sent', 'accepted', 'declined', 'expired', 'cancelled'].includes(to)) {
      if (!hasPerm(actor.role, 'quotes.write')) throw forbidden();
    }

    if (to === 'approved') {
      req.requireRecentAuth(30);
      // Concurrency guard: conditional update ensures only one approver succeeds.
      const [upd] = await db.update(quotations).set({
        status: 'approved', approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(quotations.id, id), eq(quotations.status, 'pending_approval'))).returning();
      if (!upd) throw conflict('APPROVAL_CONFLICT', 'This quotation was already processed by someone else');
      void auditFromReq(req, db)('quote.approved', { type: 'quotation', id }, { quoteNo: q.quoteNo, total: q.total });
      return { ok: true, status: 'approved' };
    }

    const [upd] = await db.update(quotations).set({
      status: to as typeof q.status,
      sentAt: to === 'sent' ? new Date() : q.sentAt,
      respondedAt: ['accepted', 'declined'].includes(to) ? new Date() : q.respondedAt,
      updatedAt: new Date(),
    }).where(and(eq(quotations.id, id), eq(quotations.status, q.status))).returning();
    if (!upd) throw conflict('STATE_CONFLICT', 'Quotation state changed concurrently; refresh and retry');

    if (to === 'sent' && q.requestId) {
      // If this quotation belongs to a public request, move it along too.
      await db.update(requests).set({ status: 'quotation_sent', updatedAt: new Date() })
        .where(and(eq(requests.id, q.requestId), inArray(requests.status, ['quotation_prepared', 'estimating'])));
      const [rq] = await db.select({ email: requests.email, contactName: requests.contactName, language: requests.language, reference: requests.reference }).from(requests).where(eq(requests.id, q.requestId)).limit(1);
      if (rq?.email) {
        await notify(db, {
          channel: 'email', toEmail: rq.email, locale: rq.language, templateKey: 'app.quote.ready',
          payload: { name: rq.contactName, quoteNo: q.quoteNo, total: q.total, currency: q.currency, validUntil: q.validUntil ?? '' },
          dedupeKey: `quote-sent:${q.id}`,
        });
      }
    }
    void auditFromReq(req, db)('quote.status_changed', { type: 'quotation', id }, { from: q.status, to });
    return { ok: true, status: to };
  });

  /** New version of a quotation (versioning; supersedes previous). */
  app.post('/api/finance/quotations/:id/new-version', async (req) => {
    const actor = req.requirePerm('quotes.write');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!q) throw notFound();
    if (!['sent', 'declined', 'expired', 'approved'].includes(q.status)) throw badRequest('INVALID_STATE', 'Create new versions only from sent/declined/expired/approved quotations');
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));
    const copy = await db.transaction(async (tx) => {
      const [nq] = await tx.insert(quotations).values({
        quoteNo: q.quoteNo, version: q.version + 1, supersedesId: q.id,
        customerId: q.customerId, requestId: q.requestId, projectId: q.projectId,
        currency: q.currency, title: q.title, scopeOfWork: q.scopeOfWork,
        assumptions: q.assumptions, exclusions: q.exclusions, paymentTerms: q.paymentTerms,
        validUntil: q.validUntil, discountPct: q.discountPct, taxPct: q.taxPct,
        subtotal: q.subtotal, discountAmount: q.discountAmount, taxAmount: q.taxAmount, total: q.total,
        status: 'draft', createdBy: actor.id,
      }).returning();
      await tx.insert(quotationItems).values(items.map((it) => ({
        quotationId: nq!.id, kind: it.kind, description: it.description, qty: it.qty,
        unit: it.unit, unitPrice: it.unitPrice, lineTotal: it.lineTotal, sortOrder: it.sortOrder,
      })));
      await tx.update(quotations).set({ status: 'cancelled' }).where(and(eq(quotations.id, q.id), eq(quotations.status, 'approved')));
      return nq!;
    });
    void auditFromReq(req, db)('quote.versioned', { type: 'quotation', id: copy.id }, { supersedes: id });
    return copy;
  });

  /** PDF export — any status except draft. Audited as a sensitive export. */
  app.get('/api/finance/quotations/:id/pdf', async (req, reply) => {
    req.requirePerm('quotes.read');
    const { id } = req.params as { id: string };
    const localeParam = (req.query as { locale?: string }).locale === 'ar' ? 'ar' : 'en';
    const db = req.db;
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!q) throw notFound();
    if (q.status === 'draft') throw badRequest('DRAFT_NOT_EXPORTABLE', 'Approve the quotation before exporting');
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)).orderBy(sql`sort_order`);
    const [cust] = await db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1);
    const company = await getCompany(db);
    const pdf = await generateQuotationPdf({
      locale: localeParam,
      company: {
        name: localeParam === 'ar' ? company.nameAr : company.nameEn,
        address: localeParam === 'ar' ? company.addressAr : company.addressEn,
        phone: company.phone, email: company.email, taxId: company.taxId,
      },
      quoteNo: q.quoteNo, version: q.version, status: q.status,
      issuedAt: q.createdAt.toISOString().slice(0, 10),
      validUntil: q.validUntil, currency: q.currency,
      customer: {
        name: cust?.name ?? '', company: cust?.company ?? null,
        phone: cust?.phone ?? null, email: cust?.email ?? null, address: cust?.address ?? null,
      },
      title: q.title,
      lines: items.map((it) => ({ description: it.description, qty: it.qty, unit: it.unit, unitPrice: it.unitPrice, lineTotal: it.lineTotal })),
      subtotal: q.subtotal, discountAmount: q.discountAmount, discountPct: q.discountPct,
      taxAmount: q.taxAmount, taxPct: q.taxPct, total: q.total,
      scopeOfWork: q.scopeOfWork, paymentTerms: q.paymentTerms,
      assumptions: q.assumptions, exclusions: q.exclusions,
    });
    void auditFromReq(req, db)('quote.pdf_exported', { type: 'quotation', id }, { locale: localeParam });
    return reply.type('application/pdf')
      .header('Content-Disposition', `attachment; filename="quotation-${q.quoteNo}-v${q.version}.pdf"`)
      .send(pdf);
  });

  // ================= CONTRACTS =================

  app.get('/api/finance/contracts', async (req) => {
    req.requirePerm('contracts.read');
    const { page, pageSize } = parsePagination(req);
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(contracts);
    const rows = await req.db.select().from(contracts).orderBy(desc(contracts.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0 };
  });

  app.post('/api/finance/contracts', async (req) => {
    const actor = req.requirePerm('contracts.write');
    const body = parseWith(z.object({
      customerId: z.string().uuid(),
      projectId: z.string().uuid().optional().nullable(),
      quotationId: z.string().uuid().optional().nullable(),
      amount: moneyStr,
      currency: z.enum(['LBP', 'USD']),
      startDate: dateStr.optional().nullable(),
      endDate: dateStr.optional().nullable(),
      scope: z.string().max(10000).optional().nullable(),
      notes: z.string().max(3000).optional().nullable(),
      documentFileId: z.string().uuid().optional().nullable(),
      paymentSchedule: z.array(z.object({
        label: z.string().max(200), dueDate: dateStr.optional().nullable(),
        amountPct: z.coerce.number().min(0).max(100).optional().nullable(),
        amount: moneyStr.optional().nullable(),
      })).max(50).optional(),
    }), req.body);
    if (Number(body.amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Contract amount must be positive');
    const db = req.db;
    const contractNo = await nextReference(db, { prefix: 'CON', width: 4 });
    const row = await db.transaction(async (tx) => {
      const [c] = await tx.insert(contracts).values({
        contractNo, customerId: body.customerId, projectId: body.projectId ?? null,
        quotationId: body.quotationId ?? null, amount: body.amount, currency: body.currency,
        startDate: body.startDate ?? null, endDate: body.endDate ?? null,
        scope: body.scope ?? null, notes: body.notes ?? null,
        documentFileId: body.documentFileId ?? null, createdBy: actor.id,
      }).returning();
      if (body.paymentSchedule?.length) {
        await tx.insert(contractPayments).values(body.paymentSchedule.map((p, idx) => ({
          contractId: c!.id, label: p.label, dueDate: p.dueDate ?? null,
          amountPct: p.amountPct != null ? String(p.amountPct) : null,
          amount: p.amount ?? null, sortOrder: idx,
        })));
      }
      if (body.projectId) {
        await tx.update(projects).set({ contractAmount: body.amount, contractCurrency: body.currency })
          .where(eq(projects.id, body.projectId));
      }
      return c!;
    });
    void auditFromReq(req, db)('contract.created', { type: 'contract', id: row.id }, { contractNo, amount: body.amount, currency: body.currency });
    return row;
  });

  app.get('/api/finance/contracts/:id', async (req) => {
    req.requirePerm('contracts.read');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [c] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!c) throw notFound();
    const schedule = await db.select().from(contractPayments).where(eq(contractPayments.contractId, id)).orderBy(sql`sort_order`);
    const cos = await db.select().from(changeOrders).where(eq(changeOrders.contractId, id)).orderBy(desc(changeOrders.createdAt));
    return { contract: c, paymentSchedule: schedule, changeOrders: cos };
  });

  app.post('/api/finance/contracts/:id/change-orders', async (req) => {
    req.requirePerm('contracts.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().max(3000).optional().nullable(),
      amount: moneyStr,
      currency: z.enum(['LBP', 'USD']),
    }), req.body);
    const db = req.db;
    const coNo = await nextReference(db, { prefix: 'CO', width: 4 });
    const [c] = await db.select({ projectId: contracts.projectId }).from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!c) throw notFound();
    const [row] = await db.insert(changeOrders).values({
      coNo, contractId: id, projectId: c.projectId, title: body.title,
      description: body.description ?? null, amount: body.amount, currency: body.currency,
    }).returning();
    void auditFromReq(req, db)('change_order.created', { type: 'change_order', id: row!.id }, { coNo, amount: body.amount });
    return row;
  });

  app.post('/api/finance/change-orders/:id/approve', async (req) => {
    const actor = req.requirePerm('contracts.write');
    req.requireRecentAuth(30);
    const { id } = req.params as { id: string };
    const db = req.db;
    const [row] = await db.update(changeOrders).set({ status: 'approved', approvedBy: actor.id, approvedAt: new Date() })
      .where(and(eq(changeOrders.id, id), eq(changeOrders.status, 'proposed'))).returning();
    if (!row) throw badRequest('INVALID_STATE', 'Change order not found or already processed');
    void auditFromReq(req, db)('change_order.approved', { type: 'change_order', id }, { amount: row.amount, currency: row.currency });
    return row;
  });

  // ================= INVOICES =================

  app.get('/api/finance/invoices', async (req) => {
    req.requirePerm('invoices.read');
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.status) conditions.push(eq(invoices.status, q.status as 'draft'));
    if (q.customerId) conditions.push(eq(invoices.customerId, q.customerId));
    if (q.projectId) conditions.push(eq(invoices.projectId, q.projectId));
    const where = conditions.length ? and(...conditions) : undefined;
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(where);
    const rows = await req.db.select({
      id: invoices.id, invoiceNo: invoices.invoiceNo, status: invoices.status, currency: invoices.currency,
      total: invoices.total, paidTotal: invoices.paidTotal, issueDate: invoices.issueDate, dueDate: invoices.dueDate,
      customerId: invoices.customerId, projectId: invoices.projectId, customerName: customers.name,
    }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(where).orderBy(desc(invoices.issueDate)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });

  const invoiceSchema = z.object({
    customerId: z.string().uuid(),
    projectId: z.string().uuid().optional().nullable(),
    contractId: z.string().uuid().optional().nullable(),
    quotationId: z.string().uuid().optional().nullable(),
    currency: z.enum(['LBP', 'USD']),
    issueDate: dateStr,
    dueDate: dateStr.optional().nullable(),
    taxPct: z.coerce.number().min(0).max(100).default(0),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(z.object({
      description: z.string().trim().min(1).max(400),
      qty: z.coerce.number().positive().max(1_000_000).default(1),
      unit: z.string().max(30).default('unit'),
      unitPrice: moneyStr,
    })).min(1).max(200),
  });

  app.post('/api/finance/invoices', async (req) => {
    const actor = req.requirePerm('invoices.write');
    const body = parseWith(invoiceSchema, req.body);
    const db = req.db;
    const lines = body.items.map((it) => lineTotal(it.qty, it.unitPrice));
    const totals = computeTotals(lines, 0, body.taxPct);
    const invoiceNo = await nextReference(db, { prefix: 'INV', width: 4 });
    const row = await db.transaction(async (tx) => {
      const [inv] = await tx.insert(invoices).values({
        invoiceNo, customerId: body.customerId, projectId: body.projectId ?? null,
        contractId: body.contractId ?? null, quotationId: body.quotationId ?? null,
        currency: body.currency, issueDate: body.issueDate, dueDate: body.dueDate ?? null,
        taxPct: String(body.taxPct), ...totals, notes: body.notes ?? null, createdBy: actor.id,
      }).returning();
      await tx.insert(invoiceItems).values(body.items.map((it, idx) => ({
        invoiceId: inv!.id, description: it.description, qty: String(it.qty),
        unit: it.unit, unitPrice: it.unitPrice, lineTotal: lineTotal(it.qty, it.unitPrice), sortOrder: idx,
      })));
      return inv!;
    });
    void auditFromReq(req, db)('invoice.created', { type: 'invoice', id: row.id }, { invoiceNo, total: row.total, currency: row.currency });
    return row;
  });

  app.get('/api/finance/invoices/:id', async (req) => {
    req.requirePerm('invoices.read');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!inv) throw notFound();
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(sql`sort_order`);
    const pays = await db.select().from(receipts).where(and(eq(receipts.invoiceId, id), sql`${receipts.voidedAt} IS NULL`)).orderBy(desc(receipts.receivedOn));
    return { invoice: inv, items, payments: pays };
  });

  app.post('/api/finance/invoices/:id/transition', async (req) => {
    req.requirePerm('invoices.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({ to: z.enum(['sent', 'cancelled']) }), req.body);
    const db = req.db;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!inv) throw notFound();
    assertTransition(INVOICE_TRANSITIONS, inv.status, body.to, 'invoice');
    const [upd] = await db.update(invoices).set({ status: body.to, updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.status, inv.status))).returning();
    if (!upd) throw conflict('STATE_CONFLICT', 'Invoice state changed concurrently; refresh and retry');
    void auditFromReq(req, db)('invoice.status_changed', { type: 'invoice', id }, { from: inv.status, to: body.to });
    return upd;
  });

  // ================= RECEIPTS (customer payments) =================

  /**
   * Record a customer payment against an invoice (or standalone).
   * Runs in a transaction with a row lock on the invoice to prevent duplicate/
   * concurrent over-allocation. A DB unique index also blocks the same external
   * reference being recorded twice on one invoice.
   */
  app.post('/api/finance/receipts', async (req) => {
    const actor = req.requirePerm('invoices.write');
    req.requireRecentAuth(30);
    const body = parseWith(z.object({
      invoiceId: z.string().uuid().optional().nullable(),
      customerId: z.string().uuid(),
      projectId: z.string().uuid().optional().nullable(),
      amount: moneyStr,
      currency: z.enum(['LBP', 'USD']),
      method: z.enum(['cash', 'transfer', 'check', 'card']).default('cash'),
      externalRef: z.string().max(120).optional().nullable(),
      receivedOn: dateStr,
      notes: z.string().max(300).optional().nullable(),
    }), req.body);
    if (Number(body.amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Amount must be positive');
    const db = req.db;
    const receiptNo = await nextReference(db, { prefix: 'REC', width: 4 });

    const result = await db.transaction(async (tx) => {
      let invoice = null as typeof invoices.$inferSelect | null;
      if (body.invoiceId) {
        // Row-level lock prevents concurrent double allocation, then read via ORM for typed columns.
        const locked = await tx.execute(sql`SELECT id FROM invoices WHERE id = ${body.invoiceId} FOR UPDATE`) as unknown as Array<{ id: string }>;
        if (!locked[0]) throw notFound('INVOICE_NOT_FOUND', 'Invoice not found');
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, body.invoiceId)).limit(1);
        invoice = inv ?? null;
        if (!invoice) throw notFound('INVOICE_NOT_FOUND', 'Invoice not found');
        if (invoice.status === 'cancelled') throw badRequest('INVOICE_CANCELLED', 'Cannot pay a cancelled invoice');
        if (invoice.currency !== body.currency) {
          throw badRequest('CURRENCY_MISMATCH', `Invoice is in ${invoice.currency}; payment recorded in ${body.currency} is not allowed without conversion`);
        }
        const remaining = Number(invoice.total) - Number(invoice.paidTotal);
        if (Number(body.amount) > remaining + 0.0001) {
          throw badRequest('OVERPAYMENT', `Amount exceeds outstanding balance (${remaining.toFixed(2)} ${invoice.currency})`);
        }
      }
      const [rec] = await tx.insert(receipts).values({
        receiptNo, invoiceId: body.invoiceId ?? null, customerId: body.customerId,
        projectId: body.projectId ?? invoice?.projectId ?? null,
        amount: body.amount, currency: body.currency, method: body.method,
        externalRef: body.externalRef ?? null, receivedOn: body.receivedOn,
        notes: body.notes ?? null, recordedBy: actor.id,
      }).returning();
      if (invoice) {
        const newPaid = sumSameCurrency(invoice!.currency as Currency, [invoice!.paidTotal, body.amount]);
        const newStatus = Number(newPaid) + 0.0001 >= Number(invoice!.total) ? 'paid' : 'partial';
        await tx.update(invoices).set({ paidTotal: newPaid, status: newStatus, updatedAt: new Date() })
          .where(eq(invoices.id, invoice!.id));
      }
      return rec!;
    }).catch((err) => {
      if (err instanceof HttpError) throw err;
      if (isUniqueViolation(err, 'receipts_dup_guard')) {
        throw conflict('DUPLICATE_PAYMENT', 'A payment with this external reference already exists for this invoice');
      }
      throw err;
    });

    void auditFromReq(req, db)('receipt.created', { type: 'receipt', id: result.id }, { receiptNo, amount: body.amount, currency: body.currency, invoiceId: body.invoiceId });
    return result;
  });

  app.post('/api/finance/receipts/:id/void', async (req) => {
    req.requirePerm('invoices.write');
    req.requireRecentAuth(15);
    const { id } = req.params as { id: string };
    const db = req.db;
    await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM receipts WHERE id = ${id} AND voided_at IS NULL FOR UPDATE`) as unknown as Array<{ id: string }>;
      if (!locked[0]) throw notFound('RECEIPT_NOT_FOUND', 'Receipt not found or already voided');
      const [rec] = await tx.select().from(receipts).where(eq(receipts.id, id)).limit(1);
      if (!rec) throw notFound('RECEIPT_NOT_FOUND', 'Receipt not found or already voided');
      await tx.update(receipts).set({ voidedAt: new Date() }).where(eq(receipts.id, id));
      if (rec.invoiceId) {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, rec.invoiceId)).limit(1);
        if (inv) {
          const newPaid = sumSameCurrency(inv.currency as Currency, [inv.paidTotal, `-${rec.amount}`]);
          const status = Number(newPaid) <= 0.0001 ? 'sent' : (Number(newPaid) + 0.0001 >= Number(inv.total) ? 'paid' : 'partial');
          await tx.update(invoices).set({ paidTotal: newPaid, status, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
        }
      }
    });
    void auditFromReq(req, db)('receipt.voided', { type: 'receipt', id }, {});
    return { ok: true };
  });

  /** Accounts receivable per customer, grouped by currency (never mixed). */
  app.get('/api/finance/receivables', async (req) => {
    req.requirePerm('invoices.read');
    const rows = await req.db.execute(sql`
      SELECT c.id, c.name, i.currency,
             SUM(i.total)::text AS invoiced,
             SUM(i.paid_total)::text AS paid,
             SUM(i.total - i.paid_total)::text AS outstanding
      FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.status NOT IN ('cancelled','draft')
      GROUP BY c.id, c.name, i.currency
      HAVING SUM(i.total - i.paid_total) > 0.0001
      ORDER BY outstanding DESC`);
    return { items: rows };
  });

  // ================= SUPPLIERS =================

  app.get('/api/finance/suppliers', async (req) => {
    req.requirePerm('expenses.read');
    const rows = await req.db.select().from(suppliers).where(sql`${suppliers.deletedAt} IS NULL`).orderBy(desc(suppliers.name)).limit(500);
    return { items: rows };
  });

  app.post('/api/finance/suppliers', async (req) => {
    req.requirePerm('expenses.write');
    const body = parseWith(z.object({
      name: z.string().trim().min(2).max(200),
      kind: z.enum(['supplier', 'subcontractor']).default('supplier'),
      phone: z.string().max(30).optional().nullable(),
      email: z.string().email().max(320).optional().or(z.literal('')).transform((v) => v || null),
      address: z.string().max(300).optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
    }), req.body);
    const [row] = await req.db.insert(suppliers).values(body).returning();
    void auditFromReq(req, req.db)('supplier.created', { type: 'supplier', id: row!.id }, { name: body.name });
    return row;
  });

}
