import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requests, requestEvents, categories, customers, files, siteVisits } from '../db/schema.js';
import { parseWith, badRequest, notFound, HttpError, forbidden } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { nextReference } from '../lib/ref.js';
import { randomToken, sha256, safeEqual } from '../lib/tokens.js';
import { notify } from '../lib/notify.js';
import { statusLabel } from '../lib/i18n.js';
import { config } from '../config.js';
import { storeUpload, FileValidationError } from '../lib/files.js';
import { phoneSchema, optionalEmail, honeypotSchema, parsePagination } from './common.js';
import { convertRequestToProject } from './conversion.js';

/**
 * Allowed workflow transitions. Not every status is used for every request;
 * the backend rejects anything outside this map (business-logic abuse guard).
 */
export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'cancelled'],
  under_review: ['needs_info', 'site_visit', 'estimating', 'cancelled'],
  needs_info: ['under_review', 'estimating', 'cancelled', 'expired'],
  site_visit: ['estimating', 'needs_info', 'cancelled'],
  estimating: ['quotation_prepared', 'needs_info', 'cancelled'],
  quotation_prepared: ['quotation_sent', 'estimating', 'cancelled'],
  quotation_sent: ['accepted', 'declined', 'expired', 'estimating'],
  accepted: ['contracted', 'declined', 'cancelled'],
  declined: ['under_review'],
  expired: ['under_review'],
  contracted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertRequestTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed = REQUEST_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest('INVALID_TRANSITION', `Cannot move request from '${from}' to '${to}'`, { allowed });
  }
}

const submitSchema = z.object({
  contactName: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  email: optionalEmail,
  company: z.string().max(200).optional().nullable(),
  language: z.enum(['ar', 'en']).default('ar'),
  categoryId: z.string().uuid(),
  description: z.string().trim().min(10).max(5000),
  governorate: z.string().max(80).optional().nullable(),
  district: z.string().max(80).optional().nullable(),
  town: z.string().max(120).optional().nullable(),
  propertyType: z.enum(['apartment', 'villa', 'house', 'building', 'commercial', 'industrial', 'land', 'other']).optional().nullable(),
  areaValue: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  areaUnit: z.enum(['m2', 'm']).default('m2'),
  desiredStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  budget: z.string().regex(/^\d{0,14}(\.\d{1,2})?$/).optional().nullable(),
  budgetCurrency: z.enum(['LBP', 'USD']).optional().nullable(),
  preferredContact: z.enum(['phone', 'email', 'whatsapp']).default('phone'),
  consentGiven: z.literal(true, { error: 'Consent to the privacy notice is required' }),
  website: honeypotSchema,
});

export function registerRequestRoutes(app: FastifyInstance): void {
  /** PUBLIC customer contract-request submission (multipart: `data` JSON + files). */
  app.post('/api/public/requests', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const db = req.db;
    let dataJson: string | null = null;
    const uploadedIds: string[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'data') dataJson = String(part.value ?? '');
      } else if (part.type === 'file') {
        try {
          const stored = await storeUpload(db, part, { type: 'request' }, null);
          uploadedIds.push(stored.id);
        } catch (err) {
          if (err instanceof FileValidationError) throw badRequest('FILE_REJECTED', err.message);
          throw err;
        }
      }
    }
    if (!dataJson) throw badRequest('VALIDATION_ERROR', 'Missing request data');
    const body = parseWith(submitSchema, JSON.parse(dataJson));
    if (body.website) return reply.status(200).send({ ok: true, reference: null });

    // Validate category is an active request-category.
    const [cat] = await db.select().from(categories)
      .where(and(eq(categories.id, body.categoryId), eq(categories.kind, 'request'), eq(categories.active, true))).limit(1);
    if (!cat) throw badRequest('INVALID_CATEGORY', 'Selected request category is not available');

    const reference = await nextReference(db, { prefix: 'REQ', width: 6 });
    const accessToken = randomToken(24);
    const [row] = await db.insert(requests).values({
      reference,
      accessTokenHash: sha256(accessToken),
      contactName: body.contactName,
      phone: body.phone,
      email: body.email ?? null,
      company: body.company ?? null,
      language: body.language,
      categoryId: body.categoryId,
      description: body.description,
      governorate: body.governorate ?? null,
      district: body.district ?? null,
      town: body.town ?? null,
      propertyType: body.propertyType ?? null,
      areaValue: body.areaValue != null ? String(body.areaValue) : null,
      areaUnit: body.areaUnit,
      desiredStart: body.desiredStart ?? null,
      deadline: body.deadline ?? null,
      budget: body.budget ?? null,
      budgetCurrency: body.budgetCurrency ?? null,
      preferredContact: body.preferredContact,
      consentGiven: true,
      status: 'submitted',
    }).returning({ id: requests.id });

    if (uploadedIds.length) await db.update(files).set({ ownerId: row!.id }).where(inArray(files.id, uploadedIds));
    await db.insert(requestEvents).values({
      requestId: row!.id, eventType: 'status_change', toStatus: 'submitted', visibility: 'customer',
      messageEn: 'Request submitted. Our team will review it shortly.',
      messageAr: 'تم تقديم الطلب. سيقوم فريقنا بمراجعته قريباً.',
    });

    const trackUrl = `${config.appBaseUrl}/track?type=request&reference=${reference}&token=${accessToken}`;
    if (body.email) {
      await notify(db, {
        channel: 'email', toEmail: body.email, locale: body.language, templateKey: 'app.received.request',
        payload: { name: body.contactName, reference, category: body.language === 'ar' ? cat.nameAr : cat.nameEn, url: trackUrl },
        dedupeKey: `req-submit:${row!.id}`,
      });
    }
    void auditFromReq(req, db)('request.submitted', { type: 'request', id: row!.id }, { reference });
    return reply.status(201).send({ ok: true, reference, accessToken, trackUrl });
  });

  /** PUBLIC tracking by reference + token. */
  app.post('/api/public/requests/track', {
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
  }, async (req) => {
    const body = parseWith(z.object({
      reference: z.string().trim().min(4).max(30),
      token: z.string().min(20).max(200),
    }), req.body);
    const db = req.db;
    const [row] = await db.select().from(requests).where(eq(requests.reference, body.reference.toUpperCase())).limit(1);
    if (!row || !safeEqual(sha256(body.token), row.accessTokenHash)) {
      throw new HttpError(404, 'NOT_FOUND', 'Request not found for the given reference and token');
    }
    const events = await db.select({
      eventType: requestEvents.eventType, toStatus: requestEvents.toStatus, visibility: requestEvents.visibility,
      messageEn: requestEvents.messageEn, messageAr: requestEvents.messageAr, createdAt: requestEvents.createdAt,
    }).from(requestEvents)
      .where(and(eq(requestEvents.requestId, row.id), eq(requestEvents.visibility, 'customer')))
      .orderBy(desc(requestEvents.createdAt));
    const atts = await db.select({ id: files.id, originalName: files.originalName, sizeBytes: files.sizeBytes })
      .from(files).where(and(eq(files.ownerType, 'request'), eq(files.ownerId, row.id), isNull(files.deletedAt)));
    return {
      reference: row.reference, status: row.status, contactName: row.contactName,
      submittedAt: row.submittedAt, events, attachments: atts,
      // Never expose internal notes.
    };
  });

  // ---------------- staff ----------------

  app.get('/api/requests', async (req) => {
    req.requirePerm('requests.read');
    const db = req.db;
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.status) conditions.push(eq(requests.status, q.status as 'submitted'));
    if (q.categoryId) conditions.push(eq(requests.categoryId, q.categoryId));
    if (q.assignedTo) conditions.push(eq(requests.assignedTo, q.assignedTo));
    if (q.q) {
      conditions.push(sql`(contact_name ILIKE ${'%' + q.q.slice(0, 80) + '%'} OR phone ILIKE ${'%' + q.q.slice(0, 30) + '%'} OR reference ILIKE ${'%' + q.q.slice(0, 30) + '%'})`);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(requests).where(where);
    const rows = await db.select().from(requests).where(where)
      .orderBy(desc(requests.submittedAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });

  app.get('/api/requests/:id', async (req) => {
    req.requirePerm('requests.read');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
    if (!row) throw notFound();
    const events = await db.select().from(requestEvents).where(eq(requestEvents.requestId, id)).orderBy(desc(requestEvents.createdAt));
    const atts = await db.select({ id: files.id, originalName: files.originalName, mimeType: files.mimeType, sizeBytes: files.sizeBytes })
      .from(files).where(and(eq(files.ownerType, 'request'), eq(files.ownerId, id), isNull(files.deletedAt)));
    const [cat] = row.categoryId ? await db.select().from(categories).where(eq(categories.id, row.categoryId)).limit(1) : [null];
    const visits = await db.select().from(siteVisits).where(eq(siteVisits.requestId, id)).orderBy(desc(siteVisits.scheduledAt));
    return { request: row, events, attachments: atts, category: cat, siteVisits: visits };
  });

  app.post('/api/requests/:id/status', async (req) => {
    const actor = req.requirePerm('requests.manage');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      status: z.enum(Object.keys(REQUEST_TRANSITIONS) as [string, ...string[]]),
      internalNote: z.string().max(3000).optional().nullable(),
      customerMessageEn: z.string().max(1000).optional().nullable(),
      customerMessageAr: z.string().max(1000).optional().nullable(),
      notifyCustomer: z.boolean().default(true),
    }), req.body);
    const db = req.db;
    const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
    if (!row) throw notFound();
    assertRequestTransition(row.status, body.status);
    await db.update(requests).set({
      status: body.status as typeof row.status,
      internalNotes: body.internalNote ?? row.internalNotes,
      updatedAt: new Date(),
    }).where(and(eq(requests.id, id), eq(requests.status, row.status)));
    await db.insert(requestEvents).values({
      requestId: id, actorId: actor.id, eventType: 'status_change',
      fromStatus: row.status, toStatus: body.status,
      visibility: body.customerMessageEn || body.customerMessageAr ? 'customer' : 'internal',
      messageEn: body.customerMessageEn ?? null, messageAr: body.customerMessageAr ?? null,
    });
    if (body.internalNote) {
      await db.insert(requestEvents).values({
        requestId: id, actorId: actor.id, eventType: 'note', visibility: 'internal', messageEn: body.internalNote,
      });
    }
    if (body.notifyCustomer && row.email) {
      await notify(db, {
        channel: 'email', toEmail: row.email, locale: row.language, templateKey: 'app.status',
        payload: {
          name: row.contactName, reference: row.reference,
          status: statusLabel(body.status, row.language),
          message: (row.language === 'ar' ? body.customerMessageAr : body.customerMessageEn) ?? '',
          url: `${config.appBaseUrl}/track`,
        },
      });
    }
    void auditFromReq(req, db)('request.status_changed', { type: 'request', id }, { from: row.status, to: body.status });
    return { ok: true, status: body.status };
  });

  app.post('/api/requests/:id/assign', async (req) => {
    req.requirePerm('requests.manage');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({ assignedTo: z.string().uuid().nullable() }), req.body);
    const [row] = await req.db.update(requests).set({ assignedTo: body.assignedTo, updatedAt: new Date() })
      .where(eq(requests.id, id)).returning({ id: requests.id });
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('request.assigned', { type: 'request', id }, { assignedTo: body.assignedTo });
    return { ok: true };
  });

  app.post('/api/requests/:id/site-visits', async (req) => {
    const actor = req.requirePerm('requests.manage');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      scheduledAt: z.string().datetime({ offset: true }),
      visitorUserId: z.string().uuid().optional().nullable(),
      location: z.string().max(300).optional().nullable(),
    }), req.body);
    const [row] = await req.db.insert(siteVisits).values({
      requestId: id, scheduledAt: new Date(body.scheduledAt),
      visitorUserId: body.visitorUserId ?? actor.id, location: body.location ?? null,
    }).returning();
    await req.db.insert(requestEvents).values({
      requestId: id, actorId: actor.id, eventType: 'site_visit', visibility: 'internal',
      messageEn: `Site visit scheduled for ${body.scheduledAt}`,
    });
    void auditFromReq(req, req.db)('request.site_visit_scheduled', { type: 'request', id }, {});
    return row;
  });

  /** Convert an accepted request into a project (history preserved via request link). */
  app.post('/api/requests/:id/convert', async (req) => {
    const actor = req.requirePerm('requests.manage');
    if (!['owner', 'admin', 'pm'].includes(actor.role)) throw forbidden('PERMISSION_DENIED', 'Only managers can convert requests to projects');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      name: z.string().trim().min(2).max(200),
      description: z.string().max(5000).optional().nullable(),
      managerId: z.string().uuid().optional().nullable(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      targetEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      contractAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).optional().nullable(),
      contractCurrency: z.enum(['LBP', 'USD']).optional().nullable(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    }), req.body);
    const db = req.db;
    const result = await db.transaction(async (tx) =>
      convertRequestToProject(tx, id, body, actor.id));
    void auditFromReq(req, db)('request.converted_to_project',
      { type: 'request', id }, { projectId: result.projectId, projectNo: result.projectNo });
    return result;
  });

  /** Customer list (staff-managed). */
  app.get('/api/customers', async (req) => {
    req.requirePerm('customers.read');
    const q = (req.query as Record<string, string | undefined>).q;
    const { page, pageSize } = parsePagination(req);
    const where = q
      ? and(isNull(customers.deletedAt), sql`(name ILIKE ${'%' + q.slice(0, 80) + '%'} OR phone ILIKE ${'%' + q.slice(0, 30) + '%'} OR company ILIKE ${'%' + q.slice(0, 80) + '%'})`)
      : isNull(customers.deletedAt);
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where);
    const rows = await req.db.select().from(customers).where(where)
      .orderBy(desc(customers.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0 };
  });

  app.post('/api/customers', async (req) => {
    req.requirePerm('customers.write');
    const body = parseWith(z.object({
      name: z.string().trim().min(2).max(200),
      company: z.string().max(200).optional().nullable(),
      phone: phoneSchema.optional().nullable(),
      email: optionalEmail,
      language: z.enum(['ar', 'en']).default('ar'),
      address: z.string().max(300).optional().nullable(),
      taxId: z.string().max(60).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }), req.body);
    const [row] = await req.db.insert(customers).values(body).returning();
    void auditFromReq(req, req.db)('customer.created', { type: 'customer', id: row!.id }, { name: body.name });
    return row;
  });
}
