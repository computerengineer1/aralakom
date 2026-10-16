import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required') => new HttpError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to perform this action') => new HttpError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message = 'Record not found') => new HttpError(404, code, message);
export const conflict = (code: string, message: string, details?: unknown) => new HttpError(409, code, message, details);

/** Unwrap Drizzle/postgres.js error chains to detect unique-violations (23505). */
export function isUniqueViolation(err: unknown, constraintHint?: string): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? e?.code;
  const msg = String(e?.cause?.message ?? e?.message ?? '');
  if (code !== '23505') return false;
  return constraintHint ? msg.includes(constraintHint) : true;
}

export function parseWith<T extends ZodType>(schema: T, data: unknown, label = 'body'): T extends ZodType<infer O> ? O : never {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
    throw badRequest('VALIDATION_ERROR', `Invalid ${label}`, details);
  }
  return result.data as T extends ZodType<infer O> ? O : never;
}

/** Wrap async route handlers so rejections reach Fastify's error handler. */
export function ah<T extends (...args: never[]) => Promise<unknown>>(fn: T): T {
  return fn;
}
