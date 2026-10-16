import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { notifications } from '../db/schema.js';
import { parseWith, notFound, forbidden } from '../lib/http.js';
import { parsePagination } from './common.js';
import { retryPendingEmails, smtpConfigured } from '../lib/notify.js';

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.get('/api/notifications', async (req) => {
    const user = req.requireAuth();
    const rows = await req.db.select({
      id: notifications.id, templateKey: notifications.templateKey, subject: notifications.subject,
      body: notifications.body, createdAt: notifications.createdAt, readAt: notifications.readAt,
      status: notifications.status, channel: notifications.channel,
    }).from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.channel, 'inapp')))
      .orderBy(desc(notifications.createdAt)).limit(100);
    return { items: rows };
  });

  app.post('/api/notifications/:id/read', async (req) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    // Ownership enforced in WHERE — prevents IDOR on other users' notifications.
    const [row] = await req.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (!row) throw notFound();
    return { ok: true };
  });

  app.post('/api/notifications/read-all', async (req) => {
    const user = req.requireAuth();
    await req.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), eq(notifications.channel, 'inapp'), isNull(notifications.readAt)));
    return { ok: true };
  });

  /** Admin: delivery status overview + manual retry. */
  app.get('/api/notifications/admin', async (req) => {
    req.requirePerm('notifications.manage');
    const { page, pageSize } = parsePagination(req);
    const [c] = await req.db.select({ n: sql<number>`count(*)::int` }).from(notifications);
    const rows = await req.db.select({
      id: notifications.id, channel: notifications.channel, templateKey: notifications.templateKey,
      status: notifications.status, attempts: notifications.attempts, lastError: notifications.lastError,
      toEmail: notifications.toEmail, createdAt: notifications.createdAt, sentAt: notifications.sentAt,
    }).from(notifications).orderBy(desc(notifications.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows, total: c?.n ?? 0, smtpConfigured: smtpConfigured() };
  });

  app.post('/api/notifications/admin/retry', async (req) => {
    req.requirePerm('notifications.manage');
    const body = parseWith(z.object({ id: z.string().uuid().optional() }), req.body ?? {});
    if (!smtpConfigured()) {
      return { ok: false, reason: 'SMTP_NOT_CONFIGURED', message: 'Configure SMTP_HOST to enable email delivery. Pending emails are saved to data/outbox.' };
    }
    if (body.id) {
      await req.db.update(notifications).set({ status: 'failed' })
        .where(and(eq(notifications.id, body.id), eq(notifications.status, sql`'pending'`)));
    }
    const n = await retryPendingEmails(req.db, 50);
    return { ok: true, retried: n };
  });

  /** Broadcast a simple in-app notification to all active staff (owner/admin). */
  app.post('/api/notifications/admin/broadcast', async (req) => {
    const actor = req.requirePerm('notifications.manage');
    const body = parseWith(z.object({
      subject: z.string().trim().min(3).max(300),
      message: z.string().trim().min(3).max(2000),
    }), req.body);
    const { users } = await import('../db/schema.js');
    const targets = await req.db.select({ id: users.id }).from(users)
      .where(and(eq(users.status, 'active'), isNull(users.deletedAt), sql`role <> 'customer'`));
    for (const u of targets) {
      await req.db.insert(notifications).values({
        userId: u.id, channel: 'inapp', locale: 'en', templateKey: 'broadcast',
        subject: body.subject, body: body.message, status: 'sent', sentAt: new Date(),
      });
    }
    void actor;
    void forbidden;
    return { ok: true, recipients: targets.length };
  });
}
