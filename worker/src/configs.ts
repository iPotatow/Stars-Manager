import { all, first, type Row } from './db';
import { ApiError, json, readJson } from './http';
import { decryptSecret, encryptSecret, maskSecret, requireEncryptionSecret } from './security';

type ConfigKind = 'ai' | 'embedding';

interface ConfigDescriptor {
  kind: ConfigKind;
  path: string;
  table: 'ai_configs' | 'embedding_configs';
  secretColumn: 'api_key_encrypted';
  requestSecret: 'apiKey';
  requiresSecret: boolean;
  insertSql: string;
  values(config: Row, encryptedSecret: string, id: string): unknown[];
  shape(row: Row, secret: string, status: 'ok' | 'empty' | 'decrypt_failed'): Row;
}

const AI: ConfigDescriptor = {
  kind: 'ai',
  path: '/api/configs/ai',
  table: 'ai_configs',
  secretColumn: 'api_key_encrypted',
  requestSecret: 'apiKey',
  requiresSecret: true,
  insertSql: `INSERT INTO ai_configs (
    id, name, api_type, base_url, api_key_encrypted, model, is_active,
    custom_prompt, use_custom_prompt, concurrency, reasoning_effort, mimo_plan
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, api_type=excluded.api_type, base_url=excluded.base_url,
    api_key_encrypted=excluded.api_key_encrypted, model=excluded.model, is_active=excluded.is_active,
    custom_prompt=excluded.custom_prompt, use_custom_prompt=excluded.use_custom_prompt,
    concurrency=excluded.concurrency, reasoning_effort=excluded.reasoning_effort, mimo_plan=excluded.mimo_plan`,
  values(config, encryptedSecret, id) {
    return [
      id, String(config.name ?? ''), String(config.apiType ?? config.api_type ?? 'openai'),
      String(config.baseUrl ?? config.base_url ?? ''), encryptedSecret, String(config.model ?? ''),
      config.isActive || config.is_active ? 1 : 0, config.customPrompt ?? config.custom_prompt ?? null,
      config.useCustomPrompt || config.use_custom_prompt ? 1 : 0, Number(config.concurrency ?? 1),
      config.reasoningEffort ?? config.reasoning_effort ?? null, config.mimoPlan ?? config.mimo_plan ?? null,
    ];
  },
  shape(row, secret, status) {
    return {
      id: row.id,
      name: row.name,
      apiType: row.api_type,
      model: row.model,
      baseUrl: row.base_url,
      apiKey: secret,
      apiKeyStatus: status,
      isActive: Boolean(row.is_active),
      customPrompt: row.custom_prompt ?? null,
      useCustomPrompt: Boolean(row.use_custom_prompt),
      concurrency: Number(row.concurrency ?? 1),
      reasoningEffort: row.reasoning_effort ?? null,
      mimoPlan: row.mimo_plan ?? null,
    };
  },
};

const EMBEDDING: ConfigDescriptor = {
  kind: 'embedding',
  path: '/api/configs/embedding',
  table: 'embedding_configs',
  secretColumn: 'api_key_encrypted',
  requestSecret: 'apiKey',
  requiresSecret: false,
  insertSql: `INSERT INTO embedding_configs (
    id, name, api_type, base_url, api_key_encrypted, model, dimensions, is_active, updated_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, api_type=excluded.api_type, base_url=excluded.base_url,
    api_key_encrypted=excluded.api_key_encrypted, model=excluded.model, dimensions=excluded.dimensions,
    is_active=excluded.is_active, updated_at=datetime('now')`,
  values(config, encryptedSecret, id) {
    return [
      id, String(config.name ?? ''), String(config.apiType ?? config.api_type ?? 'openai'),
      String(config.baseUrl ?? config.base_url ?? ''), encryptedSecret, String(config.model ?? ''),
      Number(config.dimensions ?? 1536), config.isActive || config.is_active ? 1 : 0,
    ];
  },
  shape(row, secret, status) {
    return {
      id: row.id,
      name: row.name,
      apiType: row.api_type,
      baseUrl: row.base_url,
      apiKey: secret,
      apiKeyStatus: status,
      model: row.model,
      dimensions: Number(row.dimensions ?? 1536),
      isActive: Boolean(row.is_active),
    };
  },
};

const DESCRIPTORS = [AI, EMBEDDING] as const;

async function decryptedValue(value: unknown, encryptionSecret: string | undefined): Promise<{
  value: string;
  status: 'ok' | 'empty' | 'decrypt_failed';
}> {
  if (typeof value !== 'string' || !value) return { value: '', status: 'empty' };
  try {
    return { value: await decryptSecret(value, requireEncryptionSecret(encryptionSecret)), status: 'ok' };
  } catch {
    return { value: '', status: 'decrypt_failed' };
  }
}

async function listConfigs(
  descriptor: ConfigDescriptor,
  db: D1Database,
  _decrypt: boolean,
  encryptionSecret: string | undefined,
): Promise<Response> {
  const rows = await all<Row>(db.prepare(`SELECT * FROM ${descriptor.table} ORDER BY id ASC`));
  const shaped = await Promise.all(rows.map(async (row) => {
    const secret = await decryptedValue(row[descriptor.secretColumn], encryptionSecret);
    // Plaintext secrets must never be returned over the browser API. The proxy
    // decrypts them server-side when a configured operation needs them.
    return descriptor.shape(row, maskSecret(secret.value), secret.status);
  }));
  return json(shaped);
}

async function resolveSecret(
  descriptor: ConfigDescriptor,
  config: Row,
  existing: string,
  encryptionSecret: string | undefined,
): Promise<string> {
  const raw = config[descriptor.requestSecret];
  if (raw === '') return '';
  if (typeof raw === 'string' && raw && !raw.startsWith('***')) {
    return encryptSecret(raw, requireEncryptionSecret(encryptionSecret));
  }
  return existing;
}

async function createOrUpdateConfig(
  descriptor: ConfigDescriptor,
  request: Request,
  db: D1Database,
  id: string,
  encryptionSecret: string | undefined,
  status: 200 | 201,
): Promise<Response> {
  const body = await readJson<Row>(request);
  const existing = await first<Row>(
    db.prepare(`SELECT ${descriptor.secretColumn} FROM ${descriptor.table} WHERE id = ?1`).bind(id),
  );
  const encrypted = await resolveSecret(descriptor, body, String(existing?.[descriptor.secretColumn] ?? ''), encryptionSecret);
  if (descriptor.requiresSecret && !encrypted) {
    throw new ApiError(422, 'SECRET_REQUIRED', `${descriptor.requestSecret} is required`);
  }
  await db.prepare(descriptor.insertSql).bind(...descriptor.values(body, encrypted, id)).run();
  const row = await first<Row>(db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?1`).bind(id));
  if (!row) throw new ApiError(500, 'CONFIG_WRITE_FAILED', 'Config could not be read after writing');
  const plaintext = await decryptedValue(encrypted, encryptionSecret);
  return json(descriptor.shape(row, maskSecret(plaintext.value), plaintext.status), status);
}

async function bulkConfigs(
  descriptor: ConfigDescriptor,
  request: Request,
  db: D1Database,
  encryptionSecret: string | undefined,
): Promise<Response> {
  const body = await readJson<Row>(request);
  if (!Array.isArray(body.configs)) throw new ApiError(400, 'INVALID_REQUEST', 'configs array is required');
  const existingRows = await all<Row>(db.prepare(`SELECT id, ${descriptor.secretColumn} FROM ${descriptor.table}`));
  const existing = new Map(existingRows.map((row) => [String(row.id), String(row[descriptor.secretColumn] ?? '')]));
  const statements: D1PreparedStatement[] = [];
  const errors: Array<{ id: string; name: string; reason: string }> = [];
  for (const item of body.configs) {
    if (!item || typeof item !== 'object') continue;
    const config = item as Row;
    const id = typeof config.id === 'string' && config.id ? config.id : crypto.randomUUID();
    const encrypted = await resolveSecret(descriptor, config, existing.get(id) ?? '', encryptionSecret);
    if (descriptor.requiresSecret && !encrypted) {
      errors.push({ id, name: String(config.name ?? ''), reason: `${descriptor.requestSecret} is empty` });
      continue;
    }
    statements.push(db.prepare(descriptor.insertSql).bind(...descriptor.values(config, encrypted, id)));
  }
  if (errors.length > 0) {
    return json({ error: 'Some configs were skipped', code: 'SYNC_CONFIGS_PARTIAL_SKIP', synced: 0, skipped: errors.length, errors }, 422);
  }
  await db.batch([db.prepare(`DELETE FROM ${descriptor.table}`), ...statements]);
  return json({ synced: statements.length, skipped: 0, errors: [] });
}

async function configRoute(
  descriptor: ConfigDescriptor,
  request: Request,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  const path = url.pathname;
  if (path === descriptor.path && request.method === 'GET') {
    return listConfigs(descriptor, db, url.searchParams.get('decrypt') === 'true', encryptionSecret);
  }
  if (path === descriptor.path && request.method === 'POST') {
    return createOrUpdateConfig(descriptor, request, db, crypto.randomUUID(), encryptionSecret, 201);
  }
  if (path === `${descriptor.path}/bulk` && request.method === 'PUT') {
    return bulkConfigs(descriptor, request, db, encryptionSecret);
  }
  const match = path.match(new RegExp(`^${descriptor.path}/([^/]+)$`));
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (request.method === 'PUT') return createOrUpdateConfig(descriptor, request, db, id, encryptionSecret, 200);
  if (request.method === 'DELETE') {
    const result = await db.prepare(`DELETE FROM ${descriptor.table} WHERE id = ?1`).bind(id).run();
    if (!result.meta.changes) throw new ApiError(404, 'CONFIG_NOT_FOUND', 'Config not found');
    return json({ deleted: true });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported config method');
}

async function settingsRoute(
  request: Request,
  db: D1Database,
  encryptionSecret: string | undefined,
): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await all<{ key: string; value: string | null }>(db.prepare('SELECT key, value FROM settings'));
    const settings: Row = {};
    for (const row of rows) {
      if (row.key === 'github_token' && row.value) {
        const result = await decryptedValue(row.value, encryptionSecret);
        settings.github_token = maskSecret(result.value);
        settings.github_token_status = result.status;
      } else if (!['mcp_token', 'proxy_config', 'rpc_download_config'].includes(row.key)) {
        settings[row.key] = row.value;
      }
    }
    return json(settings);
  }
  if (request.method === 'PUT') {
    const body = await readJson<Row>(request);
    const statements: D1PreparedStatement[] = [];
    for (const [key, raw] of Object.entries(body)) {
      if (key === 'github_token' && typeof raw === 'string' && raw.startsWith('***')) continue;
      let value: string | null;
      if (key === 'github_token' && typeof raw === 'string' && raw) {
        value = await encryptSecret(raw, requireEncryptionSecret(encryptionSecret));
      } else if (raw === null || raw === undefined) {
        value = null;
      } else if (typeof raw === 'object') {
        value = JSON.stringify(raw);
      } else {
        value = String(raw);
      }
      statements.push(
        db.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .bind(key, value),
      );
    }
    if (statements.length) await db.batch(statements);
    return json({ updated: true });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported settings method');
}

async function vectorConfigRoute(
  request: Request,
  db: D1Database,
): Promise<Response> {
  if (request.method === 'GET') {
    const row = await first<Row>(db.prepare("SELECT * FROM vector_search_configs WHERE id = 'default'"));
    if (!row) {
      return json({
        enabled: false, embeddingConfigId: '', indexMode: 'readme',
        readmeMaxChars: 6000, searchThreshold: 0.35, searchTopK: 30, enableHyDE: true, enableReranking: true,
      });
    }
    let status: unknown;
    try { status = row.status_json ? JSON.parse(String(row.status_json)) : undefined; } catch { status = undefined; }
    return json({
      enabled: Boolean(row.enabled),
      embeddingConfigId: row.embedding_config_id ?? '',
      indexMode: row.index_mode ?? 'readme',
      readmeMaxChars: Number(row.readme_max_chars ?? 6000),
      searchThreshold: Number(row.search_threshold ?? 0.35),
      searchTopK: Number(row.search_top_k ?? 30),
      enableHyDE: Boolean(row.enable_hyde),
      enableReranking: Boolean(row.enable_reranking),
      embeddingFormatVersion: row.embedding_format_version ?? undefined,
      status,
      lastSyncAt: row.last_sync_at ?? null,
    });
  }
  if (request.method === 'PUT') {
    const body = await readJson<Row>(request);
    const mode = body.indexMode === 'description' ? 'description' : 'readme';
    const maxChars = Number(body.readmeMaxChars ?? 6000);
    const threshold = Number(body.searchThreshold ?? 0.35);
    const topK = Number(body.searchTopK ?? 30);
    await db.prepare(`INSERT INTO vector_search_configs (
      id, enabled, embedding_config_id, index_mode, readme_max_chars,
      search_threshold, search_top_k, enable_hyde, enable_reranking, embedding_format_version,
      status_json, last_sync_at, updated_at
    ) VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, embedding_config_id=excluded.embedding_config_id,
      index_mode=excluded.index_mode, readme_max_chars=excluded.readme_max_chars,
      search_threshold=excluded.search_threshold, search_top_k=excluded.search_top_k,
      enable_hyde=excluded.enable_hyde, enable_reranking=excluded.enable_reranking,
      embedding_format_version=excluded.embedding_format_version, status_json=excluded.status_json,
      last_sync_at=excluded.last_sync_at, updated_at=datetime('now')`)
      .bind(
        body.enabled ? 1 : 0,
        String(body.embeddingConfigId ?? ''),
        mode,
        Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 6000,
        Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.35,
        Number.isInteger(topK) && topK >= 5 && topK <= 50 ? topK : 30,
        body.enableHyDE === true ? 1 : 0,
        body.enableReranking === true ? 1 : 0,
        Number.isInteger(body.embeddingFormatVersion) ? body.embeddingFormatVersion : null,
        body.status ? JSON.stringify(body.status) : null,
        body.lastSyncAt ?? null,
      ).run();
    return json({ updated: true });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported vector config method');
}

export async function handleConfigRoute(
  request: Request,
  db: D1Database,
  url: URL,
  encryptionSecret: string | undefined,
): Promise<Response | null> {
  for (const descriptor of DESCRIPTORS) {
    const response = await configRoute(descriptor, request, db, url, encryptionSecret);
    if (response) return response;
  }
  if (url.pathname === '/api/settings') return settingsRoute(request, db, encryptionSecret);
  if (url.pathname === '/api/configs/vector-search') return vectorConfigRoute(request, db);
  return null;
}
