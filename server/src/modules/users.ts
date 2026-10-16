import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { users, sessions } from '../db/schema.js';
import { hashPassword, validatePasswordStrength } from '../lib/password.js';
import { parseWith, badRequest, notFound, forbidden } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { ROLES, STAFF_ROLES, type Role } from '../lib/rbac.js';
import { randomToken } from '../lib/tokens.js';
import { notify } from '../lib/notify.js';
import { config } from '../config.js';

const createSchema = z.object({
  email: z.string().trim().email().max(320),
  fullName: z.string().trim().min(2).max(200),
  role: z.enum(STAFF_ROLES as unknown as [string, ...string[]]),
  locale: z.enum(['ar', 'en']).default('en'),
  temporaryPassword: z.string().min(10).max(128).optional(),
});

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/users', async (req) => {
    req.requirePerm('users.manage');
    const rows = await req.db.select({
      id: users.id, email: users.email, fullName: users.fullName, role: users.role,
      status: users.status, locale: users.locale, mfaEnabled: users.mfaEnabled,
      lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      personnelId: users.personnelId, customerId: users.customerId,
    }).from(users).where(isNull(users.deletedAt)).orderBy(asc(users.createdAt));
    return { items: rows };
  });

  /**
   * Create a staff account. Owner-only for owner/admin roles.
   * If no temporaryPassword is supplied, an invitation/reset email is sent instead —
   * never return a generated password in the API response for privileged roles.
   */
  app.post('/api/users', async (req) => {
    const actor = req.requirePerm('users.manage');
    const body = parseWith(createSchema, req.body);
    const role = body.role as Role;
    if ((role === 'owner' || role === 'admin') && actor.role !== 'owner') {
      throw forbidden('OWNER_ONLY', 'Only the owner can create owner/admin accounts');
    }
    const db = req.db;
    const email = body.email.toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
    if (existing[0]) throw badRequest('EMAIL_TAKEN', 'An active account with this email already exists');

    const hash = body.temporaryPassword
      ? await hashPassword(body.temporaryPassword)
      : await hashPassword(randomToken(12)); // unusable random; reset required


    const issues = body.temporaryPassword ? validatePasswordStrength(body.temporaryPassword) : [];
    if (issues.length) throw badRequest('WEAK_PASSWORD', 'Temporary password does not meet the policy', issues);

    const [row] = await db.insert(users).values({
      email, fullName: body.fullName, role, locale: body.locale,
      passwordHash: hash,
      mustChangePassword: Boolean(body.temporaryPassword),
      createdBy: actor.id,
    }).returning({ id: users.id });

    if (!body.temporaryPassword) {
      const url = `${config.appBaseUrl}/login`;
      await notify(db, {
        channel: 'email', toEmail: email, locale: body.locale, templateKey: 'app.password.reset',
        subject: 'Account created — set your password',
        body: `An account was created for you on the Lebanon Contracting Management Platform.\nAsk an administrator for a password reset, or use "Forgot password" at ${url}.`,
      });
    }

    void auditFromReq(req, db)('users.created', { type: 'user', id: row!.id }, { email, role });
    return { id: row!.id, email, role, mustChangePassword: Boolean(body.temporaryPassword), temporaryPasswordAccepted: Boolean(body.temporaryPassword) };
  });

  app.patch('/api/users/:id', async (req) => {
    const actor = req.requirePerm('users.manage');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [target] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!target) throw notFound();
    if (target.role === 'owner' && actor.role !== 'owner' && target.id !== actor.id) {
      throw forbidden('OWNER_ONLY', 'Only the owner can modify an owner account');
    }
    const body = parseWith(z.object({
      fullName: z.string().trim().min(2).max(200).optional(),
      role: z.enum(ROLES).optional(),
      status: z.enum(['active', 'suspended', 'pending']).optional(),
      locale: z.enum(['ar', 'en']).optional(),
      personnelId: z.string().uuid().nullable().optional(),
      customerId: z.string().uuid().nullable().optional(),
    }), req.body);
    if (body.role && ['owner', 'admin'].includes(body.role) && actor.role !== 'owner') {
      throw forbidden('OWNER_ONLY', 'Only the owner can grant owner/admin roles');
    }
    if (target.id === actor.id && (body.status === 'suspended' || (body.role && body.role !== target.role))) {
      throw badRequest('SELF_MODIFICATION', 'You cannot suspend or change the role of your own account');
    }
    const [row] = await db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, id))
      .returning({ id: users.id, email: users.email, role: users.role, status: users.status });
    if (body.status === 'suspended' || body.role !== target.role) {
      await db.delete(sessions).where(eq(sessions.userId, id)); // force re-login
    }
    void auditFromReq(req, db)('users.updated', { type: 'user', id }, { changes: body, previousRole: target.role });
    return row;
  });

  /** Admin-initiated password reset: invalidates sessions and emails a reset link. */
  app.post('/api/users/:id/send-reset', async (req) => {
    const actor = req.requirePerm('users.manage');
    const { id } = req.params as { id: string };
    const db = req.db;
    const [target] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
    if (!target) throw notFound();
    if (target.role === 'owner' && actor.role !== 'owner') throw forbidden();
    const { passwordResets } = await import('../db/schema.js');
    const { sha256 } = await import('../lib/tokens.js');
    const token = randomToken(32);
    await db.insert(passwordResets).values({
      userId: target.id, tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + config.passwordResetTtlMinutes * 60000),
    });
    await db.delete(sessions).where(eq(sessions.userId, target.id));
    await notify(db, {
      channel: 'email', toEmail: target.email, locale: target.locale, templateKey: 'app.password.reset',
      payload: { name: target.fullName, url: `${config.appBaseUrl}/reset-password?token=${token}`, minutes: config.passwordResetTtlMinutes },
    });
    void auditFromReq(req, db)('users.reset_sent', { type: 'user', id: target.id }, {});
    return { ok: true };
  });

  app.delete('/api/users/:id', async (req) => {
    const actor = req.requireOwner();
    const { id } = req.params as { id: string };
    if (id === actor.id) throw badRequest('SELF_DELETE', 'You cannot delete your own account');
    const db = req.db;
    await db.update(users).set({ deletedAt: new Date(), status: 'suspended', updatedAt: new Date() }).where(eq(users.id, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    void auditFromReq(req, db)('users.deleted', { type: 'user', id }, {});
    return { ok: true };
  });
}
