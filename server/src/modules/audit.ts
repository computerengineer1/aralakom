import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { auditEvents } from '../db/schema.js';
import { parsePagination } from './common.js';

export function registerAuditRoutes(app: FastifyInstance): void {
  /**
   * Audit events are append-only: no update/delete endpoints exist anywhere.
   * Read requires the audit.read permission (owner/admin/accountant...).
   */
  app.get('/api/audit', async (req) => {
    req.requirePerm('audit.read');
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize } = parsePagination(req);
    const conditions = [];
    if (q.action) conditions.push(sql`action ILIKE ${q.action.slice(0, 60) + '%'}`);
    if (q.entityType) conditions.push(eq(auditEvents.entityType, q.entityType.slice(0, 40)));
    if (q.entityId) conditions.push(eq(auditEvents.entityId, q.entityId.slice(0, 64)));
    if (q.actorId) conditions.push(eq(auditEvents.actorId, q.actorId));
    if (q.from) conditions.push(gte(auditEvents.createdAt, new Date(q.from.slice(0, 40))));
    const where = conditions.length ? and(...conditions) : undefined;
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(auditEvents).where(where);
    const rows = await req.db.select().from(auditEvents).where(where)
      .orderBy(desc(auditEvents.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, page, pageSize, total: c?.n ?? 0, totalPages: Math.max(1, Math.ceil((c?.n ?? 0) / pageSize)) };
  });
}
