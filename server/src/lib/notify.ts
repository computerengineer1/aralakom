/**
 * Notifications: in-app rows + email delivery.
 *
 * Email uses nodemailer/SMTP ONLY when explicitly configured (SMTP_HOST).
 * Otherwise messages are written to data/outbox/*.json with status 'skipped'
 * so nothing silently pretends to be delivered. Delivery status and attempts
 * are persisted; a dedupe_key prevents duplicate sends for the same event.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTransport } from 'nodemailer';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { config } from '../config.js';
import { t, type Loc } from './i18n.js';

type Transporter = ReturnType<typeof createTransport>;
let transporter: Transporter | undefined;

export function smtpConfigured(): boolean {
  return Boolean(config.smtp.host);
}

function getTransporter(): Transporter | undefined {
  if (!smtpConfigured()) return undefined;
  if (!transporter) {
    transporter = createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
  }
  return transporter;
}

export interface NotifyInput {
  channel: 'inapp' | 'email';
  userId?: string | null;
  toEmail?: string | null;
  locale?: Loc;
  templateKey: string;
  payload?: Record<string, unknown>;
  subject?: string;
  body?: string;
  dedupeKey?: string | null;
}

export async function notify(db: Db, input: NotifyInput): Promise<{ id: string; status: string } | null> {
  const locale: Loc = input.locale ?? 'en';
  const subject = input.subject ?? t(`${input.templateKey}.title`, locale, (input.payload ?? {}) as Record<string, string>);
  const body = input.body ?? t(`${input.templateKey}.body`, locale, (input.payload ?? {}) as Record<string, string>);

  if (input.dedupeKey) {
    const existing = await db.select({ id: notifications.id }).from(notifications)
      .where(eq(notifications.dedupeKey, input.dedupeKey)).limit(1);
    if (existing[0]) return { id: existing[0].id, status: 'duplicate-skipped' };
  }

  const [row] = await db.insert(notifications).values({
    userId: input.userId ?? null,
    channel: input.channel,
    toEmail: input.toEmail ?? null,
    locale,
    templateKey: input.templateKey,
    payload: (input.payload ?? {}) as Record<string, unknown>,
    subject,
    body,
    status: 'pending',
    dedupeKey: input.dedupeKey ?? null,
  }).returning({ id: notifications.id });

  if (input.channel === 'inapp') {
    await db.update(notifications).set({ status: 'sent', sentAt: new Date() }).where(eq(notifications.id, row!.id));
    return { id: row!.id, status: 'sent' };
  }

  await deliverEmail(db, row!.id);
  const fresh = await db.select({ status: notifications.status }).from(notifications).where(eq(notifications.id, row!.id)).limit(1);
  return { id: row!.id, status: fresh[0]?.status ?? 'pending' };
}

async function deliverEmail(db: Db, notificationId: string): Promise<void> {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1);
  if (!n || !n.toEmail) return;
  await db.update(notifications).set({ attempts: n.attempts + 1 }).where(eq(notifications.id, notificationId));

  const tp = getTransporter();
  if (!tp) {
    // Dev fallback: persist to outbox, mark 'skipped' (never falsely 'sent').
    try {
      mkdirSync(join(process.cwd(), 'data/outbox'), { recursive: true });
      writeFileSync(
        join(process.cwd(), 'data/outbox', `${notificationId}.json`),
        JSON.stringify({ to: n.toEmail, subject: n.subject, body: n.body, at: new Date().toISOString() }, null, 2),
      );
    } catch { /* best effort */ }
    await db.update(notifications)
      .set({ status: 'skipped', lastError: 'SMTP not configured; written to data/outbox' })
      .where(eq(notifications.id, notificationId));
    return;
  }

  try {
    await tp.sendMail({ from: config.smtp.from, to: n.toEmail, subject: n.subject ?? '', text: n.body ?? '' });
    await db.update(notifications).set({ status: 'sent', sentAt: new Date(), lastError: null })
      .where(eq(notifications.id, notificationId));
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 280) : 'unknown error';
    await db.update(notifications).set({ status: 'failed', lastError: msg }).where(eq(notifications.id, notificationId));
  }
}

/** Retry pending/failed emails (called on an interval and via admin endpoint). */
export async function retryPendingEmails(db: Db, limit = 20): Promise<number> {
  if (!smtpConfigured()) return 0;
  const rows = await db.select({ id: notifications.id }).from(notifications)
    .where(and(
      eq(notifications.channel, 'email'),
      eq(notifications.status, 'failed'),
      lt(notifications.attempts, 5),
      isNull(notifications.sentAt),
    ))
    .limit(limit);
  for (const r of rows) await deliverEmail(db, r.id);
  return rows.length;
}
