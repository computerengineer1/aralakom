import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import type { Db } from '../db/index.js';
import { users, sessions, passwordResets } from '../db/schema.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/password.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { auditFromReq } from '../lib/audit.js';
import { HttpError, badRequest, parseWith, unauthorized } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { t } from '../lib/i18n.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../plugins/auth.js';
import { PRIVILEGED_ROLES, type Role } from '../lib/rbac.js';

const SESSION_COOKIE_NAME = SESSION_COOKIE;

function cookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  };
}

async function createSession(db: Db, req: FastifyRequest, userId: string, mfaVerified: boolean): Promise<{ token: string; csrf: string; id: string }> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  const [row] = await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    csrfToken: csrf,
    mfaVerified,
    expiresAt,
    ip: req.ip?.slice(0, 60) ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 290) || null,
  }).returning({ id: sessions.id });
  return { token, csrf, id: row!.id };
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // CSRF bootstrap: sets HttpOnly cookie + returns token for the JS client to echo.
  app.get('/api/auth/csrf', async (req, reply) => {
    const existing = req.cookies?.[CSRF_COOKIE];
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) {
      return { token: existing };
    }
    const token = randomToken(24);
    reply.setCookie(CSRF_COOKIE, token, { ...cookieOptions(8 * 3600) });
    return { token };
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.user) return { user: null };
    const u = req.user;
    return {
      user: {
        id: u.id, email: u.email, fullName: u.fullName, role: u.role, locale: u.locale,
        mfaEnabled: u.mfaEnabled, mfaVerified: u.mfaVerified,
      },
    };
  });

  const loginSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(128),
    totp: z.string().trim().regex(/^\d{6}$/).optional(),
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 12, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const body = parseWith(loginSchema, req.body);
    const db = req.db;
    const audit = auditFromReq(req, db);
    const email = body.email.toLowerCase();

    const [user] = await db.select().from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    // Generic response regardless of existence (no account enumeration).
    const genericError = () => {
      void audit('auth.login_failed', undefined, { email, reason: user ? 'bad_credentials' : 'unknown_account' }, { actorId: user?.id ?? null });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    };

    if (!user || user.deletedAt) genericError();
    if (user!.status !== 'active') {
      void audit('auth.login_blocked', undefined, { reason: 'suspended' }, { actorId: user!.id });
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.');
    }
    if (user!.lockedUntil && user!.lockedUntil > new Date()) {
      void audit('auth.login_locked', undefined, {}, { actorId: user!.id });
      throw new HttpError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked due to repeated failed attempts. Try again later.');
    }

    const ok = await verifyPassword(body.password, user!.passwordHash);
    if (!ok) {
      const fails = user!.failedLoginCount + 1;
      const lock = fails >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.update(users).set({ failedLoginCount: fails, lockedUntil: lock }).where(eq(users.id, user!.id));
      genericError();
    }

    // MFA gate
    if (user!.mfaEnabled) {
      if (!body.totp) {
        // Partial session: created but mfaVerified=false; requireAuth() blocks until verified.
        const s = await createSession(db, req, user!.id, false);
        reply.setCookie(SESSION_COOKIE_NAME, s.token, cookieOptions(config.sessionTtlHours * 3600));
        reply.setCookie(CSRF_COOKIE, s.csrf, cookieOptions(config.sessionTtlHours * 3600));
        void audit('auth.mfa_challenge', undefined, {}, { actorId: user!.id });
        return { mfaRequired: true };
      }
      const valid = authenticator.verify({ token: body.totp, secret: user!.mfaSecret ?? '' });
      if (!valid) {
        void audit('auth.mfa_failed', undefined, {}, { actorId: user!.id });
        throw new HttpError(401, 'INVALID_TOTP', 'Invalid verification code');
      }
    }

    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user!.id));
    // Invalidate pre-existing partial (MFA-pending) sessions for hygiene.
    const s = await createSession(db, req, user!.id, true);
    reply.setCookie(SESSION_COOKIE_NAME, s.token, cookieOptions(config.sessionTtlHours * 3600));
    reply.setCookie(CSRF_COOKIE, s.csrf, cookieOptions(config.sessionTtlHours * 3600));
    void audit('auth.login_success', undefined, {}, { actorId: user!.id, actorEmail: user!.email });

    // Enforce MFA enrollment policy for privileged roles.
    const requireMfa = PRIVILEGED_ROLES.includes(user!.role as Role) && user!.mfaEnabled === false;
    return {
      user: { id: user!.id, email: user!.email, fullName: user!.fullName, role: user!.role, locale: user!.locale, mfaEnabled: user!.mfaEnabled },
      mfaRecommended: requireMfa,
      mustChangePassword: user!.mustChangePassword,
    };
  });

  app.post('/api/auth/mfa/verify', async (req, reply) => {
    const user = req.user;
    if (!user) throw unauthorized();
    const body = parseWith(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    const db = req.db;
    const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!u?.mfaSecret || !authenticator.verify({ token: body.code, secret: u.mfaSecret })) {
      throw new HttpError(401, 'INVALID_TOTP', 'Invalid verification code');
    }
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, user.sessionId));
    const csrf = randomToken(24);
    await db.update(sessions).set({ csrfToken: csrf }).where(eq(sessions.id, user.sessionId));
    reply.setCookie(CSRF_COOKIE, csrf, cookieOptions(config.sessionTtlHours * 3600));
    void auditFromReq(req, db)('auth.mfa_verified', undefined, {}, { actorId: u.id });
    return { ok: true };
  });

  app.post('/api/auth/mfa/enroll', async (req) => {
    const user = req.requireAuth();
    const db = req.db;
    const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!u) throw unauthorized();
    if (u.mfaEnabled) throw badRequest('ALREADY_ENABLED', 'MFA is already enabled');
    const secret = authenticator.generateSecret();
    await db.update(users).set({ mfaSecret: secret }).where(eq(users.id, u.id));
    const otpauth = authenticator.keyuri(u.email, 'LCMP', secret);
    const qr = await QRCode.toDataURL(otpauth, { width: 220, margin: 1 });
    return { secret, otpauth, qrDataUrl: qr };
  });

  app.post('/api/auth/mfa/confirm', async (req) => {
    const user = req.requireAuth();
    const body = parseWith(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    const db = req.db;
    const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!u?.mfaSecret) throw badRequest('NOT_ENROLLED', 'Start enrollment first');
    if (!authenticator.verify({ token: body.code, secret: u.mfaSecret })) {
      throw new HttpError(401, 'INVALID_TOTP', 'Invalid verification code');
    }
    await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, u.id));
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, user.sessionId));
    void auditFromReq(req, db)('auth.mfa_enabled', undefined, {}, { actorId: u.id });
    return { ok: true };
  });

  app.post('/api/auth/mfa/disable', async (req) => {
    const user = req.requireAuth();
    req.requireRecentAuth(15);
    const body = parseWith(z.object({ password: z.string().min(1).max(128) }), req.body);
    const db = req.db;
    const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!u || !(await verifyPassword(body.password, u.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid password');
    }
    await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, u.id));
    void auditFromReq(req, db)('auth.mfa_disabled', undefined, {}, { actorId: u.id });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const db = req.db;
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
      if (req.user) void auditFromReq(req, db)('auth.logout', undefined, {}, { actorId: req.user.id });
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });

  const forgotSchema = z.object({ email: z.string().trim().email().max(320) });

  app.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req) => {
    const body = parseWith(forgotSchema, req.body);
    const db = req.db;
    const email = body.email.toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Always the same response — never reveal account existence.
    if (user && !user.deletedAt && user.status === 'active') {
      const token = randomToken(32);
      await db.insert(passwordResets).values({
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000),
      });
      const url = `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await notify(db, {
        channel: 'email',
        toEmail: user.email,
        locale: user.locale,
        templateKey: 'app.password.reset',
        subject: t('app.password.reset.title', user.locale),
        body: t('app.password.reset.body', user.locale, { name: user.fullName, url, minutes: config.passwordResetTtlMinutes }),
        dedupeKey: `pwreset:${user.id}:${Math.floor(Date.now() / 3600000)}`,
      });
      void auditFromReq(req, db)('auth.password_reset_requested', undefined, {}, { actorId: user.id });
    } else {
      void auditFromReq(req, db)('auth.password_reset_unknown', undefined, { email });
    }
    return { ok: true, message: 'If an account exists for this email, a reset link has been sent.' };
  });

  const resetSchema = z.object({
    token: z.string().min(20).max(200),
    password: z.string().min(1).max(128),
  });

  app.post('/api/auth/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req) => {
    const body = parseWith(resetSchema, req.body);
    const issues = validatePasswordStrength(body.password);
    if (issues.length > 0) throw badRequest('WEAK_PASSWORD', 'Password does not meet the policy', issues);
    const db = req.db;
    const tokenHash = sha256(body.token);
    const [reset] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
    }
    const hash = await hashPassword(body.password);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, reset.userId));
      await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
      await tx.delete(sessions).where(eq(sessions.userId, reset.userId)); // kill all sessions
    });
    void auditFromReq(req, db)('auth.password_reset_completed', undefined, {}, { actorId: reset.userId });
    return { ok: true };
  });

  app.post('/api/auth/change-password', async (req) => {
    const user = req.requireAuth();
    const body = parseWith(z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(1).max(128),
    }), req.body);
    const issues = validatePasswordStrength(body.newPassword);
    if (issues.length > 0) throw badRequest('WEAK_PASSWORD', 'Password does not meet the policy', issues);
    const db = req.db;
    const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!u || !(await verifyPassword(body.currentPassword, u.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    const hash = await hashPassword(body.newPassword);
    await db.update(users).set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, u.id));
    // Revoke other sessions; keep the current one.
    const currentTokenHash = sha256(req.cookies?.[SESSION_COOKIE_NAME] ?? '');
    const all = await db.select({ id: sessions.id, tokenHash: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, u.id));
    for (const s of all) {
      if (s.tokenHash !== currentTokenHash) await db.delete(sessions).where(eq(sessions.id, s.id));
    }
    void auditFromReq(req, db)('auth.password_changed', undefined, {}, { actorId: u.id });
    return { ok: true };
  });

  app.post('/api/auth/locale', async (req) => {
    const user = req.requireAuth();
    const body = parseWith(z.object({ locale: z.enum(['ar', 'en']) }), req.body);
    await req.db.update(users).set({ locale: body.locale }).where(eq(users.id, user.id));
    return { ok: true };
  });
}
