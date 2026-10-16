/**
 * Migration runner: applies all generated SQL migrations in order inside a
 * transaction, tracked in the `__drizzle_migrations` table (drizzle migrator).
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './index.js';

async function main() {
  const db = getDb();
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
  console.log('Migrations applied successfully.');
  await closeDb();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await closeDb();
  process.exit(1);
});
