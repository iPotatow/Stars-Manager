import { ApiError } from './http';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = 'stars_manager_session';
const SESSION_TTL_SECONDS = 24 * 60 * 60;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
}

function encodeBase64Url(value: string): string {
  return toBase64Url(encoder.encode(value));
}

function decodeBase64Url(value: string): string {
  try {
    return decoder.decode(fromBase64Url(value));
  } catch {
    return '';
  }
}

function readCookie(header: string | null, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function envString(env: unknown, name: string): string | undefined {
  if (!env || (typeof env !== 'object' && typeof env !== 'function')) return undefined;
  const value = Reflect.get(env, name);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function sessionKey(env: unknown): Promise<CryptoKey | null> {
  const secret = envString(env, 'ADMIN_SESSION_SECRET') ?? envString(env, 'ADMIN_PASSWORD');
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function fromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

async function keyBytes(secret: string): Promise<Uint8Array> {
  const normalized = secret.trim();
  if (/^[0-9a-f]{64}$/i.test(normalized)) return fromHex(normalized);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(normalized)));
}

async function encryptionKey(secret: string, usages: Array<'encrypt' | 'decrypt'>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await keyBytes(secret), { name: 'AES-GCM' }, false, usages);
}

export function requireEncryptionSecret(value: string | undefined): string {
  if (!value?.trim()) {
    throw new ApiError(
      503,
      'ENCRYPTION_KEY_REQUIRED',
      'ENCRYPTION_KEY or ADMIN_PASSWORD must be configured before secrets can be stored or read',
    );
  }
  return value;
}

export function isSameOrigin(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin) return origin === requestUrl.origin;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function hasAuthConfig(env: unknown): boolean {
  const username = envString(env, 'ADMIN_USER');
  const password = envString(env, 'ADMIN_PASSWORD');
  return Boolean(username?.trim() && password);
}

export async function createSessionCookie(username: string, env: unknown): Promise<string> {
  const key = await sessionKey(env);
  if (!key) {
    throw new ApiError(503, 'AUTH_CONFIG_REQUIRED', 'ADMIN_PASSWORD must be configured before login');
  }

  const payload = encodeBase64Url(JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const token = `${payload}.${toBase64Url(new Uint8Array(signature))}`;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function hasValidSession(request: Request, env: unknown): Promise<boolean> {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return false;

  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return false;

  const decoded = decodeBase64Url(payload);
  if (!decoded) return false;

  let session: { sub?: unknown; exp?: unknown };
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return false;
    session = parsed as { sub?: unknown; exp?: unknown };
  } catch {
    return false;
  }

  const configuredUser = envString(env, 'ADMIN_USER')?.trim();
  if (!configuredUser || typeof session.sub !== 'string' || !await timingSafeMatches(session.sub, configuredUser)) {
    return false;
  }
  if (typeof session.exp !== 'number' || !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const key = await sessionKey(env);
  if (!key) return false;
  try {
    return await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(payload));
  } catch {
    return false;
  }
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedWithTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, await encryptionKey(secret, ['encrypt']), encoder.encode(plaintext)),
  );
  const ciphertext = encryptedWithTag.slice(0, -16);
  const tag = encryptedWithTag.slice(-16);
  return `${toBase64(iv)}:${toBase64(ciphertext)}:${toBase64(tag)}`;
}

export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const [ivValue, ciphertextValue, tagValue, ...rest] = payload.split(':');
  if (!ivValue || ciphertextValue === undefined || !tagValue || rest.length > 0) {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = fromBase64(ivValue);
  const ciphertext = fromBase64(ciphertextValue);
  const tag = fromBase64(tagValue);
  const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
  encryptedWithTag.set(ciphertext, 0);
  encryptedWithTag.set(tag, ciphertext.length);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    await encryptionKey(secret, ['decrypt']),
    encryptedWithTag,
  );
  return decoder.decode(decrypted);
}

export async function timingSafeMatches(actual: string, expected: string): Promise<boolean> {
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(actualDigest, expectedDigest);
}

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `***${value.slice(-4)}`;
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.replace(/^Bearer\s+/i, '').trim();
}
