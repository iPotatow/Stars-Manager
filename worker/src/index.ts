import { handleApiRoute } from './api';
import { handleAuthRoute } from './auth';
import { handleConfigRoute } from './configs';
import { ApiError, empty, errorResponse, json } from './http';
import { handleMcpRoute } from './mcp';
import { handleProxyRoute } from './proxy';
import { hasAuthConfig, hasValidSession, isSameOrigin, isStateChangingMethod } from './security';
import { handleVectorRoute } from './vector';

const VERSION = '0.7.3-cf';

function stringBinding(env: Env, name: 'ADMIN_PASSWORD' | 'ENCRYPTION_KEY'): string | undefined {
  const value = Reflect.get(env, name);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function encryptionSecret(env: Env): string | undefined {
  return stringBinding(env, 'ENCRYPTION_KEY') ?? stringBinding(env, 'ADMIN_PASSWORD');
}

async function authenticateApi(request: Request, env: Env): Promise<void> {
  if (!await hasValidSession(request, env)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Login is required before using the Worker API');
  }
}

async function health(db: D1Database, env: Env): Promise<Response> {
  const table = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repositories'").first<{ name: string }>();
  if (!table) {
    return json({
      status: 'error',
      version: VERSION,
      timestamp: new Date().toISOString(),
      code: 'D1_MIGRATIONS_REQUIRED',
      message: 'Apply D1 migrations before using the Worker API.',
    }, 503);
  }
  return json({
    status: 'ok',
    version: VERSION,
    runtime: 'cloudflare-workers-d1',
    timestamp: new Date().toISOString(),
    authConfigured: hasAuthConfig(env),
    encryptionConfigured: Boolean(encryptionSecret(env)),
    vectorizeConfigured: Boolean(env.VECTORIZE),
  });
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return empty();
  if (url.pathname.startsWith('/api/') && isStateChangingMethod(request.method) && !isSameOrigin(request)) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'State-changing API requests must come from the same origin');
  }
  const secret = encryptionSecret(env);
  const authResponse = await handleAuthRoute(request, env, env.DB, url, secret);
  if (authResponse) return authResponse;

  if (url.pathname === '/api/health' && request.method === 'GET') {
    await authenticateApi(request, env);
    return health(env.DB, env);
  }

  if (url.pathname.startsWith('/api/')) await authenticateApi(request, env);

  const handlers = [
    () => handleMcpRoute(request, env.DB, url, secret),
    () => handleVectorRoute(request, env.VECTORIZE, url),
    () => handleConfigRoute(request, env.DB, url, secret),
    () => handleProxyRoute(request, env.DB, url, secret),
    () => handleApiRoute(request, env.DB, url),
  ];
  for (const handler of handlers) {
    const response = await handler();
    if (response) return response;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) {
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found');
  }
  return json({ error: 'Not Found', code: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await dispatch(request, env);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      const message = error instanceof Error ? error.message : String(error);
      const entry = { module: 'worker.request', status, code, message };
      if (status >= 500) {
        console.error(JSON.stringify({ level: 'error', ...entry }));
      } else {
        console.warn(JSON.stringify({ level: 'warn', ...entry }));
      }
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
