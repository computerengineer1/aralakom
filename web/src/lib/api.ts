/**
 * API client.
 * - Credentials (session cookie) are sent on every request.
 * - CSRF: the HttpOnly cookie is paired with an X-CSRF-Token header; the token is
 *   fetched once (and re-fetched after login, which rotates it).
 * - Errors are normalized into ApiError with server codes and field details.
 * - No tokens are ever stored in localStorage — only the CSRF double-submit value
 *   (which is useless without the HttpOnly cookie).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'CSRF_FETCH_FAILED', 'Failed to initialize security token');
  const data = (await res.json()) as { token: string };
  csrfToken = data.token;
  return csrfToken;
}

export async function invalidateCsrf(): Promise<void> {
  csrfToken = null;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  raw?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = new URL(path, window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (opts.formData) {
    payload = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }
  if (method !== 'GET') {
    if (!csrfToken) await fetchCsrf();
    headers['X-CSRF-Token'] = csrfToken!;
  }

  let res: Response;
  try {
    res = await fetch(url.pathname + url.search, {
      method, headers, body: payload, credentials: 'include', signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }

  if (res.status === 403) {
    // Possibly a rotated CSRF token; refresh once and retry.
    const bodyText = await res.clone().text();
    if (bodyText.includes('CSRF_FAILED')) {
      await fetchCsrf();
      headers['X-CSRF-Token'] = csrfToken!;
      res = await fetch(url.pathname + url.search, { method, headers, body: payload, credentials: 'include', signal: opts.signal });
    } else {
      void bodyText;
    }
  }

  if (opts.raw) {
    if (!res.ok) throw await toApiError(res);
    return (await res.blob()) as T;
  }

  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw fromBody(res.status, data);
  }
  return data as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return fromBody(res.status, data);
}

function fromBody(status: number, data: unknown): ApiError {
  const d = data as { error?: { code?: string; message?: string; details?: Array<{ path: string; message: string }> } } | null;
  return new ApiError(status, d?.error?.code ?? 'HTTP_' + status, d?.error?.message ?? `Request failed (${status})`, d?.error?.details);
}

/** Refresh CSRF token (call after login/logout). */
export async function refreshCsrf(): Promise<void> {
  await fetchCsrf();
}
