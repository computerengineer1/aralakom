import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { personnel, personnelHistory, categories, assignments, attendance, tasks, projectTeam, workerPayments, users } from '../db/schema.js';
import { parseWith, badRequest, notFound, forbidden } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { nextReference } from '../lib/ref.js';
import { parsePagination, phoneSchema, optionalEmail } from './common.js';
import type { Db } from '../db/index.js';

const SENSITIVE_FIELDS = ['rateAmount', 'rateCurrency', 'emergencyContactName', 'emergencyContactPhone'];

const personnelSchema = z.object({
  personType: z.enum(['worker', 'technician', 'engineer', 'other']).default('worker'),
  fullName: z.string().trim().min(2).max(200),
  photoFileId: z.string().uuid().nullable().optional(),
  phone: phoneSchema,
  altPhone: phoneSchema.optional().nullable().or(z.literal('').transform(() => null)),
  email: optionalEmail,
  governorate: z.string().max(80).optional().nullable(),
  district: z.string().max(80).optional().nullable(),
  town: z.string().max(120).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  categoryId: z.string().uuid().nullable().optional(),
  secondarySkills: z.string().max(1000).optional().nullable(),
  experienceYears: z.number().int().min(0).max(70).default(0),
  qualifications: z.string().max(2000).optional().nullable(),
  languages: z.string().max(200).optional().nullable(),
  employmentStatus: z.enum(['candidate', 'active', 'on_leave', 'suspended', 'terminated', 'retired']).default('candidate'),
  availability: z.enum(['available', 'busy', 'unavailable']).default('available'),
  payModel: z.enum(['hourly', 'day_rate', 'fixed_work', 'monthly', 'unspecified']).default('unspecified'),
  rateAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).nullable().optional(),
  rateCurrency: z.enum(['LBP', 'USD']).nullable().optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: phoneSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

function stripSensitive<T extends Record<string, unknown>>(row: T, canSeeSensitive: boolean): T {
  if (canSeeSensitive) return row;
  const out = { ...row };
  for (const f of SENSITIVE_FIELDS) delete out[f];
  return out;
}

async function logHistory(db: Db, personnelId: string, actorId: string | null, action: string, field?: string, oldValue?: unknown, newValue?: unknown): Promise<void> {
  await db.insert(personnelHistory).values({
    personnelId, actorId, action,
    field: field ?? null,
    oldValue: oldValue === undefined ? null : String(oldValue),
    newValue: newValue === undefined ? null : String(newValue),
  });
}

export function registerPersonnelRoutes(app: FastifyInstance): void {
  /** Searchable, filterable, server-paginated directory. */
  app.get('/api/personnel', async (req) => {
    const user = req.requirePerm('personnel.read');
    const canSensitive = user.role === 'owner' || user.role === 'admin' || user.role === 'hr' || user.role === 'accountant';
    const db = req.db;
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize, sort, dir } = parsePagination(req);

    const conditions = [isNull(personnel.deletedAt), isNull(personnel.mergedIntoId)];
    if (q.personType) conditions.push(eq(personnel.personType, q.personType as 'worker'));
    if (q.categoryId) conditions.push(eq(personnel.categoryId, q.categoryId));
    if (q.governorate) conditions.push(eq(personnel.governorate, q.governorate));
    if (q.employmentStatus) conditions.push(eq(personnel.employmentStatus, q.employmentStatus as 'active'));
    if (q.availability) conditions.push(eq(personnel.availability, q.availability as 'available'));
    if (q.minExp) conditions.push(gte(personnel.experienceYears, Number(q.minExp) || 0));
    if (q.maxExp) conditions.push(lte(personnel.experienceYears, Number(q.maxExp) || 70));
    if (q.archived === 'true') {
      conditions.pop(); conditions.pop();
      conditions.push(isNull(personnel.deletedAt));
    } else {
      conditions.push(isNull(personnel.archivedAt));
    }
    if (q.q) {
      const term = `%${q.q.slice(0, 80)}%`;
      conditions.push(or(
        ilike(personnel.fullName, term),
        ilike(personnel.phone, term),
        ilike(personnel.secondarySkills, term),
        ilike(personnel.town, term),
        ilike(personnel.district, term),
      )!);
    }
    const where = and(...conditions);

    const sortCol = (() => {
      switch (sort) {
        case 'name': return personnel.fullName;
        case 'experience': return personnel.experienceYears;
        case 'createdAt': return personnel.createdAt;
        default: return personnel.createdAt;
      }
    })();
    const order = dir === 'desc' ? desc(sortCol) : asc(sortCol);

    const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(personnel).where(where);
    const rows = await db.select().from(personnel).where(where).orderBy(order).limit(pageSize).offset((page - 1) * pageSize);
    const items = rows.map((r) => stripSensitive(r as unknown as Record<string, unknown>, canSensitive));
    return { items, page, pageSize, total: countRow?.n ?? 0, totalPages: Math.max(1, Math.ceil((countRow?.n ?? 0) / pageSize)) };
  });

  app.get('/api/personnel/duplicates', async (req) => {
    req.requirePerm('personnel.merge');
    const db = req.db;
    // Same phone OR same normalized name within same category.
    const rows = await db.execute(sql`
      SELECT a.id AS aid, b.id AS bid, a.full_name AS aname, b.full_name AS bname,
             a.phone AS aphone, b.phone AS bphone, a.record_no AS aref, b.record_no AS bref
      FROM personnel a JOIN personnel b ON a.id < b.id
      WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL
        AND (a.phone = b.phone OR (lower(a.full_name) = lower(b.full_name) AND a.category_id IS NOT DISTINCT FROM b.category_id))
      LIMIT 100`);
    return { items: rows as unknown[] };
  });

  /** Merge duplicate records: source records are re-pointed to the target, then archived. */
  app.post('/api/personnel/merge', async (req) => {
    const actor = req.requirePerm('personnel.merge');
    const body = parseWith(z.object({
      targetId: z.string().uuid(),
      sourceIds: z.array(z.string().uuid()).min(1).max(10),
    }), req.body);
    if (body.sourceIds.includes(body.targetId)) throw badRequest('SELF_MERGE', 'Target cannot be among sources');
    const db = req.db;
    await db.transaction(async (tx) => {
      const target = await tx.select({ id: personnel.id }).from(personnel)
        .where(and(eq(personnel.id, body.targetId), isNull(personnel.deletedAt))).limit(1);
      if (!target[0]) throw notFound('TARGET_NOT_FOUND', 'Merge target not found');
      const sources = await tx.select({ id: personnel.id }).from(personnel)
        .where(and(inArray(personnel.id, body.sourceIds), isNull(personnel.deletedAt)));
      if (sources.length !== body.sourceIds.length) throw badRequest('SOURCE_NOT_FOUND', 'One or more source records not found');

      for (const sid of body.sourceIds) {
        await tx.update(assignments).set({ personnelId: body.targetId }).where(eq(assignments.personnelId, sid));
        await tx.update(attendance).set({ personnelId: body.targetId }).where(eq(attendance.personnelId, sid));
        await tx.update(tasks).set({ assigneePersonnelId: body.targetId }).where(eq(tasks.assigneePersonnelId, sid));
        await tx.update(workerPayments).set({ personnelId: body.targetId }).where(eq(workerPayments.personnelId, sid));
        // project_team has a unique(project, personnel) index: only move rows that won't collide.
        const teams = await tx.select().from(projectTeam).where(eq(projectTeam.personnelId, sid));
        for (const tm of teams) {
          const clash = await tx.select({ id: projectTeam.id }).from(projectTeam)
            .where(and(eq(projectTeam.projectId, tm.projectId!), eq(projectTeam.personnelId, body.targetId))).limit(1);
          if (clash[0]) await tx.update(projectTeam).set({ removedAt: new Date() }).where(eq(projectTeam.id, tm.id!));
          else await tx.update(projectTeam).set({ personnelId: body.targetId }).where(eq(projectTeam.id, tm.id!));
        }
        await tx.update(personnel).set({ mergedIntoId: body.targetId, archivedAt: new Date(), updatedBy: actor.id, updatedAt: new Date() }).where(eq(personnel.id, sid));
        await logHistory(tx, body.targetId, actor.id, 'merge', 'mergedFrom', sid, body.targetId);
        await logHistory(tx, sid, actor.id, 'merge', 'mergedInto', sid, body.targetId);
      }
    });
    void auditFromReq(req, db)('personnel.merged', { type: 'personnel', id: body.targetId }, { sourceIds: body.sourceIds });
    return { ok: true };
  });

  app.get('/api/personnel/export.csv', async (req, reply) => {
    const actor = req.requirePerm('personnel.export');
    const canSensitive = actor.role === 'owner' || actor.role === 'admin' || actor.role === 'hr';
    const rows = await req.db.select().from(personnel)
      .where(and(isNull(personnel.deletedAt), isNull(personnel.mergedIntoId))).orderBy(asc(personnel.recordNo)).limit(5000);
    const cols = ['recordNo', 'personType', 'fullName', 'phone', 'email', 'governorate', 'district', 'town',
      'employmentStatus', 'availability', 'experienceYears', 'languages', 'hireDate',
      ...(canSensitive ? ['payModel', 'rateAmount', 'rateCurrency'] : [])];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n');
    void auditFromReq(req, req.db)('personnel.exported', { type: 'personnel', id: 'export' }, { count: rows.length, sensitive: canSensitive });
    return reply.type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="personnel.csv"')
      .send(`\uFEFF${csv}`);
  });

  app.post('/api/personnel', async (req) => {
    const actor = req.requirePerm('personnel.write');
    const body = parseWith(personnelSchema, req.body);
    if ((body.rateAmount || body.rateCurrency) && !['owner', 'admin', 'hr', 'accountant'].includes(actor.role)) {
      throw forbidden('PERMISSION_DENIED', 'Compensation data requires elevated permission');
    }
    const db = req.db;
    const recordNo = await nextReference(db, { prefix: 'EMP', yearScoped: false, width: 6 });
    const [row] = await db.insert(personnel).values({
      ...body, recordNo, createdBy: actor.id, updatedBy: actor.id,
    }).returning();
    await logHistory(db, row!.id, actor.id, 'create', undefined, undefined, recordNo);
    void auditFromReq(req, db)('personnel.created', { type: 'personnel', id: row!.id }, { recordNo });
    return row;
  });

  app.get('/api/personnel/:id', async (req) => {
    const actor = req.requireAuth();
    const { id } = req.params as { id: string };
    const isSelf = actor.personnelId === id;
    if (!isSelf) req.requirePerm('personnel.read');
    const canSensitive = isSelf || ['owner', 'admin', 'hr', 'accountant'].includes(actor.role);
    const db = req.db;
    const [row] = await db.select().from(personnel).where(and(eq(personnel.id, id), isNull(personnel.deletedAt))).limit(1);
    if (!row) throw notFound();
    const [cat] = row.categoryId
      ? await db.select().from(categories).where(eq(categories.id, row.categoryId)).limit(1)
      : [null];
    const team = await db.select({ projectId: projectTeam.projectId, roleInProject: projectTeam.roleInProject })
      .from(projectTeam).where(and(eq(projectTeam.personnelId, id), isNull(projectTeam.removedAt)));
    return { person: stripSensitive(row as unknown as Record<string, unknown>, canSensitive), category: cat, team };
  });

  app.patch('/api/personnel/:id', async (req) => {
    const actor = req.requirePerm('personnel.write');
    const { id } = req.params as { id: string };
    const body = parseWith(personnelSchema.partial(), req.body);
    const touchesSensitive = Object.keys(body).some((k) => SENSITIVE_FIELDS.includes(k));
    if (touchesSensitive && !['owner', 'admin', 'hr', 'accountant'].includes(actor.role)) {
      throw forbidden('PERMISSION_DENIED', 'Compensation/emergency data requires elevated permission');
    }
    const db = req.db;
    const [before] = await db.select().from(personnel).where(and(eq(personnel.id, id), isNull(personnel.deletedAt))).limit(1);
    if (!before) throw notFound();
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && JSON.stringify(v) !== JSON.stringify((before as unknown as Record<string, unknown>)[k])) {
        changes[k] = [(before as unknown as Record<string, unknown>)[k], v];
      }
    }
    const [row] = await db.update(personnel).set({ ...body, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(personnel.id, id)).returning();
    for (const [field, [oldV, newV]] of Object.entries(changes)) {
      // Never persist raw sensitive values in history; record that they changed.
      const isSensitive = SENSITIVE_FIELDS.includes(field) || field === 'notes';
      await logHistory(db, id, actor.id, 'update', field, isSensitive ? '[changed]' : oldV, isSensitive ? '[changed]' : newV);
    }
    if (body.employmentStatus && body.employmentStatus !== before.employmentStatus) {
      await logHistory(db, id, actor.id, 'status_change', 'employmentStatus', before.employmentStatus, body.employmentStatus);
    }
    void auditFromReq(req, db)('personnel.updated', { type: 'personnel', id }, { fields: Object.keys(body) });
    return stripSensitive(row as unknown as Record<string, unknown>, ['owner', 'admin', 'hr', 'accountant'].includes(actor.role));
  });

  app.post('/api/personnel/:id/archive', async (req) => {
    const actor = req.requirePerm('personnel.write');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(personnel).set({ archivedAt: new Date(), updatedBy: actor.id }).where(and(eq(personnel.id, id), isNull(personnel.deletedAt))).returning({ id: personnel.id });
    if (!row) throw notFound();
    await logHistory(req.db, id, actor.id, 'archive');
    void auditFromReq(req, req.db)('personnel.archived', { type: 'personnel', id }, {});
    return { ok: true };
  });

  app.post('/api/personnel/:id/restore', async (req) => {
    const actor = req.requirePerm('personnel.write');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(personnel).set({ archivedAt: null, updatedBy: actor.id }).where(eq(personnel.id, id)).returning({ id: personnel.id });
    if (!row) throw notFound();
    await logHistory(req.db, id, actor.id, 'restore');
    void auditFromReq(req, req.db)('personnel.restored', { type: 'personnel', id }, {});
    return { ok: true };
  });

  app.get('/api/personnel/:id/history', async (req) => {
    const actor = req.requirePerm('personnel.read');
    const { id } = req.params as { id: string };
    const rows = await req.db.select().from(personnelHistory).where(eq(personnelHistory.personnelId, id))
      .orderBy(desc(personnelHistory.id)).limit(300);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await req.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, actorIds))
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.fullName]));
    void actor;
    return { items: rows.map((r) => ({ ...r, actorName: r.actorId ? nameOf.get(r.actorId) ?? null : null })) };
  });
}
