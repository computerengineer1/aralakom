import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  projects, milestones, tasks, projectTeam, issues, projectNotes, completionChecklist,
  expenses, personnel, users, customers, files,
} from '../db/schema.js';
import { parseWith, notFound, forbidden, badRequest, isUniqueViolation } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { nextReference } from '../lib/ref.js';
import { parsePagination } from './common.js';
import type { AuthUser } from '../plugins/auth.js';
import type { Db } from '../db/index.js';
import { hasPerm } from '../lib/rbac.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Project access rules (server-enforced):
 *  - owner/admin/hr/accountant/pm: all projects (pm has projects.read_all).
 *  - engineer/worker users: only projects where they are on the team
 *    (via projectTeam.user or projectTeam.personnel linked through users.personnelId).
 */
export async function canAccessProject(db: Db, user: AuthUser, projectId: string): Promise<boolean> {
  if (hasPerm(user.role, 'projects.read_all')) return true;
  const conds = [and(eq(projectTeam.projectId, projectId), eq(projectTeam.userId, user.id), isNull(projectTeam.removedAt))];
  if (user.personnelId) {
    conds.push(and(eq(projectTeam.projectId, projectId), eq(projectTeam.personnelId, user.personnelId), isNull(projectTeam.removedAt)));
  }
  const row = await db.select({ id: projectTeam.id }).from(projectTeam).where(or(...conds)).limit(1);
  return Boolean(row[0]);
}

async function projectProgress(db: Db, projectId: string): Promise<{ milestonePct: number; taskPct: number; done: number; total: number; doneTasks: number; totalTasks: number }> {
  const ms = await db.select({ weight: milestones.weight, status: milestones.status }).from(milestones).where(eq(milestones.projectId, projectId));
  const totalWeight = ms.reduce((a, m) => a + (m.weight || 1), 0);
  const doneWeight = ms.filter((m) => m.status === 'done').reduce((a, m) => a + (m.weight || 1), 0);
  const t = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.projectId, projectId));
  return {
    milestonePct: totalWeight ? Math.round((doneWeight / totalWeight) * 100) : 0,
    taskPct: t.length ? Math.round((t.filter((x) => x.status === 'done').length / t.length) * 100) : 0,
    done: doneWeight, total: totalWeight,
    doneTasks: t.filter((x) => x.status === 'done').length, totalTasks: t.length,
  };
}

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/api/projects', async (req) => {
    const user = req.requireAuth();
    const db = req.db;
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.status) conditions.push(eq(projects.status, q.status as 'planning'));
    if (q.managerId) conditions.push(eq(projects.managerId, q.managerId));
    if (q.q) conditions.push(sql`(name ILIKE ${'%' + q.q.slice(0, 80) + '%'} OR project_no ILIKE ${'%' + q.q.slice(0, 30) + '%'})`);
    conditions.push(q.archived === 'true' ? sql`${projects.archivedAt} IS NOT NULL` : isNull(projects.archivedAt));

    if (!hasPerm(user.role, 'projects.read_all')) {
      // restrict to team membership
      const teamConds = [sql`EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = ${projects.id} AND pt.user_id = ${user.id} AND pt.removed_at IS NULL)`];
      if (user.personnelId) {
        teamConds.push(sql`EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = ${projects.id} AND pt.personnel_id = ${user.personnelId} AND pt.removed_at IS NULL)`);
      }
      conditions.push(or(...teamConds)!);
    }
    const where = and(...conditions);
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(projects).where(where);
    const rows = await db.select().from(projects).where(where)
      .orderBy(desc(projects.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });

  app.post('/api/projects', async (req) => {
    const actor = req.requirePerm('projects.create');
    const body = parseWith(z.object({
      name: z.string().trim().min(2).max(200),
      customerId: z.string().uuid().optional().nullable(),
      requestId: z.string().uuid().optional().nullable(),
      description: z.string().max(5000).optional().nullable(),
      scope: z.string().max(10000).optional().nullable(),
      governorate: z.string().max(80).optional().nullable(),
      district: z.string().max(80).optional().nullable(),
      town: z.string().max(120).optional().nullable(),
      address: z.string().max(300).optional().nullable(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      managerId: z.string().uuid().optional().nullable(),
      startDate: dateStr.optional().nullable(),
      targetEndDate: dateStr.optional().nullable(),
      contractAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).optional().nullable(),
      contractCurrency: z.enum(['LBP', 'USD']).optional().nullable(),
      budgetAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).optional().nullable(),
      budgetCurrency: z.enum(['LBP', 'USD']).optional().nullable(),
    }), req.body);
    if (body.contractAmount && !body.contractCurrency) throw badRequest('CURRENCY_REQUIRED', 'Currency is required when a contract amount is set');
    if (body.budgetAmount && !body.budgetCurrency) throw badRequest('CURRENCY_REQUIRED', 'Currency is required when a budget is set');
    const db = req.db;
    const projectNo = await nextReference(db, { prefix: 'PRJ', width: 4 });
    const [row] = await db.insert(projects).values({ ...body, projectNo, createdBy: actor.id }).returning();
    if (body.managerId) {
      await db.insert(projectTeam).values({ projectId: row!.id, userId: body.managerId, roleInProject: 'manager', assignedBy: actor.id })
        .onConflictDoNothing();
    }
    void auditFromReq(req, db)('project.created', { type: 'project', id: row!.id }, { projectNo });
    return row;
  });

  app.get('/api/projects/alerts', async (req) => {
    const user = req.requireAuth();
    const db = req.db;
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const scopeFilter = hasPerm(user.role, 'projects.read_all')
      ? undefined
      : sql`AND EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND (pt.user_id = ${user.id}${user.personnelId ? sql` OR pt.personnel_id = ${user.personnelId}` : sql``}) AND pt.removed_at IS NULL)`;
    const overdueMilestones = await db.execute(sql`
      SELECT m.id, m.title, m.due_date, p.id AS project_id, p.project_no, p.name AS project_name
      FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.status <> 'done' AND m.due_date < ${today} AND p.archived_at IS NULL ${scopeFilter ?? sql``}
      ORDER BY m.due_date LIMIT 50`);
    const upcomingMilestones = await db.execute(sql`
      SELECT m.id, m.title, m.due_date, p.id AS project_id, p.project_no, p.name AS project_name
      FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE m.status <> 'done' AND m.due_date >= ${today} AND m.due_date <= ${soon} AND p.archived_at IS NULL ${scopeFilter ?? sql``}
      ORDER BY m.due_date LIMIT 50`);
    const overdueTasks = await db.execute(sql`
      SELECT t.id, t.title, t.due_date, t.status, p.id AS project_id, p.project_no
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status <> 'done' AND t.due_date < ${today} AND p.archived_at IS NULL ${scopeFilter ?? sql``}
      ORDER BY t.due_date LIMIT 50`);
    return { overdueMilestones, upcomingMilestones, overdueTasks };
  });

  app.get('/api/projects/:id', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    const db = req.db;
    if (!(await canAccessProject(db, user, id))) throw forbidden('PROJECT_ACCESS_DENIED', 'You do not have access to this project');
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) throw notFound();
    const [ms, ts, team, openIssues, progress] = await Promise.all([
      db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.sortOrder), asc(milestones.dueDate)),
      db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(asc(tasks.sortOrder), desc(tasks.createdAt)),
      db.select({
        id: projectTeam.id, personnelId: projectTeam.personnelId, userId: projectTeam.userId,
        roleInProject: projectTeam.roleInProject,
        personName: personnel.fullName, personPhone: personnel.phone,
        userName: users.fullName,
      }).from(projectTeam)
        .leftJoin(personnel, eq(projectTeam.personnelId, personnel.id))
        .leftJoin(users, eq(projectTeam.userId, users.id))
        .where(and(eq(projectTeam.projectId, id), isNull(projectTeam.removedAt))),
      db.select().from(issues).where(and(eq(issues.projectId, id), eq(issues.status, 'open'))),
      projectProgress(db, id),
    ]);
    let customer = null;
    if (row.customerId) {
      const [c] = await db.select({ id: customers.id, name: customers.name, company: customers.company, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.id, row.customerId)).limit(1);
      customer = c ?? null;
    }
    // PMs may see team phone numbers; others only names (least privilege on personal data).
    const canSeePhones = ['owner', 'admin', 'hr', 'pm'].includes(user.role);
    return {
      project: row, milestones: ms, tasks: ts, issues: openIssues, progress, customer,
      team: team.map((m) => ({ ...m, personPhone: canSeePhones ? m.personPhone : null })),
    };
  });

  app.patch('/api/projects/:id', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const db = req.db;
    if (!hasPerm(actor.role, 'projects.read_all') && !(await canAccessProject(db, actor, id))) {
      throw forbidden('PROJECT_ACCESS_DENIED', 'You do not have access to this project');
    }
    const body = parseWith(z.object({
      name: z.string().trim().min(2).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      scope: z.string().max(10000).optional().nullable(),
      status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      managerId: z.string().uuid().nullable().optional(),
      startDate: dateStr.nullable().optional(),
      targetEndDate: dateStr.nullable().optional(),
      actualEndDate: dateStr.nullable().optional(),
      contractAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).nullable().optional(),
      contractCurrency: z.enum(['LBP', 'USD']).nullable().optional(),
      budgetAmount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/).nullable().optional(),
      budgetCurrency: z.enum(['LBP', 'USD']).nullable().optional(),
      warrantyNotes: z.string().max(2000).nullable().optional(),
      governorate: z.string().max(80).nullable().optional(),
      district: z.string().max(80).nullable().optional(),
      town: z.string().max(120).nullable().optional(),
      address: z.string().max(300).nullable().optional(),
    }), req.body);
    const [before] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!before) throw notFound();
    const [row] = await db.update(projects).set({ ...body, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    if (body.status && body.status !== before.status) {
      void auditFromReq(req, db)('project.status_changed', { type: 'project', id }, { from: before.status, to: body.status });
    } else {
      void auditFromReq(req, db)('project.updated', { type: 'project', id }, { fields: Object.keys(body) });
    }
    return row;
  });

  app.post('/api/projects/:id/archive', async (req) => {
    req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, id)).returning({ id: projects.id });
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('project.archived', { type: 'project', id }, {});
    return { ok: true };
  });

  // ---------------- team ----------------

  app.post('/api/projects/:id/team', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      personnelId: z.string().uuid().optional().nullable(),
      userId: z.string().uuid().optional().nullable(),
      roleInProject: z.string().max(80).optional().nullable(),
    }), req.body);
    if (!body.personnelId && !body.userId) throw badRequest('TARGET_REQUIRED', 'personnelId or userId is required');
    const db = req.db;
    if (body.personnelId) {
      const [p] = await db.select({ id: personnel.id, archivedAt: personnel.archivedAt }).from(personnel)
        .where(and(eq(personnel.id, body.personnelId), isNull(personnel.deletedAt))).limit(1);
      if (!p) throw notFound('PERSONNEL_NOT_FOUND', 'Personnel record not found');
      if (p.archivedAt) throw badRequest('ARCHIVED_PERSONNEL', 'Cannot assign an archived personnel record');
    }
    try {
      const [row] = await db.insert(projectTeam).values({
        projectId: id, personnelId: body.personnelId ?? null, userId: body.userId ?? null,
        roleInProject: body.roleInProject ?? null, assignedBy: actor.id,
      }).onConflictDoNothing().returning();
      void auditFromReq(req, db)('project.team_added', { type: 'project', id }, { personnelId: body.personnelId, userId: body.userId });
      return row ?? { ok: true, duplicate: true };
    } catch (e) {
      if (isUniqueViolation(e)) throw badRequest('ALREADY_ASSIGNED', 'Person is already on this project team');
      throw e;
    }
  });

  app.delete('/api/projects/:id/team/:memberId', async (req) => {
    req.requirePerm('projects.write');
    const { id, memberId } = req.params as { id: string; memberId: string };
    await req.db.update(projectTeam).set({ removedAt: new Date() })
      .where(and(eq(projectTeam.id, memberId), eq(projectTeam.projectId, id)));
    void auditFromReq(req, req.db)('project.team_removed', { type: 'project', id }, { memberId });
    return { ok: true };
  });

  // ---------------- milestones ----------------

  app.post('/api/projects/:id/milestones', async (req) => {
    req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().max(2000).optional().nullable(),
      dueDate: dateStr.optional().nullable(),
      weight: z.number().int().min(1).max(100).default(1),
      sortOrder: z.number().int().min(0).max(10000).default(0),
    }), req.body);
    const [row] = await req.db.insert(milestones).values({ ...body, projectId: id }).returning();
    void auditFromReq(req, req.db)('project.milestone_created', { type: 'milestone', id: row!.id }, { projectId: id });
    return row;
  });

  app.patch('/api/projects/:id/milestones/:mid', async (req) => {
    req.requirePerm('projects.write');
    const { id, mid } = req.params as { id: string; mid: string };
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().max(2000).optional().nullable(),
      dueDate: dateStr.optional().nullable(),
      weight: z.number().int().min(1).max(100).optional(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
      status: z.enum(['pending', 'in_progress', 'done']).optional(),
    }), req.body);
    const [before] = await req.db.select().from(milestones).where(and(eq(milestones.id, mid), eq(milestones.projectId, id))).limit(1);
    if (!before) throw notFound();
    const nowDone = body.status === 'done' && before.status !== 'done';
    const [row] = await req.db.update(milestones).set({
      ...body,
      completedAt: nowDone ? new Date() : (body.status && body.status !== 'done' ? null : before.completedAt),
    }).where(eq(milestones.id, mid)).returning();
    if (body.status && body.status !== before.status) {
      void auditFromReq(req, req.db)('project.milestone_status', { type: 'milestone', id: mid }, { from: before.status, to: body.status });
    }
    return row;
  });

  app.delete('/api/projects/:id/milestones/:mid', async (req) => {
    req.requirePerm('projects.write');
    const { mid } = req.params as { id: string; mid: string };
    await req.db.delete(milestones).where(eq(milestones.id, mid));
    void auditFromReq(req, req.db)('project.milestone_deleted', { type: 'milestone', id: mid }, {});
    return { ok: true };
  });

  // ---------------- tasks ----------------

  app.post('/api/projects/:id/tasks', async (req) => {
    req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().max(3000).optional().nullable(),
      milestoneId: z.string().uuid().optional().nullable(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      assigneePersonnelId: z.string().uuid().optional().nullable(),
      assigneeUserId: z.string().uuid().optional().nullable(),
      dueDate: dateStr.optional().nullable(),
      sortOrder: z.number().int().min(0).max(10000).default(0),
    }), req.body);
    const [row] = await req.db.insert(tasks).values({ ...body, projectId: id }).returning();
    return row;
  });

  app.patch('/api/projects/:id/tasks/:tid', async (req) => {
    const user = req.requireAuth();
    const { id, tid } = req.params as { id: string; tid: string };
    const db = req.db;
    const [before] = await db.select().from(tasks).where(and(eq(tasks.id, tid), eq(tasks.projectId, id))).limit(1);
    if (!before) throw notFound();
    // Staff with write permission, or the assigned engineer/worker updating status only.
    const isAssignee = (user.personnelId && before.assigneePersonnelId === user.personnelId) || before.assigneeUserId === user.id;
    const canWrite = hasPerm(user.role, 'projects.write');
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().max(3000).optional().nullable(),
      milestoneId: z.string().uuid().optional().nullable(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      assigneePersonnelId: z.string().uuid().optional().nullable(),
      assigneeUserId: z.string().uuid().optional().nullable(),
      dueDate: dateStr.optional().nullable(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
    }), req.body);
    const editsBeyondStatus = Object.keys(body).some((k) => k !== 'status');
    if (!canWrite && !(isAssignee && body.status && !editsBeyondStatus)) {
      throw forbidden('PERMISSION_DENIED', 'Not allowed to modify this task');
    }
    const [row] = await db.update(tasks).set({
      ...body,
      completedAt: body.status === 'done' ? new Date() : (body.status ? null : before.completedAt),
      updatedAt: new Date(),
    }).where(eq(tasks.id, tid)).returning();
    return row;
  });

  // ---------------- issues / notes / checklist ----------------

  app.post('/api/projects/:id/issues', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().max(3000).optional().nullable(),
      kind: z.enum(['issue', 'risk']).default('issue'),
      severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    }), req.body);
    const [row] = await req.db.insert(issues).values({ ...body, projectId: id, ownerId: actor.id }).returning();
    return row;
  });

  app.patch('/api/projects/:id/issues/:iid', async (req) => {
    req.requirePerm('projects.write');
    const { iid } = req.params as { id: string; iid: string };
    const body = parseWith(z.object({
      status: z.enum(['open', 'mitigating', 'closed']).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      title: z.string().max(200).optional(),
      description: z.string().max(3000).optional().nullable(),
    }), req.body);
    const [row] = await req.db.update(issues).set({ ...body, updatedAt: new Date() }).where(eq(issues.id, iid)).returning();
    if (!row) throw notFound();
    return row;
  });

  app.post('/api/projects/:id/notes', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);
    const [row] = await req.db.insert(projectNotes).values({ projectId: id, authorId: actor.id, body: body.body }).returning();
    return row;
  });

  app.get('/api/projects/:id/notes', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    if (!(await canAccessProject(req.db, user, id))) throw forbidden();
    const rows = await req.db.select().from(projectNotes).where(eq(projectNotes.projectId, id)).orderBy(desc(projectNotes.createdAt)).limit(200);
    return { items: rows };
  });

  app.get('/api/projects/:id/checklist', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    if (!(await canAccessProject(req.db, user, id))) throw forbidden();
    const rows = await req.db.select().from(completionChecklist).where(eq(completionChecklist.projectId, id)).orderBy(asc(completionChecklist.sortOrder));
    return { items: rows };
  });

  app.post('/api/projects/:id/checklist', async (req) => {
    req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const body = parseWith(z.object({
      item: z.string().trim().min(2).max(300),
      sortOrder: z.number().int().default(0),
    }), req.body);
    const [row] = await req.db.insert(completionChecklist).values({ ...body, projectId: id }).returning();
    return row;
  });

  app.patch('/api/projects/:id/checklist/:cid', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { cid } = req.params as { id: string; cid: string };
    const body = parseWith(z.object({ done: z.boolean(), item: z.string().max(300).optional() }), req.body);
    const [row] = await req.db.update(completionChecklist).set({
      done: body.done, item: body.item,
      doneBy: body.done ? actor.id : null, doneAt: body.done ? new Date() : null,
    }).where(eq(completionChecklist.id, cid)).returning();
    if (!row) throw notFound();
    return row;
  });

  // ---------------- expenses ----------------

  const expenseSchema = z.object({
    category: z.enum(['labor', 'materials', 'equipment', 'transportation', 'subcontractor', 'miscellaneous']),
    description: z.string().trim().min(2).max(300),
    amount: z.string().regex(/^\d{0,14}(\.\d{1,4})?$/),
    currency: z.enum(['LBP', 'USD']),
    expenseDate: dateStr,
    supplierId: z.string().uuid().optional().nullable(),
    receiptFileId: z.string().uuid().optional().nullable(),
  });

  app.get('/api/projects/:id/expenses', async (req) => {
    const user = req.requirePerm('expenses.read');
    const { id } = req.params as { id: string };
    const rows = await req.db.select().from(expenses).where(eq(expenses.projectId, id)).orderBy(desc(expenses.expenseDate)).limit(500);
    void user;
    return { items: rows };
  });

  app.post('/api/projects/:id/expenses', async (req) => {
    const actor = req.requirePerm('expenses.write');
    const { id } = req.params as { id: string };
    const body = parseWith(expenseSchema, req.body);
    if (Number(body.amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Amount must be positive');
    const [row] = await req.db.insert(expenses).values({ ...body, projectId: id, recordedBy: actor.id }).returning();
    void auditFromReq(req, req.db)('expense.created', { type: 'expense', id: row!.id }, { projectId: id, amount: body.amount, currency: body.currency });
    return row;
  });

  app.patch('/api/projects/:id/expenses/:eid', async (req) => {
    req.requirePerm('expenses.write');
    const { eid } = req.params as { id: string; eid: string };
    const body = parseWith(expenseSchema.partial(), req.body);
    const [row] = await req.db.update(expenses).set({ ...body, updatedAt: new Date() }).where(eq(expenses.id, eid)).returning();
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('expense.updated', { type: 'expense', id: eid }, { fields: Object.keys(body) });
    return row;
  });

  app.delete('/api/projects/:id/expenses/:eid', async (req) => {
    const actor = req.requirePerm('expenses.write');
    if (!['owner', 'admin', 'accountant'].includes(actor.role)) throw forbidden('PERMISSION_DENIED', 'Only finance roles can delete expenses');
    const { eid } = req.params as { id: string; eid: string };
    await req.db.delete(expenses).where(eq(expenses.id, eid));
    void auditFromReq(req, req.db)('expense.deleted', { type: 'expense', id: eid }, {});
    return { ok: true };
  });

  /** Financial summary per project — amounts grouped by currency, never mixed. */
  app.get('/api/projects/:id/financial-summary', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    const db = req.db;
    const canFinance = hasPerm(user.role, 'expenses.read') || hasPerm(user.role, 'finance.reports');
    if (!canFinance && !(await canAccessProject(db, user, id))) throw forbidden();
    if (!canFinance) throw forbidden('PERMISSION_DENIED', 'Financial summaries require finance permissions');
    const expByCurrency = await db.execute(sql`
      SELECT currency, category, SUM(amount)::text AS total
      FROM expenses WHERE project_id = ${id} GROUP BY currency, category`);
    const invByCurrency = await db.execute(sql`
      SELECT currency, SUM(total)::text AS invoiced, SUM(paid_total)::text AS paid
      FROM invoices WHERE project_id = ${id} AND status <> 'cancelled' GROUP BY currency`);
    const [proj] = await db.select({
      contractAmount: projects.contractAmount, contractCurrency: projects.contractCurrency,
      budgetAmount: projects.budgetAmount, budgetCurrency: projects.budgetCurrency,
    }).from(projects).where(eq(projects.id, id)).limit(1);
    return { project: proj ?? null, expenses: expByCurrency, invoices: invByCurrency };
  });

  /** Documents attached to a project. */
  app.get('/api/projects/:id/files', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    if (!(await canAccessProject(req.db, user, id))) throw forbidden();
    const rows = await req.db.select({ id: files.id, originalName: files.originalName, mimeType: files.mimeType, sizeBytes: files.sizeBytes, createdAt: files.createdAt })
      .from(files).where(and(eq(files.ownerType, 'project'), eq(files.ownerId, id), isNull(files.deletedAt)));
    return { items: rows };
  });

  app.post('/api/projects/:id/files', async (req) => {
    const actor = req.requirePerm('projects.write');
    const { id } = req.params as { id: string };
    const { storeUpload: store, FileValidationError } = await import('../lib/files.js');
    const part = await req.file();
    if (!part) throw badRequest('FILE_REQUIRED', 'No file uploaded');
    try {
      const stored = await store(req.db, part, { type: 'project', id }, actor.id);
      return stored;
    } catch (err) {
      if (err instanceof FileValidationError) throw badRequest('FILE_REJECTED', err.message);
      throw err;
    }
  });

  // small helper used by other modules
  app.decorate('projectProgress', (db: Db, id: string) => projectProgress(db, id));
}

export { projectProgress };
