export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
  });
  if (headers) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function text(body: string, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    ...SECURITY_HEADERS,
  });
  if (headers) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(body, { status, headers: responseHeaders });
}

export function empty(status = 204, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(SECURITY_HEADERS);
  if (headers) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(null, { status, headers: responseHeaders });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: error.message, code: error.code, ...error.details }, error.status);
  }
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: 'Internal server error', code: 'INTERNAL_ERROR', detail: message }, 500);
}

export async function readJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 10 MB limit');
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

export function integerParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function requireMethod(request: Request, allowed: string[]): void {
  if (!allowed.includes(request.method)) {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', `Method ${request.method} is not allowed`);
  }
}

export function relayHeaders(upstream: Response): Headers {
  const headers = new Headers(SECURITY_HEADERS);
  const allowed = new Set([
    'content-type',
    'etag',
    'last-modified',
    'retry-after',
    'retry-after-ms',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'anthropic-ratelimit-requests-remaining',
    'anthropic-ratelimit-requests-reset',
  ]);
  upstream.headers.forEach((value, key) => {
    if (allowed.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

export function upstreamResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: relayHeaders(upstream),
  });
}

export function matchPath(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  return pathname.match(pattern);
}
