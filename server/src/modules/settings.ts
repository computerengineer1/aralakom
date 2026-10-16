import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { categories, services, portfolioProjects, exchangeRates } from '../db/schema.js';
import { getCompany, setSetting, getSetting, type CompanyProfile } from '../lib/settings.js';
import { parseWith, badRequest, notFound } from '../lib/http.js';
import { auditFromReq } from '../lib/audit.js';
import { smtpConfigured } from '../lib/notify.js';

const companySchema = z.object({
  nameEn: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  taglineEn: z.string().max(300).default(''),
  taglineAr: z.string().max(300).default(''),
  aboutEn: z.string().max(5000).default(''),
  aboutAr: z.string().max(5000).default(''),
  phone: z.string().max(40).default(''),
  whatsapp: z.string().max(40).default(''),
  email: z.union([z.literal(''), z.string().email()]).default(''),
  addressEn: z.string().max(300).default(''),
  addressAr: z.string().max(300).default(''),
  workingHoursEn: z.string().max(200).default(''),
  workingHoursAr: z.string().max(200).default(''),
  mapUrl: z.union([z.literal(''), z.string().url()]).default(''),
  defaultLocale: z.enum(['ar', 'en']).default('ar'),
  primaryCurrency: z.enum(['LBP', 'USD']).default('USD'),
  logoFileId: z.union([z.literal(''), z.string().uuid()]).nullable().default('').transform((v) => v || null),
  legalEntityEn: z.string().max(300).default(''),
  legalEntityAr: z.string().max(300).default(''),
  taxId: z.string().max(60).default(''),
  invoiceFooterEn: z.string().max(1000).default(''),
  invoiceFooterAr: z.string().max(1000).default(''),
});

const categorySchema = z.object({
  kind: z.enum(['trade', 'engineering', 'request', 'other']),
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/),
  nameEn: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionAr: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export function registerSettingsRoutes(app: FastifyInstance): void {
  /** Public: everything the website needs (company branding, services, categories). */
  app.get('/api/settings/public', async (req) => {
    const db = req.db;
    const company = await getCompany(db);
    const [svc, trades, engs, reqs] = await Promise.all([
      db.select().from(services).where(eq(services.published, true)).orderBy(asc(services.sortOrder)),
      db.select().from(categories).where(and(eq(categories.kind, 'trade'), eq(categories.active, true))).orderBy(asc(categories.sortOrder)),
      db.select().from(categories).where(and(eq(categories.kind, 'engineering'), eq(categories.active, true))).orderBy(asc(categories.sortOrder)),
      db.select().from(categories).where(and(eq(categories.kind, 'request'), eq(categories.active, true))).orderBy(asc(categories.sortOrder)),
    ]);
    return { company, services: svc, tradeCategories: trades, engineeringCategories: engs, requestCategories: reqs };
  });

  /** Public: approved portfolio projects only. */
  app.get('/api/settings/portfolio', async (req) => {
    const rows = await req.db.select({
      id: portfolioProjects.id, titleEn: portfolioProjects.titleEn, titleAr: portfolioProjects.titleAr,
      descriptionEn: portfolioProjects.descriptionEn, descriptionAr: portfolioProjects.descriptionAr,
      category: portfolioProjects.category, location: portfolioProjects.location,
      completedYear: portfolioProjects.completedYear, coverFileId: portfolioProjects.coverFileId,
    }).from(portfolioProjects).where(eq(portfolioProjects.published, true)).orderBy(asc(portfolioProjects.sortOrder));
    return { items: rows };
  });

  // ---------------- admin ----------------

  app.get('/api/settings/company', async (req) => {
    req.requirePerm('settings.read');
    return { company: await getCompany(req.db) };
  });

  app.put('/api/settings/company', async (req) => {
    const user = req.requirePerm('settings.write');
    req.requireRecentAuth(30);
    const body = parseWith(companySchema, req.body) as CompanyProfile;
    await setSetting(req.db, 'company', body, user.id);
    void auditFromReq(req, req.db)('settings.company_updated', { type: 'settings', id: 'company' });
    return { ok: true };
  });

  app.get('/api/settings/categories', async (req) => {
    req.requirePerm('settings.read');
    const kind = (req.query as { kind?: string }).kind;
    const q = kind ? eq(categories.kind, kind as 'trade') : undefined;
    const rows = await req.db.select().from(categories).where(q).orderBy(asc(categories.kind), asc(categories.sortOrder));
    return { items: rows };
  });

  app.post('/api/settings/categories', async (req) => {
    req.requirePerm('settings.write');
    const body = parseWith(categorySchema, req.body);
    const existing = await req.db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.kind, body.kind), eq(categories.code, body.code))).limit(1);
    if (existing[0]) throw badRequest('DUPLICATE_CATEGORY', `Category code '${body.code}' already exists for kind '${body.kind}'`);
    const [row] = await req.db.insert(categories).values(body).returning();
    void auditFromReq(req, req.db)('settings.category_created', { type: 'category', id: row!.id }, { code: row!.code, kind: row!.kind });
    return row;
  });

  app.patch('/api/settings/categories/:id', async (req) => {
    req.requirePerm('settings.write');
    const body = parseWith(categorySchema.partial(), req.body);
    const { id } = req.params as { id: string };
    const [row] = await req.db.update(categories).set({ ...body }).where(eq(categories.id, id)).returning();
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('settings.category_updated', { type: 'category', id }, body);
    return row;
  });

  // ---------------- services (public content) ----------------

  app.get('/api/settings/services', async (req) => {
    req.requirePerm('settings.read');
    const rows = await req.db.select().from(services).orderBy(asc(services.sortOrder));
    return { items: rows };
  });

  const serviceSchema = z.object({
    slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
    titleEn: z.string().trim().min(2).max(200),
    titleAr: z.string().trim().min(2).max(200),
    summaryEn: z.string().max(1000).optional().nullable(),
    summaryAr: z.string().max(1000).optional().nullable(),
    bodyEn: z.string().max(10000).optional().nullable(),
    bodyAr: z.string().max(10000).optional().nullable(),
    iconKey: z.string().max(60).default('tools'),
    published: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  });

  app.post('/api/settings/services', async (req) => {
    req.requirePerm('settings.write');
    const body = parseWith(serviceSchema, req.body);
    const [row] = await req.db.insert(services).values(body).returning();
    void auditFromReq(req, req.db)('settings.service_created', { type: 'service', id: row!.id });
    return row;
  });

  app.patch('/api/settings/services/:id', async (req) => {
    req.requirePerm('settings.write');
    const { id } = req.params as { id: string };
    const body = parseWith(serviceSchema.partial(), req.body);
    const [row] = await req.db.update(services).set({ ...body, updatedAt: new Date() }).where(eq(services.id, id)).returning();
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('settings.service_updated', { type: 'service', id });
    return row;
  });

  // ---------------- portfolio management ----------------

  app.get('/api/settings/portfolio/manage', async (req) => {
    req.requirePerm('portfolio.manage');
    const rows = await req.db.select().from(portfolioProjects).orderBy(asc(portfolioProjects.sortOrder));
    return { items: rows };
  });

  const portfolioSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    titleEn: z.string().trim().min(2).max(200),
    titleAr: z.string().trim().min(2).max(200),
    descriptionEn: z.string().max(3000).optional().nullable(),
    descriptionAr: z.string().max(3000).optional().nullable(),
    category: z.string().max(120).optional().nullable(),
    location: z.string().max(200).optional().nullable(),
    completedYear: z.number().int().min(1950).max(2100).optional().nullable(),
    coverFileId: z.string().uuid().optional().nullable(),
    published: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  });

  app.post('/api/settings/portfolio', async (req) => {
    req.requirePerm('portfolio.manage');
    const body = parseWith(portfolioSchema, req.body);
    const [row] = await req.db.insert(portfolioProjects).values(body).returning();
    void auditFromReq(req, req.db)('portfolio.created', { type: 'portfolio', id: row!.id });
    return row;
  });

  app.patch('/api/settings/portfolio/:id', async (req) => {
    req.requirePerm('portfolio.manage');
    const { id } = req.params as { id: string };
    const body = parseWith(portfolioSchema.partial(), req.body);
    const [row] = await req.db.update(portfolioProjects).set({ ...body, updatedAt: new Date() }).where(eq(portfolioProjects.id, id)).returning();
    if (!row) throw notFound();
    void auditFromReq(req, req.db)('portfolio.updated', { type: 'portfolio', id });
    return row;
  });

  /** Upload a portfolio cover image (stored as public-visibility file). */
  app.post('/api/settings/portfolio-upload', async (req) => {
    const actor = req.requirePerm('portfolio.manage');
    const part = await req.file();
    if (!part) throw badRequest('FILE_REQUIRED', 'No file uploaded');
    const { storeUpload, FileValidationError } = await import('../lib/files.js');
    try {
      const stored = await storeUpload(req.db, part, { type: 'portfolio' }, actor.id, 'public');
      void auditFromReq(req, req.db)('portfolio.file_uploaded', { type: 'file', id: stored.id }, { name: stored.originalName });
      return stored;
    } catch (err) {
      if (err instanceof FileValidationError) throw badRequest('FILE_REJECTED', err.message);
      throw err;
    }
  });

  // ---------------- exchange rates ----------------

  app.get('/api/settings/rates', async (req) => {
    req.requireAuth();
    const rows = await req.db.select().from(exchangeRates).orderBy(asc(exchangeRates.rateDate)).limit(200);
    const policy = await getSetting(req.db, 'rates.policy', { enabled: false, note: 'Manual entry only; no external provider configured.' });
    return { items: rows.reverse(), policy };
  });

  app.post('/api/settings/rates', async (req) => {
    const user = req.requirePerm('rates.manage');
    const body = parseWith(z.object({
      fromCurrency: z.enum(['LBP', 'USD']),
      toCurrency: z.enum(['LBP', 'USD']),
      rate: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/),
      rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      source: z.string().trim().min(2).max(120),
    }), req.body);
    if (body.fromCurrency === body.toCurrency) throw badRequest('SAME_CURRENCY', 'From and to currencies must differ');
    if (Number(body.rate) <= 0) throw badRequest('INVALID_RATE', 'Rate must be positive');
    const [row] = await req.db.insert(exchangeRates).values({ ...body, enteredBy: user.id }).returning();
    void auditFromReq(req, req.db)('rates.created', { type: 'exchange_rate', id: row!.id }, body);
    return row;
  });

  /** Admin-only operational health summary. */
  app.get('/api/settings/health-info', async (req) => {
    req.requirePerm('settings.read');
    let dbOk = false;
    try {
      await req.db.execute(sql`select 1`);
      dbOk = true;
    } catch { dbOk = false; }
    const company = await getCompany(req.db);
    return {
      db: dbOk ? 'ok' : 'unavailable',
      env: process.env.NODE_ENV ?? 'development',
      smtpConfigured: smtpConfigured(),
      defaultLocale: company.defaultLocale,
      primaryCurrency: company.primaryCurrency,
      uploadDirConfigured: Boolean(process.env.UPLOAD_DIR) || true,
    };
  });
}
