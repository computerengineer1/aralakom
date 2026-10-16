import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applications, applicationEvents, categories, files } from '../db/schema.js';
import { parseWith, badRequest, notFound, HttpError } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { nextReference } from '../lib/ref.js';
import { randomToken, sha256, safeEqual } from '../lib/tokens.js';
import { notify } from '../lib/notify.js';
import { t, statusLabel } from '../lib/i18n.js';
import { config } from '../config.js';
import { storeUpload, FileValidationError } from '../lib/files.js';
import { phoneSchema, optionalEmail, honeypotSchema, parsePagination } from './common.js';
import { nextPersonnelFromApplication } from './conversion.js';

export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'shortlisted', 'rejected'],
  under_review: ['shortlisted', 'interview', 'approved', 'rejected'],
  shortlisted: ['interview', 'approved', 'rejected'],
  interview: ['approved', 'rejected'],
  approved: ['hired', 'rejected'],
  rejected: ['under_review'], // allow reopen with audit
  hired: [],
};

export function assertApplicationTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed = APPLICATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest('INVALID_TRANSITION', `Cannot move application from '${from}' to '${to}'`, { allowed });
  }
}

const submitSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  email: optionalEmail,
  personType: z.enum(['worker', 'technician', 'engineer', 'other']),
  categoryId: z.string().uuid().nullable().optional(),
  skills: z.string().max(1000).optional().nullable(),
  experienceYears: z.coerce.number().int().min(0).max(70).default(0),
  qualifications: z.string().max(2000).optional().nullable(),
  languages: z.string().max(200).optional().nullable(),
  governorate: z.string().max(80).optional().nullable(),
  district: z.string().max(80).optional().nullable(),
  town: z.string().max(120).optional().nullable(),
  preferredLocations: z.string().max(500).optional().nullable(),
  availability: z.string().max(60).optional().nullable(),
  expectedRate: z.string().regex(/^\d{0,14}(\.\d{1,2})?$/).optional().nullable(),
  expectedRateCurrency: z.enum(['LBP', 'USD']).optional().nullable(),
  consentGiven: z.literal(true, { error: 'Consent to the privacy notice is required' }),
  locale: z.enum(['ar', 'en']).default('ar'),
  website: honeypotSchema, // honeypot: must be empty
});

export function registerApplicationRoutes(app: FastifyInstance): void {
  /**
   * PUBLIC submission. multipart/form-data: field `data` (JSON) + up to 5 files.
   * Protections: rate limit, honeypot, consent required, no self-assigned status.
   */
  app.post('/api/public/applications', {
    config: { rateLimit: { max: config.isProd ? 20 : 200, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const db = req.db;
    let dataJson: string | null = null;
    const uploadedIds: string[] = [];
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'data') dataJson = String(part.value ?? '');
      } else if (part.type === 'file') {
        try {
          const stored = await storeUpload(db, part, { type: 'application' }, null);
          uploadedIds.push(stored.id);
        } catch (err) {
          if (err instanceof FileValidationError) throw badRequest('FILE_REJECTED', err.message);
          throw err;
        }
      }
    }
    if (!dataJson) throw badRequest('VALIDATION_ERROR', 'Missing application data');
    const body = parseWith(submitSchema, JSON.parse(dataJson));
    if (body.website) { // honeypot triggered: pretend success, persist nothing
      return reply.status(200).send({ ok: true, reference: null });
    }

    const reference = await nextReference(db, { prefix: 'APP', width: 6 });
    const accessToken = randomToken(24);
    const [row] = await db.insert(applications).values({
      reference,
      accessTokenHash: sha256(accessToken),
      fullName: body.fullName,
      phone: body.phone,
      email: body.email ?? null,
      personType: body.personType,
      categoryId: body.categoryId ?? null,
      skills: body.skills ?? null,
      experienceYears: body.experienceYears,
      qualifications: body.qualifications ?? null,
      languages: body.languages ?? null,
      governorate: body.governorate ?? null,
      district: body.district ?? null,
      town: body.town ?? null,
      preferredLocations: body.preferredLocations ?? null,
      availability: body.availability ?? null,
      expectedRate: body.expectedRate ?? null,
      expectedRateCurrency: body.expectedRateCurrency ?? null,
      consentGiven: true,
      status: 'submitted',
    }).returning({ id: applications.id });

    if (uploadedIds.length) {
      await db.update(files).set({ ownerId: row!.id }).where(inArray(files.id, uploadedIds));
    }

    await db.insert(applicationEvents).values({
      applicationId: row!.id, eventType: 'status_change', toStatus: 'submitted',
      visibility: 'applicant',
      messageEn: 'Application submitted.', messageAr: 'تم تقديم الطلب.',
    });

    const trackUrl = `${config.appBaseUrl}/track?type=application&reference=${reference}&token=${accessToken}`;
    if (body.email) {
      await notify(db, {
        channel: 'email', toEmail: body.email, locale: body.locale, templateKey: 'app.received.application',
        payload: { name: body.fullName, reference, url: trackUrl },
        dedupeKey: `app-submit:${row!.id}`,
      });
    }
    void auditFromReq(req, db)('application.submitted', { type: 'application', id: row!.id }, { reference });

    return reply.status(201).send({
      ok: true,
      reference,
      accessToken, // shown once to the applicant; stored only as a hash
      trackUrl,
    });
  });

  /** PUBLIC status tracking: requires reference + access token (unguessable). */
  app.post('/api/public/applications/track', {
    config: { rateLimit: { max: config.isProd ? 60 : 300, timeWindow: '10 minutes' } },
  }, async (req) => {
    const body = parseWith(z.object({
      reference: z.string().trim().min(4).max(30),
      token: z.string().min(20).max(200),
    }), req.body);
    const db = req.db;
    const [row] = await db.select().from(applications).where(eq(applications.reference, body.reference.toUpperCase())).limit(1);
    if (!row || !safeEqual(sha256(body.token), row.accessTokenHash)) {
      // Same response for missing/invalid — no enumeration.
      throw new HttpError(404, 'NOT_FOUND', 'Application not found for the given reference and token');
    }
    const events = await db.select({
      eventType: applicationEvents.eventType, toStatus: applicationEvents.toStatus,
      visibility: applicationEvents.visibility, messageEn: applicationEvents.messageEn,
      messageAr: applicationEvents.messageAr, createdAt: applicationEvents.createdAt,
    }).from(applicationEvents)
      .where(and(eq(applicationEvents.applicationId, row.id), eq(applicationEvents.visibility, 'applicant')))
      .orderBy(desc(applicationEvents.createdAt));
    const atts = await db.select({ id: files.id, originalName: files.originalName, sizeBytes: files.sizeBytes })
      .from(files).where(and(eq(files.ownerType, 'application'), eq(files.ownerId, row.id), isNull(files.deletedAt)));
    return {
      reference: row.reference,
      status: row.status,
      fullName: row.fullName,
      publicMessage: row.publicMessage,
      submittedAt: row.submittedAt,
      events,
      attachments: atts,
    };
  });

  // ---------------- staff ----------------

  app.get('/api/applications', async (req) => {
    req.requirePerm('applications.read');
    const db = req.db;
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.status) conditions.push(eq(applications.status, q.status as 'submitted'));
    if (q.personType) conditions.push(eq(applications.personType, q.personType as 'worker'));
    if (q.categoryId) conditions.push(eq(applications.categoryId, q.categoryId));
    if (q.q) {
      conditions.push(sql`(full_name ILIKE ${'%' + q.q.slice(0, 80) + '%'} OR phone ILIKE ${'%' + q.q.slice(0, 30) + '%'})`);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(where);
    const rows = await db.select().from(applications).where(where)
      .orderBy(desc(applications.submittedAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });

  app.get('/api/applications/:id', async (req) => {
    req.requirePerm('applications.read');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [row] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
    if (!row) throw notFound();
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.createdAt));
    const atts = await db.select({ id: files.id, originalName: files.originalName, mimeType: files.mimeType, sizeBytes: files.sizeBytes })
      .from(files).where(and(eq(files.ownerType, 'application'), eq(files.ownerId, id), isNull(files.deletedAt)));
    const [cat] = row.categoryId ? await db.select().from(categories).where(eq(categories.id, row.categoryId)).limit(1) : [null];
    return { application: row, events, attachments: atts, category: cat };
  });

  app.post('/api/applications/:id/status', async (req) => {
    const actor = req.requirePerm('applications.review');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      status: z.enum(['under_review', 'shortlisted', 'interview', 'approved', 'rejected', 'hired']),
      internalNote: z.string().max(3000).optional().nullable(),
      publicMessageEn: z.string().max(1000).optional().nullable(),
      publicMessageAr: z.string().max(1000).optional().nullable(),
      evaluationScore: z.number().int().min(0).max(10).optional().nullable(),
      notifyApplicant: z.boolean().default(true),
    }), req.body);
    const db = req.db;

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(applications).where(eq(applications.id, id)).limit(1);
      if (!row) throw notFound();
      assertApplicationTransition(row.status, body.status);
      if (body.status === 'hired' && !row.personnelId) {
        // create the personnel record as part of the same transaction
        const pid = await nextPersonnelFromApplication(tx, row, actor.id);
        await tx.update(applications).set({
          status: body.status, personnelId: pid, reviewedBy: actor.id, reviewedAt: new Date(),
          internalNotes: body.internalNote ?? row.internalNotes,
          publicMessage: body.publicMessageEn ?? row.publicMessage,
          evaluationScore: body.evaluationScore ?? row.evaluationScore,
          updatedAt: new Date(),
        }).where(eq(applications.id, id));
        return { row, personnelId: pid };
      }
      const [upd] = await tx.update(applications).set({
        status: body.status, reviewedBy: actor.id, reviewedAt: new Date(),
        internalNotes: body.internalNote ?? row.internalNotes,
        publicMessage: body.publicMessageEn ?? row.publicMessage,
        evaluationScore: body.evaluationScore ?? row.evaluationScore,
        updatedAt: new Date(),
      }).where(eq(applications.id, id)).returning();
      return { row: upd!, personnelId: row.personnelId };
    });

    await db.insert(applicationEvents).values({
      applicationId: id, actorId: actor.id, eventType: 'status_change',
      fromStatus: result.row.status, toStatus: body.status,
      visibility: body.publicMessageEn || body.publicMessageAr ? 'applicant' : 'internal',
      messageEn: body.publicMessageEn ?? null, messageAr: body.publicMessageAr ?? null,
    });
    if (body.internalNote) {
      await db.insert(applicationEvents).values({
        applicationId: id, actorId: actor.id, eventType: 'note', visibility: 'internal',
        messageEn: body.internalNote,
      });
    }
    if (body.notifyApplicant && result.row.email) {
      const locale = 'en';
      await notify(db, {
        channel: 'email', toEmail: result.row.email, locale, templateKey: 'app.status',
        payload: {
          name: result.row.fullName, reference: result.row.reference,
          status: statusLabel(body.status, locale),
          message: body.publicMessageEn ?? '',
          url: `${config.appBaseUrl}/track`,
        },
      });
    }
    void auditFromReq(req, db)('application.status_changed',
      { type: 'application', id }, { from: result.row.status, to: body.status });
    return { ok: true, status: body.status };
  });

  app.post('/api/applications/:id/notes', async (req) => {
    const actor = req.requirePerm('applications.review');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      note: z.string().trim().min(1).max(3000),
      visibility: z.enum(['internal', 'applicant']).default('internal'),
      messageAr: z.string().max(1000).optional().nullable(),
      messageEn: z.string().max(1000).optional().nullable(),
    }), req.body);
    await req.db.insert(applicationEvents).values({
      applicationId: id, actorId: actor.id,
      eventType: body.visibility === 'applicant' ? 'message' : 'note',
      visibility: body.visibility,
      messageEn: body.visibility === 'applicant' ? body.messageEn ?? body.note : body.note,
      messageAr: body.visibility === 'applicant' ? body.messageAr ?? null : null,
    });
    void auditFromReq(req, req.db)('application.note_added', { type: 'application', id }, { visibility: body.visibility });
    return { ok: true };
  });

  /** Data-subject request handling: correction/deletion requests recorded + resolved by HR. */
  app.post('/api/public/applications/data-request', {
    config: { rateLimit: { max: config.isProd ? 10 : 100, timeWindow: '15 minutes' } },
  }, async (req) => {
    const body = parseWith(z.object({
      reference: z.string().trim().min(4).max(30),
      token: z.string().min(20).max(200),
      requestType: z.enum(['correction', 'deletion']),
      message: z.string().max(2000).optional().default(''),
    }), req.body);
    const db = req.db;
    const [row] = await db.select().from(applications).where(eq(applications.reference, body.reference.toUpperCase())).limit(1);
    if (!row || !safeEqual(sha256(body.token), row.accessTokenHash)) throw notFound();
    await db.insert(applicationEvents).values({
      applicationId: row.id, eventType: 'note', visibility: 'internal',
      messageEn: `[DATA-${body.requestType.toUpperCase()} REQUEST] ${body.message}`.slice(0, 3000),
    });
    void auditFromReq(req, db)('application.data_request', { type: 'application', id: row.id }, { requestType: body.requestType });
    return { ok: true, message: t('app.received.title', 'en') };
  });
}
