import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { files, portfolioProjects } from '../db/schema.js';
import { notFound, forbidden } from '../lib/http.js';
import { hasPerm } from '../lib/rbac.js';
import { auditFromReq } from '../lib/audit.js';
import { config } from '../config.js';
import type { AuthUser } from '../plugins/auth.js';

/**
 * Authorization matrix for private file downloads, keyed by ownerType.
 * Default deny: anything not explicitly allowed is rejected.
 */
function canDownload(user: AuthUser | null, ownerType: string): boolean {
  if (!user) return false;
  switch (ownerType) {
    case 'application': return hasPerm(user.role, 'applications.read');
    case 'personnel': return hasPerm(user.role, 'personnel.read');
    case 'request': return hasPerm(user.role, 'requests.read');
    case 'project': return hasPerm(user.role, 'projects.read_all') || hasPerm(user.role, 'projects.write');
    case 'quotation': return hasPerm(user.role, 'quotes.read');
    case 'contract': return hasPerm(user.role, 'contracts.read');
    default: return ['owner', 'admin'].includes(user.role);
  }
}

export function registerFileRoutes(app: FastifyInstance): void {
  /** Public: portfolio cover images (explicitly published items only). */
  app.get('/api/files/public/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.db;
    const [f] = await db.select().from(files).where(and(eq(files.id, id), eq(files.visibility, 'public'), isNull(files.deletedAt))).limit(1);
    if (!f) throw notFound();
    const path = join(config.uploadDir, f.storedName);
    if (!existsSync(path)) throw notFound('FILE_MISSING', 'File not found on disk');
    reply.header('Cache-Control', 'public, max-age=86400');
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.type(f.mimeType).send(createReadStream(path));
  });

  /** Private: authenticated, authorized download service (no direct disk URLs). */
  app.get('/api/files/:id/download', async (req, reply) => {
    const user = req.requireAuth();
    const { id } = req.params as { id: string };
    const disposition = (req.query as { inline?: string }).inline === '1' ? 'inline' : 'attachment';
    const db = req.db;
    const [f] = await db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt))).limit(1);
    if (!f) throw notFound();
    if (f.visibility === 'public') {
      // published portfolio covers may be fetched publicly; still fine for authed users
    } else if (!canDownload(user, f.ownerType)) {
      throw forbidden('FILE_ACCESS_DENIED', 'You are not allowed to download this file');
    }
    const path = join(config.uploadDir, f.storedName);
    if (!existsSync(path)) throw notFound('FILE_MISSING', 'File not found on disk');
    void auditFromReq(req, db)('file.downloaded', { type: 'file', id }, { ownerType: f.ownerType, name: f.originalName });
    const safeName = f.originalName.replace(/["\\\r\n]/g, '_').slice(0, 120);
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Disposition', `${disposition}; filename="${safeName}"`);
    return reply.type(f.mimeType).send(createReadStream(path));
  });

  /** Helper used by settings: mark portfolio cover as public visibility. */
  app.post('/api/files/:id/publish-portfolio', async (req) => {
    req.requirePerm('portfolio.manage');
    const { id } = req.params as { id: string };
    const db = req.db;
    const used = await db.select({ id: portfolioProjects.id }).from(portfolioProjects).where(eq(portfolioProjects.coverFileId, id)).limit(1);
    if (!used.length) throw forbidden('NOT_A_PORTFOLIO_FILE', 'Only files referenced by portfolio items can be published');
    await db.update(files).set({ visibility: 'public' }).where(eq(files.id, id));
    void auditFromReq(req, db)('file.published', { type: 'file', id }, {});
    return { ok: true };
  });
}
