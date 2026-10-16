import fp from 'fastify-plugin';
import { eq, and, gt } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { getDb, type Db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { sha256, safeEqual } from '../lib/tokens.js';
import { hasPerm, type Perm, type Role } from '../lib/rbac.js';
import { HttpError, forbidden, unauthorized } from '../lib/http.js';
import { config } from '../config.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  locale: 'ar' | 'en';
  mfaEnabled: boolean;
  mfaVerified: boolean;
  personnelId: string | null;
  customerId: string | null;
  sessionId: string;
  sessionCreatedAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    db: Db;
    requireAuth(): AuthUser;
    requirePerm(perm: Perm): AuthUser;
    requireOwner(): AuthUser;
    requireRecentAuth(maxAgeMinutes?: number): AuthUser;
  }
}

export const SESSION_COOKIE = 'lcmp_session';
export const CSRF_COOKIE = 'lcmp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

async function loadUserFromRequest(req: FastifyRequest): Promise<AuthUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const db = getDb();
  const tokenHash = sha256(token);
  const [session] = await db.select().from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users)
    .where(and(eq(users.id, session.userId), eq(users.status, 'active')))
    .limit(1);
  if (!user || user.deletedAt) return null;

  // Enforce MFA gate for privileged roles when configured.
  if (user.mfaEnabled && !session.mfaVerified) {
    return {
      id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role,
      locale: user.locale, mfaEnabled: true, mfaVerified: false,
      personnelId: user.personnelId, customerId: user.customerId,
      sessionId: session.id, sessionCreatedAt: session.createdAt,
    };
  }
  // Touch session (throttled: only if last seen > 60s ago).
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id)).catch(() => undefined);
  }
  return {
    id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role,
    locale: user.locale, mfaEnabled: user.mfaEnabled, mfaVerified: session.mfaVerified,
    personnelId: user.personnelId, customerId: user.customerId,
    sessionId: session.id, sessionCreatedAt: session.createdAt,
  };
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('db', null as unknown as Db);

  app.addHook('onRequest', async (req) => {
    (req as FastifyRequest).db = getDb();
    if (req.url.startsWith('/api')) {
      req.user = await loadUserFromRequest(req);
    }
  });

  // CSRF: double-submit. The cookie is HttpOnly (not readable by scripts);
  // the JS client must echo the token it fetched via GET /api/auth/csrf in a header.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (req.url === '/api/health') return;
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];
    if (!cookieToken || typeof headerToken !== 'string' || !safeEqual(cookieToken, headerToken)) {
      throw new HttpError(403, 'CSRF_FAILED', 'CSRF validation failed');
    }
    void reply;
  });

  app.decorateRequest('requireAuth', function (this: FastifyRequest) {
    if (!this.user) throw unauthorized();
    if (this.user.mfaEnabled && !this.user.mfaVerified) {
      throw new HttpError(401, 'MFA_REQUIRED', 'Multi-factor verification required');
    }
    return this.user;
  });

  app.decorateRequest('requirePerm', function (this: FastifyRequest, perm: Perm) {
    const user = this.requireAuth();
    if (!hasPerm(user.role, perm)) throw forbidden('PERMISSION_DENIED', `Missing permission: ${perm}`);
    return user;
  });

  app.decorateRequest('requireOwner', function (this: FastifyRequest) {
    const user = this.requireAuth();
    if (user.role !== 'owner') throw forbidden('OWNER_ONLY', 'This action requires the owner account');
    return user;
  });

  app.decorateRequest('requireRecentAuth', function (this: FastifyRequest, maxAgeMinutes = 30) {
    const user = this.requireAuth();
    const ageMin = (Date.now() - user.sessionCreatedAt.getTime()) / 60000;
    if (ageMin > maxAgeMinutes) {
      throw new HttpError(401, 'RECENT_AUTH_REQUIRED', 'Please sign in again to perform this sensitive action');
    }
    return user;
  });

  void config;
}, { name: 'auth' });
