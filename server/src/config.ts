// Load .env from repo root if present (Node >= 20.12 built-in; no dependency).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  if (existsSync(candidate)) {
    try { process.loadEnvFile(candidate); } catch { /* ignore malformed optional file */ }
    break;
  }
}

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: int('PORT', 8080),
  logLevel: env('LOG_LEVEL', 'info'),
  trustProxy: bool('TRUST_PROXY', false),
  appBaseUrl: env('APP_BASE_URL', 'http://localhost:8080'),
  databaseUrl: env('DATABASE_URL', 'postgres://lcmp:lcmp_dev_password_change_me@127.0.0.1:5432/lcmp'),
  sessionSecret: env('SESSION_SECRET', ''),
  cookieSecure: bool('COOKIE_SECURE', false),
  cookieSameSite: (env('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict'),
  passwordResetTtlMinutes: int('PASSWORD_RESET_TTL_MINUTES', 30),
  sessionTtlHours: int('SESSION_TTL_HOURS', 12),
  ownerSetupToken: process.env.OWNER_SETUP_TOKEN ?? '',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: env('MAIL_FROM', 'Lebanon Contracting <no-reply@example.com>'),
  },
  uploadDir: env('UPLOAD_DIR', './data/uploads'),
  maxUploadMb: int('MAX_UPLOAD_MB', 10),
  webDist: env('WEB_DIST', '../web/dist'),
  allowDemoSeed: bool('ALLOW_DEMO_SEED', false),
};

if (config.isProd) {
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production');
  }
  if (!config.cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (config.databaseUrl.includes('CHANGE_ME')) {
    throw new Error('DATABASE_URL contains placeholder credentials; refusing to start in production');
  }
}
