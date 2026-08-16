import { all, first, getSetting, jsonArray, putSetting, transformRepository, type Row } from './db';
import { ApiError, empty, json, readJson } from './http';
import { bearerToken, decryptSecret, encryptSecret, requireEncryptionSecret, timingSafeMatches } from './security';

interface JsonRpcRequest extends Row {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Row;
}

const TOOL_DEFINITIONS = [
  {
    name: 'gsm_status',
    description: 'Get Stars Manager MCP status and repository count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'gsm_search_repos',
    description: 'Search starred repositories including AI summaries, tags, platforms, and custom fields.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        languages: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        platforms: { type: 'array', items: { type: 'string' } },
        licenses: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        minStars: { type: 'number' },
        maxStars: { type: 'number' },
        isAnalyzed: { type: 'boolean' },
        isSubscribed: { type: 'boolean' },
        sortBy: { type: 'string', enum: ['stars', 'updated', 'name', 'starred'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'gsm_get_repo',
    description: 'Get one repository by numeric id or full_name.',
    inputSchema: {
      type: 'object',
      properties: { idOrFullName: { type: 'string' } },
      required: ['idOrFullName'],
      additionalProperties: false,
    },
  },
  {
    name: 'gsm_list_categories',
    description: 'List custom categories stored in Stars Manager.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'gsm_list_repos_by_category',
    description: 'List repositories in a custom category with pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        offset: { type: 'integer', minimum: 0 },
        sortBy: { type: 'string', enum: ['stars', 'updated', 'name', 'starred'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      },
      required: ['category'],
      additionalProperties: false,
    },
  },
  {
    name: 'gsm_stats',
    description: 'Aggregate language, analysis, subscription, and tag statistics.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

function rpcResult(id: JsonRpcRequest['id'], result: unknown): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function textToolResult(data: unknown): Row {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function storedMcpToken(db: D1Database, encryptionSecret: string | undefined): Promise<string> {
  const encrypted = await getSetting(db, 'mcp_token');
  if (!encrypted) return '';
  return decryptSecret(encrypted, requireEncryptionSecret(encryptionSecret));
}

async function ensureMcpToken(db: D1Database, encryptionSecret: string | undefined, reset = false): Promise<string> {
  if (!reset) {
    const existing = await storedMcpToken(db, encryptionSecret);
    if (existing) return existing;
  }
  const token = `gsm_mcp_${crypto.randomUUID().replaceAll('-', '')}`;
  await putSetting(db, 'mcp_token', await encryptSecret(token, requireEncryptionSecret(encryptionSecret)));
  return token;
}

async function isEnabled(db: D1Database): Promise<boolean> {
  return (await getSetting(db, 'mcp_enabled')) === 'true';
}

async function adminRoute(
  request: Request,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  if (url.pathname === '/api/mcp/status' && request.method === 'GET') {
    const enabled = await isEnabled(db);
    const token = enabled ? await ensureMcpToken(db, encryptionSecret) : await storedMcpToken(db, encryptionSecret);
    return json({
      enabled,
      token,
      endpoints: { streamableHttp: '/mcp' },
    });
  }
  if (url.pathname === '/api/mcp/config' && request.method === 'PUT') {
    const body = await readJson<Row>(request);
    if (typeof body.enabled === 'boolean') await putSetting(db, 'mcp_enabled', String(body.enabled));
    const enabled = await isEnabled(db);
    if (body.resetToken === true && !enabled) {
      throw new ApiError(400, 'MCP_DISABLED', 'Cannot reset the MCP token while MCP is disabled');
    }
    const token = enabled
      ? await ensureMcpToken(db, encryptionSecret, body.resetToken === true)
      : await storedMcpToken(db, encryptionSecret);
    return json({
      enabled,
      token,
      endpoints: { streamableHttp: '/mcp' },
    });
  }
  return null;
}

function includesAll(haystack: string[], needles: string[]): boolean {
  const normalized = haystack.map((value) => value.toLowerCase());
  return needles.every((needle) => normalized.some((value) => value.includes(needle.toLowerCase())));
}

function projectedRepository(row: Row): Row {
  const repo = transformRepository(row);
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    html_url: repo.html_url,
    stargazers_count: repo.stargazers_count,
    language: repo.language,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    starred_at: repo.starred_at,
    owner: repo.owner,
    topics: repo.topics,
    ai_summary: repo.ai_summary,
    ai_tags: repo.ai_tags,
    ai_platforms: repo.ai_platforms,
    custom_description: repo.custom_description,
    custom_tags: repo.custom_tags,
    custom_category: repo.custom_category,
    analyzed_at: repo.analyzed_at,
    subscribed_to_releases: repo.subscribed_to_releases,
    license: repo.license,
  };
}

async function searchRepositories(db: D1Database, args: Row): Promise<Row> {
  const rows = await all<Row>(db.prepare('SELECT * FROM repositories LIMIT 10000'));
  const queryWords = String(args.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const languages = Array.isArray(args.languages) ? args.languages.map(String) : [];
  const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
  const platforms = Array.isArray(args.platforms) ? args.platforms.map(String) : [];
  const licenses = Array.isArray(args.licenses) ? args.licenses.map(String) : [];
  const category = typeof args.category === 'string' ? args.category : '';
  const filtered = rows.filter((row) => {
    const searchable = [
      row.name, row.full_name, row.description, row.ai_summary, row.custom_description,
      ...jsonArray(row.topics), ...jsonArray(row.ai_tags), ...jsonArray(row.custom_tags),
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
    if (!queryWords.every((word) => searchable.includes(word))) return false;
    if (languages.length && !languages.some((language) => language.toLowerCase() === String(row.language ?? '').toLowerCase())) return false;
    if (tags.length && !includesAll([...jsonArray(row.ai_tags), ...jsonArray(row.custom_tags)].map(String), tags)) return false;
    if (platforms.length && !includesAll(jsonArray(row.ai_platforms).map(String), platforms)) return false;
    if (licenses.length) {
      const license = row.license == null ? '__NO_LICENSE__' : String(row.license);
      if (!licenses.some((value) => value.toLowerCase() === license.toLowerCase())) return false;
    }
    if (category && String(row.custom_category ?? '') !== category) return false;
    if (typeof args.minStars === 'number' && Number(row.stargazers_count ?? 0) < args.minStars) return false;
    if (typeof args.maxStars === 'number' && Number(row.stargazers_count ?? 0) > args.maxStars) return false;
    if (typeof args.isAnalyzed === 'boolean' && Boolean(row.analyzed_at) !== args.isAnalyzed) return false;
    if (typeof args.isSubscribed === 'boolean' && Boolean(row.subscribed_to_releases) !== args.isSubscribed) return false;
    return true;
  });

  const sortBy = String(args.sortBy ?? 'stars');
  const order = args.sortOrder === 'asc' ? 1 : -1;
  filtered.sort((left, right) => {
    let a: string | number = 0;
    let b: string | number = 0;
    if (sortBy === 'stars') { a = Number(left.stargazers_count ?? 0); b = Number(right.stargazers_count ?? 0); }
    if (sortBy === 'name') { a = String(left.full_name ?? ''); b = String(right.full_name ?? ''); }
    if (sortBy === 'updated') { a = String(left.updated_at ?? ''); b = String(right.updated_at ?? ''); }
    if (sortBy === 'starred') { a = String(left.starred_at ?? ''); b = String(right.starred_at ?? ''); }
    return a < b ? -order : a > b ? order : 0;
  });
  const offset = Math.max(0, Number(args.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 50)));
  return { total: filtered.length, offset, limit, items: filtered.slice(offset, offset + limit).map(projectedRepository) };
}

async function stats(db: D1Database): Promise<Row> {
  const rows = await all<Row>(db.prepare('SELECT language, analyzed_at, subscribed_to_releases, ai_tags, custom_tags FROM repositories'));
  const languages: Record<string, number> = {};
  const tags: Record<string, number> = {};
  let analyzed = 0;
  let subscribed = 0;
  for (const row of rows) {
    const language = String(row.language ?? 'Unknown');
    languages[language] = (languages[language] ?? 0) + 1;
    if (row.analyzed_at) analyzed += 1;
    if (row.subscribed_to_releases) subscribed += 1;
    for (const tag of [...jsonArray(row.ai_tags), ...jsonArray(row.custom_tags)]) {
      const key = String(tag);
      tags[key] = (tags[key] ?? 0) + 1;
    }
  }
  const top = (values: Record<string, number>) => Object.entries(values)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));
  return { totalRepositories: rows.length, analyzed, unanalyzed: rows.length - analyzed, subscribed, languages: top(languages), tags: top(tags) };
}

async function callTool(db: D1Database, name: string, args: Row): Promise<Row> {
  if (name === 'gsm_status') {
    const count = await first<{ total: number }>(db.prepare('SELECT COUNT(*) AS total FROM repositories'));
    return textToolResult({ name: 'stars-manager', version: '0.7.3-cf', mode: 'cloudflare-workers-d1-vectorize', repositoryCount: count?.total ?? 0 });
  }
  if (name === 'gsm_search_repos') return textToolResult(await searchRepositories(db, args));
  if (name === 'gsm_list_repos_by_category') return textToolResult(await searchRepositories(db, args));
  if (name === 'gsm_get_repo') {
    const value = String(args.idOrFullName ?? '');
    const row = /^\d+$/.test(value)
      ? await first<Row>(db.prepare('SELECT * FROM repositories WHERE id = ?1').bind(Number(value)))
      : await first<Row>(db.prepare('SELECT * FROM repositories WHERE full_name = ?1 COLLATE NOCASE').bind(value));
    return textToolResult(row ? projectedRepository(row) : { error: 'not_found', idOrFullName: value });
  }
  if (name === 'gsm_list_categories') {
    const categories = await all<Row>(db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC'));
    return textToolResult({ categories: categories.map((row) => ({ ...row, keywords: jsonArray(row.keywords) })) });
  }
  if (name === 'gsm_stats') return textToolResult(await stats(db));
  throw new ApiError(404, 'MCP_TOOL_NOT_FOUND', `Unknown tool: ${name}`);
}

async function authenticateMcp(request: Request, db: D1Database, encryptionSecret: string | undefined): Promise<void> {
  if (!await isEnabled(db)) throw new ApiError(503, 'MCP_DISABLED', 'MCP is disabled');
  const expected = await storedMcpToken(db, encryptionSecret);
  const actual = bearerToken(request) || request.headers.get('x-mcp-token')?.trim() || '';
  if (!expected || !actual || !await timingSafeMatches(actual, expected)) {
    throw new ApiError(401, 'MCP_UNAUTHORIZED', 'Invalid MCP token');
  }
}

async function streamableHttp(
  request: Request,
  db: D1Database,
  encryptionSecret: string | undefined,
): Promise<Response> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    return json({ error: 'This deployment uses stateless POST-only Streamable HTTP', code: 'MCP_POST_ONLY' }, 405, { Allow: 'POST' });
  }
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'MCP only accepts POST');
  await authenticateMcp(request, db, encryptionSecret);
  const message = await readJson<JsonRpcRequest>(request);
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message.id, -32600, 'Invalid Request');
  }
  if (message.method.startsWith('notifications/')) return empty(202);
  if (message.method === 'initialize') {
    return rpcResult(message.id, {
      protocolVersion: String((message.params?.protocolVersion as string | undefined) ?? '2025-06-18'),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'stars-manager', version: '0.7.3-cf' },
      instructions: 'Search and inspect the owner\'s GitHub starred repositories.',
    });
  }
  if (message.method === 'ping') return rpcResult(message.id, {});
  if (message.method === 'tools/list') return rpcResult(message.id, { tools: TOOL_DEFINITIONS });
  if (message.method === 'tools/call') {
    const name = String(message.params?.name ?? '');
    const args = message.params?.arguments && typeof message.params.arguments === 'object'
      ? message.params.arguments as Row
      : {};
    try {
      return rpcResult(message.id, await callTool(db, name, args));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return rpcResult(message.id, { content: [{ type: 'text', text: detail }], isError: true });
    }
  }
  return rpcError(message.id, -32601, 'Method not found');
}

export async function handleMcpRoute(
  request: Request,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  const admin = await adminRoute(request, db, url, encryptionSecret);
  if (admin) return admin;
  if (url.pathname === '/mcp') return streamableHttp(request, db, encryptionSecret);
  return null;
}
