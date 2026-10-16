import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assignments, attendance, workerPayments, personnel, projects } from '../db/schema.js';
import { parseWith, badRequest, notFound, forbidden, conflict, isUniqueViolation } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { hasPerm } from '../lib/rbac.js';
import { sumSameCurrency, type Currency } from '../lib/money.js';
import type { AuthUser } from '../plugins/auth.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function assertStaffOrSelf(user: AuthUser, personnelId?: string | null): void {
  if (hasPerm(user.role, 'schedule.read') || hasPerm(user.role, 'payments.workers') || hasPerm(user.role, 'personnel.sensitive')) return;
  if (personnelId && user.personnelId === personnelId) return;
  throw forbidden('PERMISSION_DENIED', 'Access denied');
}

export function registerSchedulingRoutes(app: FastifyInstance): void {
  // ---------------- assignments ----------------

  app.get('/api/scheduling/assignments', async (req) => {
    const user = req.requireAuth();
    const q = req.query as Record<string, string | undefined>;
    if (!q.personnelId && !hasPerm(user.role, 'schedule.read')) throw forbidden();
    if (q.personnelId) assertStaffOrSelf(user, q.personnelId);
    const db = req.db;
    const conditions = [];
    if (q.personnelId) conditions.push(eq(assignments.personnelId, q.personnelId));
    if (q.projectId) conditions.push(eq(assignments.projectId, q.projectId));
    if (q.from) conditions.push(gte(assignments.workDate, q.from));
    if (q.to) conditions.push(lte(assignments.workDate, q.to));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: assignments.id, personnelId: assignments.personnelId, projectId: assignments.projectId,
      workDate: assignments.workDate, shift: assignments.shift, notes: assignments.notes,
      personName: personnel.fullName, projectNo: projects.projectNo, projectName: projects.name,
    }).from(assignments)
      .leftJoin(personnel, eq(assignments.personnelId, personnel.id))
      .leftJoin(projects, eq(assignments.projectId, projects.id))
      .where(where).orderBy(desc(assignments.workDate)).limit(500);
    return { items: rows };
  });

  /**
   * Create an assignment. UNIQUE(personnel, work_date) plus this pre-check
   * produce a clear 409 for scheduling conflicts.
   */
  app.post('/api/scheduling/assignments', async (req) => {
    const actor = req.requirePerm('schedule.write');
    const body = parseWith(z.object({
      personnelId: z.string().uuid(),
      projectId: z.string().uuid(),
      workDate: dateStr,
      shift: z.enum(['morning', 'afternoon', 'full_day', 'night']).default('full_day'),
      notes: z.string().max(300).optional().nullable(),
    }), req.body);
    const db = req.db;
    const [p] = await db.select({ id: personnel.id, archivedAt: personnel.archivedAt, deletedAt: personnel.deletedAt })
      .from(personnel).where(eq(personnel.id, body.personnelId)).limit(1);
    if (!p || p.deletedAt) throw notFound('PERSONNEL_NOT_FOUND', 'Personnel not found');
    if (p.archivedAt) throw badRequest('ARCHIVED_PERSONNEL', 'Cannot schedule an archived person');
    const [proj] = await db.select({ id: projects.id, archivedAt: projects.archivedAt }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
    if (!proj || proj.archivedAt) throw badRequest('PROJECT_UNAVAILABLE', 'Project not found or archived');
    try {
      const [row] = await db.insert(assignments).values({ ...body, createdBy: actor.id }).returning();
      void auditFromReq(req, db)('schedule.assignment_created',
        { type: 'assignment', id: row!.id }, { personnelId: body.personnelId, projectId: body.projectId, date: body.workDate });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('SCHEDULING_CONFLICT', 'This person already has an assignment on that date');
      }
      throw e;
    }
  });

  app.delete('/api/scheduling/assignments/:id', async (req) => {
    req.requirePerm('schedule.write');
    const { id } = req.params as { id: string };
    const [row] = await req.db.delete(assignments).where(eq(assignments.id, id)).returning({ id: assignments.id });
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('schedule.assignment_deleted', { type: 'assignment', id }, {});
    return { ok: true };
  });

  // ---------------- attendance / timesheets ----------------

  app.get('/api/scheduling/attendance', async (req) => {
    const user = req.requireAuth();
    const q = req.query as Record<string, string | undefined>;
    if (!q.personnelId && !hasPerm(user.role, 'schedule.read')) throw forbidden();
    if (q.personnelId) assertStaffOrSelf(user, q.personnelId);
    const db = req.db;
    const conditions = [];
    if (q.personnelId) conditions.push(eq(attendance.personnelId, q.personnelId));
    if (q.projectId) conditions.push(eq(attendance.projectId, q.projectId));
    if (q.from) conditions.push(gte(attendance.workDate, q.from));
    if (q.to) conditions.push(lte(attendance.workDate, q.to));
    if (q.approvalStatus) conditions.push(eq(attendance.approvalStatus, q.approvalStatus as 'draft'));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: attendance.id, personnelId: attendance.personnelId, projectId: attendance.projectId,
      workDate: attendance.workDate, status: attendance.status,
      regularHours: attendance.regularHours, overtimeHours: attendance.overtimeHours,
      notes: attendance.notes, approvalStatus: attendance.approvalStatus,
      submittedAt: attendance.submittedAt, approvedAt: attendance.approvedAt,
      personName: personnel.fullName, projectNo: projects.projectNo,
    }).from(attendance)
      .leftJoin(personnel, eq(attendance.personnelId, personnel.id))
      .leftJoin(projects, eq(attendance.projectId, projects.id))
      .where(where).orderBy(desc(attendance.workDate)).limit(500);
    return { items: rows };
  });

  const attendanceSchema = z.object({
    personnelId: z.string().uuid(),
    projectId: z.string().uuid().optional().nullable(),
    workDate: dateStr,
    status: z.enum(['present', 'absent', 'late', 'leave', 'half_day']).default('present'),
    regularHours: z.coerce.number().min(0).max(24).default(0),
    overtimeHours: z.coerce.number().min(0).max(12).default(0),
    notes: z.string().max(300).optional().nullable(),
    submit: z.boolean().default(false),
  });

  app.post('/api/scheduling/attendance', async (req) => {
    const actor = req.requirePerm('schedule.write');
    const body = parseWith(attendanceSchema, req.body);
    const db = req.db;
    try {
      const [row] = await db.insert(attendance).values({
        personnelId: body.personnelId,
        projectId: body.projectId ?? null,
        workDate: body.workDate,
        status: body.status,
        regularHours: String(body.regularHours),
        overtimeHours: String(body.overtimeHours),
        notes: body.notes ?? null,
        approvalStatus: body.submit ? 'submitted' : 'draft',
        submittedBy: body.submit ? actor.id : null,
        submittedAt: body.submit ? new Date() : null,
      }).returning();
      void auditFromReq(req, db)('attendance.recorded', { type: 'attendance', id: row!.id }, { personnelId: body.personnelId, date: body.workDate, submitted: body.submit });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('DUPLICATE_RECORD', 'Attendance already recorded for this person on this date');
      throw e;
    }
  });

  app.patch('/api/scheduling/attendance/:id', async (req) => {
    const actor = req.requirePerm('schedule.write');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [before] = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);
    if (!before) throw notFound();
    if (before.approvalStatus === 'approved' && !hasPerm(actor.role, 'attendance.approve')) {
      throw forbidden('PERMISSION_DENIED', 'Approved records can only be changed by an approver');
    }
    const body = parseWith(z.object({
      status: z.enum(['present', 'absent', 'late', 'leave', 'half_day']).optional(),
      regularHours: z.coerce.number().min(0).max(24).optional(),
      overtimeHours: z.coerce.number().min(0).max(12).optional(),
      notes: z.string().max(300).optional().nullable(),
      projectId: z.string().uuid().nullable().optional(),
    }), req.body);
    const [row] = await db.update(attendance).set({
      ...body,
      regularHours: body.regularHours !== undefined ? String(body.regularHours) : undefined,
      overtimeHours: body.overtimeHours !== undefined ? String(body.overtimeHours) : undefined,
      // editing an approved record invalidates the approval → back to submitted
      approvalStatus: before.approvalStatus === 'approved' ? 'submitted' : before.approvalStatus,
      approvedBy: before.approvalStatus === 'approved' ? null : before.approvedBy,
      approvedAt: before.approvalStatus === 'approved' ? null : before.approvedAt,
      updatedAt: new Date(),
    }).where(eq(attendance.id, id)).returning();
    void auditFromReq(req, db)('attendance.edited', { type: 'attendance', id }, { fields: Object.keys(body) });
    return row;
  });

  app.post('/api/scheduling/attendance/:id/submit', async (req) => {
    const actor = req.requirePerm('schedule.write');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(attendance).set({
      approvalStatus: 'submitted', submittedBy: actor.id, submittedAt: new Date(),
    }).where(and(eq(attendance.id, id), eq(attendance.approvalStatus, 'draft'))).returning();
    if (!row) throw badRequest('INVALID_STATE', 'Record not found or already submitted');
    return row;
  });

  app.post('/api/scheduling/attendance/:id/approve', async (req) => {
    const actor = req.requirePerm('attendance.approve');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(attendance).set({
      approvalStatus: 'approved', approvedBy: actor.id, approvedAt: new Date(),
    }).where(and(eq(attendance.id, id), eq(attendance.approvalStatus, 'submitted'))).returning();
    if (!row) throw badRequest('INVALID_STATE', 'Record not found or not in submitted state');
    void auditFromReq(req, req.db)('attendance.approved', { type: 'attendance', id }, {});
    return row;
  });

  app.post('/api/scheduling/attendance/:id/reject', async (req) => {
    const actor = req.requirePerm('attendance.approve');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(attendance).set({
      approvalStatus: 'rejected', approvedBy: actor.id, approvedAt: new Date(),
    }).where(and(eq(attendance.id, id), eq(attendance.approvalStatus, 'submitted'))).returning();
    if (!row) throw badRequest('INVALID_STATE', 'Record not found or not in submitted state');
    void auditFromReq(req, req.db)('attendance.rejected', { type: 'attendance', id }, {});
    return row;
  });

  // ---------------- worker payments (advances / settlements) ----------------

  app.get('/api/scheduling/payments', async (req) => {
    const user = req.requireAuth();
    const q = req.query as Record<string, string | undefined>;
    const canManage = hasPerm(user.role, 'payments.workers');
    if (!canManage && !q.personnelId) throw forbidden();
    if (q.personnelId) assertStaffOrSelf(user, q.personnelId);
    if (!canManage && q.personnelId !== user.personnelId) throw forbidden();
    const db = req.db;
    const conditions = [];
    if (q.personnelId) conditions.push(eq(workerPayments.personnelId, q.personnelId));
    if (q.projectId) conditions.push(eq(workerPayments.projectId, q.projectId));
    if (q.status) conditions.push(eq(workerPayments.status, q.status as 'draft'));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: workerPayments.id, personnelId: workerPayments.personnelId, projectId: workerPayments.projectId,
      type: workerPayments.type, amount: workerPayments.amount, currency: workerPayments.currency,
      paidOn: workerPayments.paidOn, method: workerPayments.method, status: workerPayments.status,
      notes: workerPayments.notes, personName: personnel.fullName,
    }).from(workerPayments)
      .leftJoin(personnel, eq(workerPayments.personnelId, personnel.id))
      .where(where).orderBy(desc(workerPayments.paidOn)).limit(500);
    return { items: rows };
  });

  app.post('/api/scheduling/payments', async (req) => {
    const actor = req.requirePerm('payments.workers');
    const body = parseWith(z.object({
      personnelId: z.string().uuid(),
      projectId: z.string().uuid().optional().nullable(),
      type: z.enum(['advance', 'payment', 'settlement']).default('payment'),
      amount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/),
      currency: z.enum(['LBP', 'USD']),
      paidOn: dateStr,
      method: z.enum(['cash', 'transfer', 'check']).default('cash'),
      reference: z.string().max(80).optional().nullable(),
      notes: z.string().max(300).optional().nullable(),
      submitForApproval: z.boolean().default(true),
    }), req.body);
    if (Number(body.amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Amount must be positive');
    const db = req.db;
    const [row] = await db.insert(workerPayments).values({
      ...body,
      status: body.submitForApproval ? 'submitted' : 'draft',
      createdBy: actor.id,
    }).returning();
    void auditFromReq(req, db)('worker_payment.created', { type: 'worker_payment', id: row!.id }, { personnelId: body.personnelId, amount: body.amount, currency: body.currency });
    return row;
  });

  app.post('/api/scheduling/payments/:id/approve', async (req) => {
    const actor = req.requirePerm('payments.workers');
    req.requireRecentAuth(30); // sensitive financial action
    const { id } = req.params as { id: string };
    const db = req.db;
    // Concurrency-safe: only one approver can move submitted → approved.
    const [row] = await db.update(workerPayments).set({
      status: 'approved', approvedBy: actor.id,
    }).where(and(eq(workerPayments.id, id), eq(workerPayments.status, 'submitted'))).returning();
    if (!row) throw badRequest('INVALID_STATE', 'Payment not found or not awaiting approval');
    void auditFromReq(req, db)('worker_payment.approved', { type: 'worker_payment', id }, { amount: row.amount, currency: row.currency });
    return row;
  });

  /**
   * Balance summary for a person: approved hours (attendance) valued at their
   * configured rate, MINUS approved payments/advances. Computed strictly per
   * currency; if rate currency is unset, earned amounts are reported as null
   * (we never guess compensation).
   */
  app.get('/api/scheduling/payments/balance/:personnelId', async (req) => {
    const user = req.requireAuth();
    const { personnelId } = req.params as { personnelId: string };
    assertStaffOrSelf(user, personnelId);
    const db = req.db;
    const [p] = await db.select({
      rateAmount: personnel.rateAmount, rateCurrency: personnel.rateCurrency, payModel: personnel.payModel,
    }).from(personnel).where(eq(personnel.id, personnelId)).limit(1);
    if (!p) throw notFound();
    const canSeeRate = hasPerm(user.role, 'personnel.sensitive') || user.personnelId === personnelId;
    const approved = await db.select({ amount: workerPayments.amount, currency: workerPayments.currency, type: workerPayments.type })
      .from(workerPayments)
      .where(and(eq(workerPayments.personnelId, personnelId), eq(workerPayments.status, 'approved')));
    const hours = await db.execute(sql`
      SELECT COALESCE(SUM(regular_hours),0)::text AS regular, COALESCE(SUM(overtime_hours),0)::text AS overtime
      FROM attendance WHERE personnel_id = ${personnelId} AND approval_status = 'approved'`);
    const paidByCurrency: Record<string, string> = {};
    const advancesByCurrency: Record<string, string> = {};
    for (const r of approved) {
      if (r.type === 'advance') advancesByCurrency[r.currency] = sumSameCurrency(r.currency as Currency, [advancesByCurrency[r.currency], r.amount]);
      else paidByCurrency[r.currency] = sumSameCurrency(r.currency as Currency, [paidByCurrency[r.currency], r.amount]);
    }
    return {
      payModel: p.payModel,
      rate: canSeeRate ? { amount: p.rateAmount, currency: p.rateCurrency } : null,
      approvedHours: hours[0] ?? { regular: '0', overtime: '0' },
      paidByCurrency, advancesByCurrency,
      note: 'Earnings are NOT computed automatically unless a rate and matching currency are configured. This is not an official payroll calculation; statutory obligations must be verified with the company accountant/legal adviser.',
    };
  });

  // ---------------- self-service (worker/engineer accounts) ----------------

  app.get('/api/me/work', async (req) => {
    const user = req.requireAuth();
    if (!user.personnelId) throw badRequest('NO_PERSONNEL_LINK', 'This account is not linked to a personnel record');
    const db = req.db;
    const [upcoming, pastAttendance, payments] = await Promise.all([
      db.select({
        id: assignments.id, workDate: assignments.workDate, shift: assignments.shift,
        projectNo: projects.projectNo, projectName: projects.name,
      }).from(assignments).leftJoin(projects, eq(assignments.projectId, projects.id))
        .where(and(eq(assignments.personnelId, user.personnelId), gte(assignments.workDate, new Date().toISOString().slice(0, 10))))
        .orderBy(sql`${assignments.workDate} ASC`).limit(30),
      db.select({
        workDate: attendance.workDate, status: attendance.status,
        regularHours: attendance.regularHours, overtimeHours: attendance.overtimeHours,
        approvalStatus: attendance.approvalStatus,
      }).from(attendance).where(eq(attendance.personnelId, user.personnelId))
        .orderBy(desc(attendance.workDate)).limit(60),
      db.select({ type: workerPayments.type, amount: workerPayments.amount, currency: workerPayments.currency, paidOn: workerPayments.paidOn, status: workerPayments.status })
        .from(workerPayments).where(eq(workerPayments.personnelId, user.personnelId))
        .orderBy(desc(workerPayments.paidOn)).limit(60),
    ]);
    const [me] = await db.select({
      recordNo: personnel.recordNo, fullName: personnel.fullName, personType: personnel.personType,
      employmentStatus: personnel.employmentStatus, availability: personnel.availability,
    }).from(personnel).where(and(eq(personnel.id, user.personnelId), isNull(personnel.deletedAt))).limit(1);
    return { profile: me ?? null, upcoming, attendance: pastAttendance, payments };
  });
}
