export type Row = Record<string, unknown>;

export async function all<T extends Row = Row>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results;
}

export async function first<T extends Row = Row>(statement: D1PreparedStatement): Promise<T | null> {
  return statement.first<T>();
}

export async function run(statement: D1PreparedStatement): Promise<D1Result> {
  return statement.run();
}

export async function batchInChunks(db: D1Database, statements: D1PreparedStatement[], size = 50): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += size) {
    await db.batch(statements.slice(offset, offset + size));
  }
}

export function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function jsonValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify([]);
    }
  }
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export function boolInt(value: unknown): number {
  return value === true || value === 1 ? 1 : 0;
}

const NO_LICENSE_KEYS = new Set(['', 'noassertion', 'other', 'none', 'no-license']);

export function licenseId(value: unknown): string | null {
  let candidate = '';
  if (typeof value === 'string') candidate = value.trim();
  if (value && typeof value === 'object') {
    const record = value as { spdx_id?: unknown; key?: unknown };
    candidate = typeof record.spdx_id === 'string'
      ? record.spdx_id.trim()
      : typeof record.key === 'string'
        ? record.key.trim()
        : '';
  }
  return NO_LICENSE_KEYS.has(candidate.toLowerCase()) ? null : candidate || null;
}

export function transformRepository(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    full_name: row.full_name,
    description: row.description,
    html_url: row.html_url,
    stargazers_count: row.stargazers_count,
    language: row.language,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pushed_at: row.pushed_at,
    starred_at: row.starred_at,
    owner: { login: row.owner_login, avatar_url: row.owner_avatar_url },
    topics: jsonArray(row.topics),
    ai_summary: row.ai_summary,
    ai_tags: jsonArray(row.ai_tags),
    ai_platforms: jsonArray(row.ai_platforms),
    analyzed_at: row.analyzed_at,
    analysis_failed: Boolean(row.analysis_failed),
    custom_description: row.custom_description,
    custom_tags: jsonArray(row.custom_tags),
    custom_category: row.custom_category ?? undefined,
    category_locked: Boolean(row.category_locked),
    last_edited: row.last_edited,
    subscribed_to_releases: Boolean(row.subscribed_to_releases),
    vector_indexed_at: row.vector_indexed_at ?? undefined,
    license: row.license ?? null,
    vector_indexed_license: row.vector_indexed_license ?? null,
  };
}

export function transformRelease(row: Row): Row {
  return {
    id: row.id,
    tag_name: row.tag_name,
    name: row.name,
    body: row.body,
    html_url: row.html_url,
    published_at: row.published_at,
    prerelease: Boolean(row.prerelease),
    draft: Boolean(row.draft),
    is_read: Boolean(row.is_read),
    assets: jsonArray(row.assets),
    zipball_url: row.zipball_url ?? undefined,
    tarball_url: row.tarball_url ?? undefined,
    repository: {
      id: row.repo_id,
      full_name: row.repo_full_name,
      name: row.repo_name,
    },
  };
}

export function transformCategory(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keywords: jsonArray(row.keywords),
    color: row.color,
    icon: row.icon,
    sort_order: row.sort_order,
  };
}

export function transformAssetFilter(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keywords: jsonArray(row.keywords),
    platform: row.platform,
    sort_order: row.sort_order,
  };
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await first<{ value: string | null }>(db.prepare('SELECT value FROM settings WHERE key = ?1').bind(key));
  return row?.value ?? null;
}

export async function putSetting(db: D1Database, key: string, value: string | null): Promise<void> {
  await run(
    db.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(key, value),
  );
}
