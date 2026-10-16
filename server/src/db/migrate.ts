/**
 * Migration runner: applies all generated SQL migrations in order inside a
 * transaction, tracked in the `__drizzle_migrations` table (drizzle migrator).
 */
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './index.js';

async function main() {
  const db = getDb();
  console.log('Running migrations...');
  const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied successfully.');
  await closeDb();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await closeDb();
  process.exit(1);
});
