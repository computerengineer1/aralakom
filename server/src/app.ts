import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './lib/http.js';
import { authPlugin } from './plugins/auth.js';
import { registerAuthRoutes } from './modules/auth.js';
import { registerSettingsRoutes } from './modules/settings.js';
import { registerUserRoutes } from './modules/users.js';
import { registerPersonnelRoutes } from './modules/personnel.js';
import { registerApplicationRoutes } from './modules/applications.js';
import { registerRequestRoutes } from './modules/requests.js';
import { registerProjectRoutes } from './modules/projects.js';
import { registerSchedulingRoutes } from './modules/scheduling.js';
import { registerFinanceRoutes } from './modules/finance.js';
import { registerDashboardRoutes } from './modules/dashboard.js';
import { registerReportRoutes } from './modules/reports.js';
import { registerNotificationRoutes } from './modules/notifications.js';
import { registerAuditRoutes } from './modules/audit.js';
import { registerFileRoutes } from './modules/files.js';

export interface BuildOptions {
  logger?: boolean | object;
  serveWeb?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.logLevel },
    trustProxy: config.trustProxy,
    genReqId: () => globalThis.crypto.randomUUID(),
    bodyLimit: 2 * 1024 * 1024, // 2MB JSON bodies
    disableRequestLogging: config.isProd,
  });

  // ---- security headers / CSP
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await app.register(cookie);

  // ---- CORS: strict allowlist; credentials only for configured origins.
  if (config.corsOrigins.length > 0) {
    app.addHook('onRequest', (req, reply, done) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
        reply.header('Access-Control-Max-Age', '600');
        reply.status(204).send();
        return;
      }
      done();
    });
  }

  // ---- rate limiting (in-memory; use Redis store for multi-instance production)
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/api/health',
  });

  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 6, fields: 40 },
    attachFieldsToBody: false,
  });

  await app.register(authPlugin);

  // Reject malformed UUID path params early (prevents 500s from invalid ids).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api')) return;
    for (const [key, value] of Object.entries(req.params as Record<string, string> ?? {})) {
      if ((key === 'id' || key.endsWith('Id')) && typeof value === 'string' && !UUID_RE.test(value)) {
        throw new HttpError(400, 'INVALID_ID', `Invalid identifier: ${key}`);
      }
    }
  });

  // ---- centralized error handling: safe messages, no stack traces in prod
  app.setErrorHandler((rawError, req, reply) => {
    const error = rawError as Error & { statusCode?: number; validation?: unknown };
    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }
    if (error.validation) {
      void reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' } });
      return;
    }
    if (error.statusCode === 413) {
      void reply.status(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
      return;
    }
    if (error.statusCode === 429) {
      void reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
      return;
    }
    req.log.error({ err: error, requestId: req.id }, 'Unhandled error');
    void reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: config.isProd ? 'An internal error occurred' : error.message,
        requestId: req.id,
      },
    });
  });


  // ---- health check
  app.get('/api/health', async () => {
    const { getSql } = await import('./db/index.js');
    let db = 'unknown';
    try {
      await getSql()`select 1`;
      db = 'ok';
    } catch {
      db = 'unavailable';
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) };
  });

  // ---- API modules
  registerAuthRoutes(app);
  registerSettingsRoutes(app);
  registerUserRoutes(app);
  registerPersonnelRoutes(app);
  registerApplicationRoutes(app);
  registerRequestRoutes(app);
  registerProjectRoutes(app);
  registerSchedulingRoutes(app);
  registerFinanceRoutes(app);
  registerDashboardRoutes(app);
  registerReportRoutes(app);
  registerNotificationRoutes(app);
  registerAuditRoutes(app);
  registerFileRoutes(app);

  // ---- static web app (production mode) + SPA fallback / API 404
  const webDist = path.resolve(process.cwd(), config.webDist);
  const hasWeb = opts.serveWeb !== false && existsSync(path.join(webDist, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: ['index.html'] });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      void reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
      return;
    }
    if (hasWeb) {
      void reply.type('text/html').sendFile('index.html');
      return;
    }
    void reply.status(404).send('Not found');
  });

  return app;
}


