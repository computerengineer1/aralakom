import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { config } from '../config.js';

export type Db = PostgresJsDatabase<typeof schema>;

let _sql: postgres.Sql | undefined;
let _db: Db | undefined;

export function getSql(url?: string): postgres.Sql {
  if (url) return postgres(url, { max: 5 });
  if (!_sql) {
    _sql = postgres(config.databaseUrl, { max: 10, idle_timeout: 20 });
  }
  return _sql;
}

export function getDb(url?: string): Db {
  if (url) return drizzle(getSql(url), { schema });
  if (!_db) _db = drizzle(getSql(), { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_sql) await _sql.end({ timeout: 5 });
  _sql = undefined;
  _db = undefined;
}
