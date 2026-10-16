/**
 * Global test setup: applies migrations to the isolated lcmp_test database and
 * seeds deterministic demo data. Runs once before all test files.
 */
import { execSync } from 'node:child_process';
import postgres from 'postgres';

const ENV = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://lcmp:lcmp_dev_password_change_me@127.0.0.1:5432/lcmp_test',
  ALLOW_DEMO_SEED: 'true',
  DEMO_OWNER_PASSWORD: 'Demo!Owner123',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
  UPLOAD_DIR: './data/test-uploads',
  LOG_LEVEL: 'error',
};

export async function setup(): Promise<void> {
  const dbUrl = ENV.DATABASE_URL;
  const sql = postgres(dbUrl, { connect_timeout: 2, max: 1 });
  try {
    await sql`SELECT 1`;
    await sql.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
    await sql.end({ timeout: 1 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[test setup] PostgreSQL not reachable at ${dbUrl} (${msg}). Integration tests will be skipped.`);
    process.env.LCMP_TEST_DB_UNAVAILABLE = 'true';
    try { await sql.end({ timeout: 1 }); } catch { /* ignore */ }
    return;
  }

  // Reset the test database schema completely (safe: lcmp_test only).
  execSync('npx tsx src/db/migrate.ts', { env: ENV, stdio: 'pipe' });
  execSync('npx tsx src/seed.ts', { env: ENV, stdio: 'pipe' });
}

export async function teardown(): Promise<void> {
  // nothing to clean up; lcmp_test is disposable
}
