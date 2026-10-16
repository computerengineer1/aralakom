import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/index.js';
import { auditEvents } from '../db/schema.js';

export interface AuditContext {
  actorId?: string | null;
  actorEmail?: string | null;
  ip?: string;
  requestId?: string;
}

const REDACT_KEYS = ['password', 'token', 'secret', 'passwordhash', 'csrf', 'accesstoken', 'mfa', 'mfasecret', 'authorization', 'cookie'];

/** Strip sensitive keys from a summary object before persisting. */
export function redact(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (REDACT_KEYS.some((rk) => k.toLowerCase().includes(rk))) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return obj;
}

export async function audit(
  db: Db,
  action: string,
  ctx: AuditContext,
  entity?: { type: string; id: string },
  summary: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorId: ctx.actorId ?? null,
      actorEmail: ctx.actorEmail ?? null,
      action,
      entityType: entity?.type ?? null,
      entityId: entity?.id ?? null,
      summary: redact(summary) as Record<string, unknown>,
      ip: ctx.ip ?? null,
      requestId: ctx.requestId ?? null,
    });
  } catch (err) {
    // Auditing must never crash a request, but failures must be visible in logs.
    console.error('[audit] failed to write audit event', { action, err });
  }
}

export function auditFromReq(req: FastifyRequest & { user?: { id: string; email: string } | null }, db: Db) {
  const base: AuditContext = {
    actorId: req.user?.id ?? null,
    actorEmail: req.user?.email ?? null,
    ip: req.ip,
    requestId: req.id,
  };
  return (
    action: string,
    entity?: { type: string; id: string },
    summary: Record<string, unknown> = {},
    actorOverride?: Partial<AuditContext>,
  ) => audit(db, action, { ...base, ...actorOverride }, entity, summary);
}
