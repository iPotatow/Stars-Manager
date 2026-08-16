import { first, getSetting, type Row } from './db';
import { ApiError, json, readJson, upstreamResponse } from './http';
import { decryptSecret, requireEncryptionSecret } from './security';

type ProxyBody = Record<string, unknown>;

const GITHUB_RAW_HOSTS = new Set(['gist.githubusercontent.com', 'raw.githubusercontent.com']);
const FORBIDDEN_HEADERS = new Set(['authorization', 'proxy-authorization', 'host', 'content-length']);
const TRANSLATE_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const TRANSLATE_API_URL = 'https://api-edge.cognitive.microsofttranslator.com/translate';

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host.startsWith('::ffff:') && host.includes('.')) return isPrivateHostname(host.slice(7));
  const mapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const octets = [mapped[1], mapped[2]].flatMap((part) => {
      const value = Number.parseInt(part, 16);
      return [(value >>> 8) & 0xff, value & 0xff];
    });
    return isPrivateHostname(octets.join('.'));
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return host.startsWith('169.254.') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}

function validatedUrl(value: string, options: { requireHttps?: boolean; allowPrivate?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, 'INVALID_URL', 'Invalid upstream URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'INVALID_URL_PROTOCOL', 'Only HTTP and HTTPS upstream URLs are supported');
  }
  if (url.username || url.password) {
    throw new ApiError(400, 'INVALID_URL_CREDENTIALS', 'Upstream URL must not contain embedded credentials');
  }
  if (options.requireHttps && url.protocol !== 'https:') {
    throw new ApiError(400, 'HTTPS_REQUIRED', 'Cloudflare upstream URLs must use HTTPS');
  }
  if (!options.allowPrivate && isPrivateHostname(url.hostname)) {
    throw new ApiError(400, 'PRIVATE_NETWORK_NOT_ALLOWED', 'Private and loopback upstream addresses are not allowed');
  }
  return url;
}

async function fetchNoRedirect(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(502, 'UPSTREAM_REDIRECT_BLOCKED', 'Upstream redirects are not allowed');
  }
  return response;
}

function buildApiUrl(baseUrl: string, pathWithVersion: string): string {
  const base = validatedUrl(baseUrl, { allowPrivate: false });
  const normalizedBase = base.toString().endsWith('/') ? base.toString() : `${base.toString()}/`;
  const basePath = base.pathname.replace(/\/$/, '');
  if (/\/v\d+(?:beta|alpha)?$/i.test(basePath)) {
    const endpointPath = pathWithVersion.includes('/') ? pathWithVersion.split('/').slice(1).join('/') : pathWithVersion;
    return new URL(endpointPath, normalizedBase).toString();
  }
  return new URL(pathWithVersion, normalizedBase).toString();
}

function safeHeaders(input: unknown): Headers {
  const headers = new Headers();
  if (!input || typeof input !== 'object') return headers;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!FORBIDDEN_HEADERS.has(key.toLowerCase()) && typeof value === 'string') headers.set(key, value);
  }
  return headers;
}

async function storedGithubToken(db: D1Database, encryptionSecret: string | undefined): Promise<string> {
  const encrypted = await getSetting(db, 'github_token');
  if (!encrypted) throw new ApiError(400, 'GITHUB_TOKEN_NOT_CONFIGURED', 'GitHub token is not configured');
  try {
    return await decryptSecret(encrypted, requireEncryptionSecret(encryptionSecret));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'GITHUB_TOKEN_DECRYPT_FAILED', 'Failed to decrypt the stored GitHub token');
  }
}

async function githubFetch(request: Request, db: D1Database, url: URL, encryptionSecret: string | undefined): Promise<Response> {
  const path = url.pathname.slice('/api/proxy/github/'.length);
  if (!path || path.includes('..')) throw new ApiError(400, 'INVALID_GITHUB_PATH', 'Invalid GitHub API path');
  const body = await readJson<ProxyBody>(request);
  const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new ApiError(400, 'INVALID_PROXY_METHOD', 'Unsupported GitHub proxy method');
  }
  const token = await storedGithubToken(db, encryptionSecret);
  const headers = safeHeaders(body.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', headers.get('Accept') ?? 'application/vnd.github.v3+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  headers.set('User-Agent', 'StarsManager-Workers');
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'DELETE' && body.body !== undefined) {
    init.body = typeof body.body === 'string' ? body.body : JSON.stringify(body.body);
  }
  const upstream = await fetchNoRedirect(`https://api.github.com/${path}${url.search}`, init);
  return upstreamResponse(upstream);
}

async function githubRawFetch(request: Request, db: D1Database, encryptionSecret: string | undefined): Promise<Response> {
  const body = await readJson<ProxyBody>(request);
  if (typeof body.url !== 'string') throw new ApiError(400, 'MISSING_URL', 'url is required');
  const target = validatedUrl(body.url, { requireHttps: true });
  if (!GITHUB_RAW_HOSTS.has(target.hostname.toLowerCase())) {
    throw new ApiError(400, 'HOST_NOT_ALLOWED', `Host ${target.hostname} is not allowed`);
  }
  const headers = safeHeaders(body.headers);
  headers.set('Authorization', `Bearer ${await storedGithubToken(db, encryptionSecret)}`);
  headers.set('Accept', 'application/vnd.github.v3+json');
  headers.set('User-Agent', 'StarsManager-Workers');
  return upstreamResponse(await fetchNoRedirect(target, { method: 'GET', headers }));
}

function normalizedReasoning(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value === 'minimal' ? 'low' : value;
}

async function aiFetch(request: Request, db: D1Database, encryptionSecret: string | undefined): Promise<Response> {
  const payload = await readJson<ProxyBody>(request);
  const configId = typeof payload.configId === 'string' ? payload.configId : '';
  const requestBody = payload.body && typeof payload.body === 'object' ? payload.body as Row : {};
  if (!configId) throw new ApiError(400, 'CONFIG_ID_REQUIRED', 'configId is required');

  let apiType = 'openai';
  let baseUrl = '';
  let apiKey = '';
  let model = '';
  let reasoningEffort: string | null = null;

  const row = await first<Row>(db.prepare('SELECT * FROM ai_configs WHERE id = ?1').bind(configId));
  if (!row) throw new ApiError(404, 'AI_CONFIG_NOT_FOUND', 'AI config not found');
  apiType = String(row.api_type ?? 'openai');
  baseUrl = String(row.base_url ?? '');
  model = String(row.model ?? '');
  apiKey = await decryptSecret(String(row.api_key_encrypted ?? ''), requireEncryptionSecret(encryptionSecret));
  reasoningEffort = normalizedReasoning(row.reasoning_effort);
  validatedUrl(baseUrl, { allowPrivate: false, requireHttps: true });

  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
  let targetUrl: string;
  if (['openai', 'openai-responses', 'openai-compatible', 'deepseek', 'mimo'].includes(apiType)) {
    targetUrl = apiType === 'openai-compatible'
      ? validatedUrl(baseUrl, { requireHttps: true }).toString().replace(/\/$/, '')
      : buildApiUrl(baseUrl, apiType === 'openai-responses' ? 'v1/responses' : 'v1/chat/completions');
    headers.set('Authorization', `Bearer ${apiKey}`);
  } else if (apiType === 'claude') {
    targetUrl = buildApiUrl(baseUrl, 'v1/messages');
    headers.set('x-api-key', apiKey);
    headers.set('anthropic-version', '2023-06-01');
  } else {
    const modelName = model.trim().replace(/^models\//, '');
    const target = new URL(buildApiUrl(baseUrl, `v1beta/models/${encodeURIComponent(modelName)}:generateContent`));
    target.searchParams.set('key', apiKey);
    targetUrl = target.toString();
  }

  const canReason = reasoningEffort && model.trim() !== 'deepseek-reasoner' && !('reasoning' in requestBody)
    && ['openai', 'openai-responses', 'openai-compatible', 'deepseek', 'mimo'].includes(apiType);
  const outgoingBody = canReason ? { ...requestBody, reasoning: { effort: reasoningEffort } } : requestBody;
  return upstreamResponse(await fetchNoRedirect(targetUrl, { method: 'POST', headers, body: JSON.stringify(outgoingBody) }));
}

async function embeddingFetch(request: Request, db: D1Database, encryptionSecret: string | undefined): Promise<Response> {
  const payload = await readJson<ProxyBody>(request);
  const configId = typeof payload.configId === 'string' ? payload.configId : '';
  const texts = Array.isArray(payload.texts) && payload.texts.every((text) => typeof text === 'string')
    ? payload.texts as string[]
    : null;
  const purpose = payload.purpose === 'query' ? 'query' : 'document';
  if (!configId || !texts?.length) throw new ApiError(400, 'INVALID_REQUEST', 'configId and texts are required');

  const row = await first<Row>(db.prepare('SELECT * FROM embedding_configs WHERE id = ?1').bind(configId));
  if (!row) throw new ApiError(404, 'EMBEDDING_CONFIG_NOT_FOUND', 'Embedding config not found');
  const apiType = String(row.api_type ?? 'openai');
  const baseUrl = validatedUrl(String(row.base_url ?? ''), { allowPrivate: false, requireHttps: true }).toString().replace(/\/$/, '');
  const model = String(row.model ?? '');
  const encryptedKey = String(row.api_key_encrypted ?? '');
  const apiKey = encryptedKey
    ? await decryptSecret(encryptedKey, requireEncryptionSecret(encryptionSecret))
    : '';
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
  let targetUrl = baseUrl;
  let body: Row;

  if (['openai', 'siliconflow', 'openai-compatible'].includes(apiType)) {
    targetUrl = apiType === 'openai-compatible' ? baseUrl : buildApiUrl(baseUrl, 'v1/embeddings');
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    body = { model, input: texts };
  } else if (apiType === 'ollama') {
    targetUrl = buildApiUrl(baseUrl, 'api/embed');
    body = { model, input: texts };
  } else if (apiType === 'gemini') {
    const target = new URL(buildApiUrl(baseUrl, `v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`));
    target.searchParams.set('key', apiKey);
    targetUrl = target.toString();
    body = {
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
      })),
    };
  } else if (apiType === 'cohere') {
    targetUrl = buildApiUrl(baseUrl, 'v1/embed');
    headers.set('Authorization', `Bearer ${apiKey}`);
    body = { model, texts, input_type: purpose === 'query' ? 'search_query' : 'search_document', embedding_types: ['float'] };
  } else {
    throw new ApiError(400, 'UNSUPPORTED_EMBEDDING_API', `Unsupported embedding API type: ${apiType}`);
  }

  const upstream = await fetchNoRedirect(targetUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!upstream.ok) return upstreamResponse(upstream);
  const data = await upstream.json() as Row;
  let vectors: unknown;
  if (['openai', 'siliconflow', 'openai-compatible'].includes(apiType)) {
    const items = Array.isArray(data.data) ? data.data as Row[] : [];
    vectors = items.sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)).map((item) => item.embedding);
  } else if (apiType === 'gemini') {
    vectors = Array.isArray(data.embeddings) ? (data.embeddings as Row[]).map((item) => item.values) : [];
  } else if (apiType === 'cohere') {
    const embeddings = data.embeddings as Row | unknown[] | undefined;
    vectors = embeddings && !Array.isArray(embeddings) && Array.isArray(embeddings.float)
      ? embeddings.float
      : embeddings;
  } else {
    vectors = data.embeddings;
  }
  if (!Array.isArray(vectors)) throw new ApiError(502, 'INVALID_EMBEDDING_RESPONSE', 'Embedding upstream returned an invalid response');
  return json({ vectors });
}

async function translationFetch(request: Request): Promise<Response> {
  const payload = await readJson<ProxyBody>(request);
  const texts = Array.isArray(payload.texts) && payload.texts.every((text) => typeof text === 'string')
    ? payload.texts as string[]
    : null;
  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  const from = typeof payload.from === 'string' ? payload.from.trim() : '';
  const textType = payload.textType === 'html' ? 'html' : 'plain';
  if (!texts?.length || texts.length > 100 || !to) {
    throw new ApiError(400, 'INVALID_TRANSLATION_REQUEST', 'texts (1-100 items) and to are required');
  }
  if (texts.some((text) => text.length > 5000) || texts.reduce((total, text) => total + text.length, 0) > 50000) {
    throw new ApiError(413, 'TRANSLATION_PAYLOAD_TOO_LARGE', 'Translation payload exceeds the Worker limit');
  }

  const authResponse = await fetchNoRedirect(TRANSLATE_AUTH_URL, { method: 'GET' });
  if (!authResponse.ok) return upstreamResponse(authResponse);
  const token = await authResponse.text();

  const target = new URL(TRANSLATE_API_URL);
  target.searchParams.set('api-version', '3.0');
  target.searchParams.set('to', to);
  if (from) target.searchParams.set('from', from);
  if (textType === 'html') target.searchParams.set('textType', 'html');

  const upstream = await fetchNoRedirect(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  });
  if (!upstream.ok) return upstreamResponse(upstream);
  const data = await upstream.json() as Array<{
    detectedLanguage?: { language?: string };
    translations?: Array<{ text?: string }>;
  }>;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new ApiError(502, 'INVALID_TRANSLATION_RESPONSE', 'Translation upstream returned an invalid response');
  }
  return json({
    results: data.map((item, index) => ({
      translatedText: item.translations?.[0]?.text ?? texts[index],
      detectedLanguage: item.detectedLanguage?.language ?? '',
    })),
  });
}

async function searchGitHub(request: Request, db: D1Database, encryptionSecret: string | undefined, kind: 'repositories' | 'users'): Promise<Response> {
  const payload = await readJson<ProxyBody>(request);
  const queryParams = payload.query_params && typeof payload.query_params === 'object'
    ? new URLSearchParams(payload.query_params as Record<string, string>)
    : new URLSearchParams();
  const headers = new Headers({
    Authorization: `Bearer ${await storedGithubToken(db, encryptionSecret)}`,
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'StarsManager-Workers',
  });
  return upstreamResponse(await fetchNoRedirect(`https://api.github.com/search/${kind}?${queryParams.toString()}`, { headers }));
}

export async function handleProxyRoute(
  request: Request,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  const path = url.pathname;
  if (request.method === 'POST' && path === '/api/proxy/github/search/repositories') {
    return searchGitHub(request, db, encryptionSecret, 'repositories');
  }
  if (request.method === 'POST' && path === '/api/proxy/github/search/users') {
    return searchGitHub(request, db, encryptionSecret, 'users');
  }
  if (request.method === 'POST' && path.startsWith('/api/proxy/github/')) {
    return githubFetch(request, db, url, encryptionSecret);
  }
  if (request.method === 'POST' && path === '/api/proxy/github-raw') {
    return githubRawFetch(request, db, encryptionSecret);
  }
  if (request.method === 'POST' && path === '/api/proxy/ai') return aiFetch(request, db, encryptionSecret);
  if (request.method === 'POST' && path === '/api/proxy/embedding') return embeddingFetch(request, db, encryptionSecret);
  if (request.method === 'POST' && path === '/api/proxy/translate') return translationFetch(request);
  return null;
}
