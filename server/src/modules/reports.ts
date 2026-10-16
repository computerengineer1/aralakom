import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { parseWith, badRequest, forbidden } from '../lib/http.js';
import type { Db } from '../db/index.js';
import { hasPerm } from '../lib/rbac.js';

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.enum(['LBP', 'USD']).optional(),
});

export function registerReportRoutes(app: FastifyInstance): void {
  const report = (name: string, perm: 'personnel.read' | 'finance.reports' | 'applications.read' | 'requests.read' | 'schedule.read', handler: (db: Db, params: z.infer<typeof rangeSchema>) => Promise<unknown>) => {
    app.get(`/api/reports/${name}`, async (req) => {
      const user = req.requireAuth();
      if (!hasPerm(user.role, perm)) throw forbidden('PERMISSION_DENIED', `Report requires '${perm}'`);
      const params = parseWith(rangeSchema, req.query);
      return handler(req.db, params);
    });
  };

  report('personnel-by-category', 'personnel.read', async (db) => {
    const rows = await db.execute(sql`
      SELECT c.name_en, c.name_ar, p.person_type, count(*)::int AS n
      FROM personnel p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.merged_into_id IS NULL
      GROUP BY c.name_en, c.name_ar, p.person_type ORDER BY n DESC`);
    return { items: rows };
  });

  report('personnel-by-location', 'personnel.read', async (db) => {
    const rows = await db.execute(sql`
      SELECT governorate, count(*)::int AS n
      FROM personnel WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL
      GROUP BY governorate ORDER BY n DESC`);
    return { items: rows };
  });

  report('recruitment-funnel', 'applications.read', async (db) => {
    const rows = await db.execute(sql`
      SELECT status, count(*)::int AS n FROM applications GROUP BY status`);
    return { items: rows };
  });

  report('requests-by-status', 'requests.read', async (db) => {
    const byStatus = await db.execute(sql`SELECT status, count(*)::int AS n FROM requests GROUP BY status`);
    const byCategory = await db.execute(sql`
      SELECT c.name_en, c.name_ar, r.status, count(*)::int AS n
      FROM requests r LEFT JOIN categories c ON c.id = r.category_id
      GROUP BY c.name_en, c.name_ar, r.status ORDER BY n DESC`);
    return { byStatus, byCategory };
  });

  report('project-progress', 'finance.reports', async (db) => {
    const rows = await db.execute(sql`
      SELECT p.id, p.project_no, p.name, p.status, p.target_end_date,
        (SELECT count(*) FROM milestones m WHERE m.project_id = p.id) AS milestones_total,
        (SELECT count(*) FROM milestones m WHERE m.project_id = p.id AND m.status = 'done') AS milestones_done,
        (SELECT count(*) FROM milestones m WHERE m.project_id = p.id AND m.status <> 'done' AND m.due_date < CURRENT_DATE) AS overdue_milestones
      FROM projects p WHERE p.archived_at IS NULL ORDER BY p.status, p.target_end_date NULLS LAST`);
    return { items: rows };
  });

  report('project-costs', 'finance.reports', async (db, params) => {
    if (!params.currency) throw badRequest('CURRENCY_REQUIRED', 'Currency filter is required for cost reports (amounts are never mixed across currencies)');
    const rows = await db.execute(sql`
      SELECT p.id, p.project_no, p.name,
             p.contract_amount, p.contract_currency, p.budget_amount, p.budget_currency,
             COALESCE(SUM(e.amount) FILTER (WHERE e.currency = ${params.currency}), 0)::text AS actual_cost
      FROM projects p LEFT JOIN expenses e ON e.project_id = p.id
      WHERE p.archived_at IS NULL
      GROUP BY p.id ORDER BY p.project_no`);
    return { currency: params.currency, items: rows };
  });

  report('invoices-outstanding', 'finance.reports', async (db) => {
    const rows = await db.execute(sql`
      SELECT i.invoice_no, i.currency, i.issue_date, i.due_date, i.status,
             i.total, i.paid_total, (i.total - i.paid_total)::text AS outstanding, c.name AS customer
      FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ('sent','partial') ORDER BY i.due_date NULLS LAST`);
    return { items: rows };
  });

  report('attendance-hours', 'schedule.read', async (db, params) => {
    const from = params.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = params.to ?? new Date().toISOString().slice(0, 10);
    const rows = await db.execute(sql`
      SELECT per.full_name, per.record_no,
             SUM(att.regular_hours)::text AS regular_hours,
             SUM(att.overtime_hours)::text AS overtime_hours,
             count(*) FILTER (WHERE att.status = 'present')::int AS days_present,
             count(*) FILTER (WHERE att.status = 'absent')::int AS days_absent
      FROM attendance att JOIN personnel per ON per.id = att.personnel_id
      WHERE att.work_date BETWEEN ${from} AND ${to} AND att.approval_status = 'approved'
      GROUP BY per.id ORDER BY regular_hours DESC NULLS LAST LIMIT 500`);
    return { from, to, items: rows };
  });

  report('revenue-profit', 'finance.reports', async (db, params) => {
    if (!params.currency) throw badRequest('CURRENCY_REQUIRED', 'Currency filter is required (amounts are never mixed across currencies)');
    const from = params.from ?? '1900-01-01';
    const to = params.to ?? '2999-12-31';
    const revenue = await db.execute(sql`
      SELECT COALESCE(SUM(total),0)::text AS invoiced, COALESCE(SUM(paid_total),0)::text AS collected
      FROM invoices WHERE currency = ${params.currency} AND status NOT IN ('cancelled','draft')
        AND issue_date BETWEEN ${from} AND ${to}`);
    const costs = await db.execute(sql`
      SELECT COALESCE(SUM(amount),0)::text AS expenses
      FROM expenses WHERE currency = ${params.currency} AND expense_date BETWEEN ${from} AND ${to}`);
    const r = (revenue as unknown as Array<Record<string, string>>)[0] ?? {};
    const c = (costs as unknown as Array<Record<string, string>>)[0] ?? {};
    const invoiced = Number(r.invoiced ?? 0);
    const collected = Number(r.collected ?? 0);
    const expensed = Number(c.expenses ?? 0);
    return {
      currency: params.currency, from, to,
      invoiced: String(invoiced), collected: String(collected), expenses: String(expensed),
      estimatedGrossProfit: String(invoiced - expensed),
      estimatedMarginPct: invoiced > 0 ? String(Math.round(((invoiced - expensed) / invoiced) * 1000) / 10) : null,
      disclaimer: 'Estimates only. Verify Lebanese tax, invoicing and accounting requirements with the company accountant/legal adviser.',
    };
  });
}
