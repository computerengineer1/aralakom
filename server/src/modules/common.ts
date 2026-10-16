/** Shared helpers for API modules. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/http.js';

export const LEBANON_GOVERNORATES = [
  'Beirut', 'Mount Lebanon', 'North', 'Akkar', 'Baalbek-Hermel', 'Beqaa', 'South', 'Nabatieh',
] as const;

export const GOVERNORATES_AR: Record<string, string> = {
  'Beirut': 'بيروت',
  'Mount Lebanon': 'جبل لبنان',
  'North': 'الشمال',
  'Akkar': 'عكار',
  'Baalbek-Hermel': 'بعلبك الهرمل',
  'Beqaa': 'البقاع',
  'South': 'الجنوب',
  'Nabatieh': 'النبطية',
};

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export function parsePagination(req: FastifyRequest): z.infer<typeof paginationSchema> {
  const result = paginationSchema.safeParse(req.query);
  if (!result.success) throw badRequest('VALIDATION_ERROR', 'Invalid pagination parameters');
  return result.data;
}

export function paginate<T>(rows: T[], page: number, pageSize: number, total: number) {
  return { items: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const phoneSchema = z.string().trim().min(7).max(30).regex(/^[+0-9 ()-]+$/, 'Invalid phone number');
export const optionalEmail = z.union([z.literal(''), z.null(), z.string().trim().email().max(320)]).optional().transform((v) => (v ? v : null));
export const nameSchema = z.string().trim().min(2).max(200);

/** Honeypot field used on public forms: bots fill it, humans never see it. */
export const honeypotSchema = z.string().max(500).optional();

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
