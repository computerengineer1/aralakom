import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, lt, sql, gte } from 'drizzle-orm';
import {
  personnel, applications, requests, projects, milestones, 
  auditEvents, assignments, attendance, quotations, receipts,
} from '../db/schema.js';
import { forbidden } from '../lib/http.js';
import { hasPerm } from '../lib/rbac.js';
import type { AuthUser } from '../plugins/auth.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/api/dashboard', async (req) => {
    const user = req.requireAuth();
    const db = req.db;
    switch (user.role) {
      case 'owner':
      case 'admin':
        return ownerDashboardInner(db);
      case 'hr':
        return hrDashboard(db);
      case 'pm':
        return pmDashboard(db, user);
      case 'accountant':
        return accountantDashboard(db);
      case 'engineer':
      case 'worker':
        return workerDashboard(db, user);
      case 'customer':
        return customerDashboard(db, user);
      default:
        throw forbidden();
    }
  });
}

type DB = import('../db/index.js').Db;

async function ownerDashboardInner(db: DB) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [
    activePersonnel, pendingApps, newRequests, activeProjects, overdueMilestones,
    outstandingInvoices, recentAudit,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(personnel)
      .where(and(isNull(personnel.deletedAt), isNull(personnel.archivedAt), isNull(personnel.mergedIntoId), eq(personnel.employmentStatus, 'active'))),
    db.select({ n: sql<number>`count(*)::int` }).from(applications)
      .where(sql`status IN ('submitted','under_review','shortlisted','interview')`),
    db.select({ n: sql<number>`count(*)::int` }).from(requests)
      .where(sql`status IN ('submitted','under_review')`),
    db.select({ n: sql<number>`count(*)::int` }).from(projects)
      .where(and(isNull(projects.archivedAt), sql`status IN ('planning','in_progress')`)),
    db.select({ n: sql<number>`count(*)::int` }).from(milestones)
      .where(and(eq(milestones.status, sql`'pending'`), lt(milestones.dueDate, today))),
    db.execute(sql`SELECT currency, SUM(total - paid_total)::text AS outstanding, count(*)::int AS n
                    FROM invoices WHERE status IN ('sent','partial') GROUP BY currency`),
    db.select({ action: auditEvents.action, actorEmail: auditEvents.actorEmail, createdAt: auditEvents.createdAt, summary: auditEvents.summary })
      .from(auditEvents).orderBy(desc(auditEvents.id)).limit(15),
  ]);
  const upcoming = await db.execute(sql`
    SELECT m.id, m.title, m.due_date, p.project_no, p.name AS project_name, p.id AS project_id
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE m.status <> 'done' AND m.due_date BETWEEN ${today} AND ${soon} AND p.archived_at IS NULL
    ORDER BY m.due_date LIMIT 20`);
  // budget vs actual for active projects (per currency — never mixed)
  const budgetVsActual = await db.execute(sql`
    SELECT p.id, p.project_no, p.name, p.contract_amount, p.contract_currency,
           p.budget_amount, p.budget_currency,
           (SELECT COALESCE(jsonb_object_agg(currency, total), '{}'::jsonb)
              FROM (SELECT e.currency, SUM(e.amount)::text AS total FROM expenses e WHERE e.project_id = p.id GROUP BY e.currency) s
           ) AS actual_by_currency
    FROM projects p WHERE p.archived_at IS NULL AND p.status IN ('planning','in_progress')
    ORDER BY p.created_at DESC LIMIT 10`);
  return {
    kind: 'owner',
    activePersonnel: activePersonnel[0]?.n ?? 0,
    pendingApplications: pendingApps[0]?.n ?? 0,
    newRequests: newRequests[0]?.n ?? 0,
    activeProjects: activeProjects[0]?.n ?? 0,
    overdueMilestones: overdueMilestones[0]?.n ?? 0,
    outstandingInvoices,
    upcomingMilestones: upcoming,
    budgetVsActual,
    recentAudit,
  };
}

async function hrDashboard(db: DB) {
  const appsByStatus = await db.execute(sql`SELECT status, count(*)::int AS n FROM applications GROUP BY status`);
  const byCategory = await db.execute(sql`
    SELECT c.name_en, c.name_ar, count(a.id)::int AS n
    FROM applications a LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.status IN ('submitted','under_review','shortlisted','interview')
    GROUP BY c.name_en, c.name_ar ORDER BY n DESC LIMIT 12`);
  const byLocation = await db.execute(sql`
    SELECT governorate, count(*)::int AS n FROM applications
    WHERE status IN ('submitted','under_review','shortlisted','interview')
    GROUP BY governorate ORDER BY n DESC`);
  const personnelByType = await db.execute(sql`
    SELECT person_type, count(*)::int AS n FROM personnel
    WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL AND employment_status = 'active'
    GROUP BY person_type`);
  return { kind: 'hr', appsByStatus, byCategory, byLocation, personnelByType };
}

async function pmDashboard(db: DB, user: AuthUser) {
  const today = new Date().toISOString().slice(0, 10);
  const scope = hasPerm(user.role, 'projects.read_all')
    ? sql`TRUE`
    : sql`EXISTS (SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND (pt.user_id = ${user.id} OR pt.personnel_id = ${user.personnelId}) AND pt.removed_at IS NULL)`;
  const myProjects = await db.execute(sql`
    SELECT p.id, p.project_no, p.name, p.status, p.priority, p.target_end_date,
      (SELECT count(*)::int FROM milestones m WHERE m.project_id = p.id AND m.status = 'done') AS milestones_done,
      (SELECT count(*)::int FROM milestones m WHERE m.project_id = p.id) AS milestones_total,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_tasks
    FROM projects p
    WHERE p.archived_at IS NULL AND ${scope}
    ORDER BY p.status, p.target_end_date NULLS LAST LIMIT 30`);
  const deadlines = await db.execute(sql`
    SELECT m.id, m.title, m.due_date, m.status, p.id AS project_id, p.project_no, p.name AS project_name
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE m.status <> 'done' AND m.due_date <= ${new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)} AND ${scope}
    ORDER BY m.due_date LIMIT 30`);
  const conflicts = await db.execute(sql`
    SELECT a.personnel_id, a.work_date, per.full_name
    FROM assignments a JOIN personnel per ON per.id = a.personnel_id
    WHERE a.work_date >= ${today} AND EXISTS (
      SELECT 1 FROM attendance att WHERE att.personnel_id = a.personnel_id AND att.work_date = a.work_date AND att.status = 'leave')
    LIMIT 30`);
  const openIssues = await db.execute(sql`
    SELECT i.id, i.title, i.severity, p.id AS project_id, p.project_no
    FROM issues i JOIN projects p ON p.id = i.project_id
    WHERE i.status = 'open' AND ${scope} ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 20`);
  return { kind: 'pm', myProjects, deadlines, conflicts, openIssues, overdueFlag: today };
}

async function accountantDashboard(db: DB) {
  const invoicesSummary = await db.execute(sql`
    SELECT currency, status, count(*)::int AS n, SUM(total)::text AS total, SUM(total - paid_total)::text AS outstanding
    FROM invoices WHERE status <> 'cancelled' GROUP BY currency, status`);
  const recentReceipts = await db.select({
    id: receipts.id, receiptNo: receipts.receiptNo, amount: receipts.amount, currency: receipts.currency,
    receivedOn: receipts.receivedOn, method: receipts.method,
  }).from(receipts).where(isNull(receipts.voidedAt)).orderBy(desc(receipts.receivedOn)).limit(10);
  const expensesByCategory = await db.execute(sql`
    SELECT category, currency, SUM(amount)::text AS total FROM expenses
    WHERE expense_date >= ${new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)}
    GROUP BY category, currency ORDER BY category`);
  const pendingQuotes = await db.select({ n: sql<number>`count(*)::int` }).from(quotations).where(eq(quotations.status, 'pending_approval'));
  const overdueInvoices = await db.execute(sql`
    SELECT i.id, i.invoice_no, i.currency, i.due_date, (i.total - i.paid_total)::text AS outstanding, c.name AS customer
    FROM invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.status IN ('sent','partial') AND i.due_date IS NOT NULL AND i.due_date < ${new Date().toISOString().slice(0, 10)}
    ORDER BY i.due_date LIMIT 20`);
  return { kind: 'accountant', invoicesSummary, recentReceipts, expensesByCategory, pendingQuotes: pendingQuotes[0]?.n ?? 0, overdueInvoices };
}

async function workerDashboard(db: DB, user: AuthUser) {
  if (!user.personnelId) {
    return { kind: 'worker', profile: null, upcoming: [], attendance: [], note: 'Account not linked to a personnel record.' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db.select({
    id: assignments.id, workDate: assignments.workDate, shift: assignments.shift,
    projectNo: projects.projectNo, projectName: projects.name,
  }).from(assignments).leftJoin(projects, eq(assignments.projectId, projects.id))
    .where(and(eq(assignments.personnelId, user.personnelId), gte(assignments.workDate, today)))
    .orderBy(sql`${assignments.workDate} ASC`).limit(14);
  const att = await db.select({
    workDate: attendance.workDate, status: attendance.status, regularHours: attendance.regularHours,
    overtimeHours: attendance.overtimeHours, approvalStatus: attendance.approvalStatus,
  }).from(attendance).where(eq(attendance.personnelId, user.personnelId))
    .orderBy(desc(attendance.workDate)).limit(30);
  return { kind: 'worker', upcoming, attendance: att };
}

async function customerDashboard(db: DB, user: AuthUser) {
  if (!user.customerId) return { kind: 'customer', requests: [], projects: [] };
  const myRequests = await db.select({
    id: requests.id, reference: requests.reference, status: requests.status, submittedAt: requests.submittedAt,
  }).from(requests).where(eq(requests.customerId, user.customerId)).orderBy(desc(requests.submittedAt)).limit(20);
  const myProjects = await db.select({
    id: projects.id, projectNo: projects.projectNo, name: projects.name, status: projects.status, targetEndDate: projects.targetEndDate,
  }).from(projects).where(eq(projects.customerId, user.customerId)).orderBy(desc(projects.createdAt)).limit(20);
  return { kind: 'customer', requests: myRequests, projects: myProjects };
}
