/**
 * Document reference generation.
 *
 * Counters live in the `doc_counters` table and are advanced with
 * SELECT ... FOR UPDATE inside the caller's transaction, guaranteeing unique,
 * gapless-per-year references under concurrency.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { docCounters } from '../db/schema.js';

export interface RefOptions {
  prefix: string;      // e.g. 'PRJ', 'APP', 'REQ'
  yearScoped?: boolean; // include current year: PRJ-2026-0001
  width?: number;      // zero padding width (default 4; 6 for public refs)
}

export async function nextReference(db: Db, opts: RefOptions): Promise<string> {
  const { prefix, yearScoped = true, width = 4 } = opts;
  const year = new Date().getFullYear();
  const key = yearScoped ? `${prefix}-${year}` : prefix;
  const rows = await db.execute(
    sql`INSERT INTO doc_counters (key, last_value) VALUES (${key}, 0)
        ON CONFLICT (key) DO UPDATE SET last_value = doc_counters.last_value + 1
        RETURNING last_value`,
  ) as unknown as Array<{ last_value: number }>;
  // The ON CONFLICT path increments; the fresh-insert path returns 0 — normalize:
  let value = Number(rows[0]?.last_value ?? 0);
  if (value === 0) {
    const upd = await db.execute(
      sql`UPDATE doc_counters SET last_value = last_value + 1 WHERE key = ${key} RETURNING last_value`,
    ) as unknown as Array<{ last_value: number }>;
    value = Number(upd[0]?.last_value ?? 1);
  }
  const num = String(value).padStart(width, '0');
  return yearScoped ? `${prefix}-${year}-${num}` : `${prefix}-${num}`;
}

export { docCounters };
