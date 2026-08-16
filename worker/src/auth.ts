import { getSetting, putSetting, type Row } from './db';
import { ApiError, json, readJson } from './http';
import {
  clearSessionCookie,
  createSessionCookie,
  hasAuthConfig,
  hasValidSession,
  isSameOrigin,
  requireEncryptionSecret,
  timingSafeMatches,
  encryptSecret,
} from './security';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function envString(env: Env, name: string): string | undefined {
  const value = Reflect.get(env, name);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function noStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Vary': 'Cookie',
  };
}

function loginClientKey(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

async function loginRateLimit(request: Request, db: D1Database): Promise<number> {
  const now = Date.now();
  let entry: { window_started: number; attempts: number } | null;
  try {
    entry = await db.prepare('SELECT window_started, attempts FROM login_rate_limits WHERE client_key = ?1')
      .bind(loginClientKey(request)).first<{ window_started: number; attempts: number }>();
  } catch (error) {
    if (isMissingLoginRateLimitTable(error)) {
      console.warn('login_rate_limits migration is not applied; continuing without login throttling');
      return 0;
    }
    throw error;
  }
  if (!entry || now - Number(entry.window_started) >= LOGIN_WINDOW_MS || Number(entry.attempts) < LOGIN_MAX_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((Number(entry.window_started) + LOGIN_WINDOW_MS - now) / 1000));
}

function isMissingLoginRateLimitTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*login_rate_limits/i.test(message);
}

async function recordLoginFailure(request: Request, db: D1Database): Promise<void> {
  const now = Date.now();
  try {
    await db.prepare(`INSERT INTO login_rate_limits (client_key, window_started, attempts)
      VALUES (?1, ?2, 1)
      ON CONFLICT(client_key) DO UPDATE SET
        window_started = CASE WHEN ?2 - window_started >= ?3 THEN ?2 ELSE window_started END,
        attempts = CASE WHEN ?2 - window_started >= ?3 THEN 1 ELSE attempts + 1 END`)
      .bind(loginClientKey(request), now, LOGIN_WINDOW_MS).run();
  } catch (error) {
    if (isMissingLoginRateLimitTable(error)) return;
    throw error;
  }
}

async function clearLoginFailures(request: Request, db: D1Database): Promise<void> {
  try {
    await db.prepare('DELETE FROM login_rate_limits WHERE client_key = ?1').bind(loginClientKey(request)).run();
  } catch (error) {
    if (isMissingLoginRateLimitTable(error)) return;
    throw error;
  }
}

async function hasStoredGitHubToken(db: D1Database): Promise<boolean> {
  return Boolean(await getSetting(db, 'github_token'));
}

async function sessionStatus(request: Request, env: Env, db: D1Database): Promise<Response> {
  const authenticated = await hasValidSession(request, env);
  let githubConfigured = false;
  if (authenticated) {
    try {
      githubConfigured = await hasStoredGitHubToken(db);
    } catch {
      // D1 migrations may not have been applied yet. Keep the login surface
      // available so the user can see the migration error after authentication.
    }
  }
  return json({ status: 'ok', authenticated, githubConfigured }, 200, noStoreHeaders());
}

async function login(request: Request, env: Env, db: D1Database): Promise<Response> {
  if (!isSameOrigin(request)) throw new ApiError(403, 'INVALID_ORIGIN', 'Login requests must come from the same origin');
  if (!hasAuthConfig(env)) {
    throw new ApiError(503, 'AUTH_CONFIG_REQUIRED', 'ADMIN_USER and ADMIN_PASSWORD must be configured');
  }

  const retryAfter = await loginRateLimit(request, db);
  if (retryAfter) {
    throw new ApiError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts; try again later', { retryAfter });
  }

  const body = await readJson<Row>(request);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const expectedUsername = envString(env, 'ADMIN_USER')?.trim() ?? '';
  const expectedPassword = envString(env, 'ADMIN_PASSWORD') ?? '';

  const valid = await Promise.all([
    timingSafeMatches(username, expectedUsername),
    timingSafeMatches(password, expectedPassword),
  ]);
  if (!username || !password || !valid[0] || !valid[1]) {
    await recordLoginFailure(request, db);
    throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  await clearLoginFailures(request, db);
  const sessionCookie = await createSessionCookie(username, env);
  let githubConfigured = false;
  try {
    githubConfigured = await hasStoredGitHubToken(db);
  } catch {
    // The token setup step will return a precise D1 error if migrations are missing.
  }
  return json({ authenticated: true, githubConfigured }, 200, {
    ...noStoreHeaders(),
    'Set-Cookie': sessionCookie,
  });
}

async function logout(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) throw new ApiError(403, 'INVALID_ORIGIN', 'Logout requests must come from the same origin');
  return json({ authenticated: false }, 200, {
    ...noStoreHeaders(),
    'Set-Cookie': clearSessionCookie(),
  });
}

async function configureGitHubToken(
  request: Request,
  env: Env,
  db: D1Database,
  encryptionSecret: string | undefined,
): Promise<Response> {
  if (!isSameOrigin(request)) throw new ApiError(403, 'INVALID_ORIGIN', 'Token requests must come from the same origin');
  if (!await hasValidSession(request, env)) throw new ApiError(401, 'UNAUTHORIZED', 'Login is required before configuring GitHub');

  const body = await readJson<Row>(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) throw new ApiError(422, 'GITHUB_TOKEN_REQUIRED', 'GitHub token is required');
  if (token.length > 1024) throw new ApiError(422, 'GITHUB_TOKEN_INVALID', 'GitHub token is too long');

  let upstream: Response;
  try {
    upstream = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Stars-Manager',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    throw new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub is temporarily unavailable');
  }

  if (upstream.status === 401 || upstream.status === 403) {
    throw new ApiError(422, 'GITHUB_TOKEN_INVALID', 'GitHub token is invalid or does not have the required access');
  }
  if (!upstream.ok) {
    throw new ApiError(502, 'GITHUB_UNAVAILABLE', 'GitHub could not validate the token');
  }

  // Validate the token before writing it. The value itself never leaves this
  // Worker again and is stored encrypted in the existing D1 settings row.
  await putSetting(db, 'github_token', await encryptSecret(token, requireEncryptionSecret(encryptionSecret)));
  return json({ configured: true }, 200, noStoreHeaders());
}

export async function handleAuthRoute(
  request: Request,
  env: Env,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  if (url.pathname === '/api/auth/session') {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Session status requires GET');
    return sessionStatus(request, env, db);
  }
  if (url.pathname === '/api/auth/login') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Login requires POST');
    return login(request, env, db);
  }
  if (url.pathname === '/api/auth/logout') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Logout requires POST');
    return logout(request);
  }
  if (url.pathname === '/api/auth/github-token') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'GitHub token configuration requires POST');
    return configureGitHubToken(request, env, db, encryptionSecret);
  }
  return null;
}
