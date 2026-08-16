import {
  all,
  batchInChunks,
  boolInt,
  first,
  getSetting,
  jsonValue,
  licenseId,
  transformAssetFilter,
  transformCategory,
  transformRelease,
  transformRepository,
  type Row,
} from './db';
import { ApiError, json, integerParam, readJson } from './http';

const REPOSITORY_UPSERT = `INSERT INTO repositories (
  id, name, full_name, description, html_url, stargazers_count, language,
  created_at, updated_at, pushed_at, starred_at, owner_login, owner_avatar_url, topics,
  ai_summary, ai_tags, ai_platforms, analyzed_at, analysis_failed, custom_description,
  custom_tags, custom_category, category_locked, last_edited, subscribed_to_releases,
  vector_indexed_at, license, vector_indexed_license, sync_marker
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
  ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29
)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, full_name=excluded.full_name, description=excluded.description,
  html_url=excluded.html_url, stargazers_count=excluded.stargazers_count, language=excluded.language,
  created_at=excluded.created_at, updated_at=excluded.updated_at, pushed_at=excluded.pushed_at,
  starred_at=excluded.starred_at, owner_login=excluded.owner_login, owner_avatar_url=excluded.owner_avatar_url,
  topics=excluded.topics, ai_summary=excluded.ai_summary, ai_tags=excluded.ai_tags,
  ai_platforms=excluded.ai_platforms, analyzed_at=excluded.analyzed_at,
  analysis_failed=excluded.analysis_failed, custom_description=excluded.custom_description,
  custom_tags=excluded.custom_tags, custom_category=excluded.custom_category,
  category_locked=excluded.category_locked, last_edited=excluded.last_edited,
  subscribed_to_releases=excluded.subscribed_to_releases, vector_indexed_at=excluded.vector_indexed_at,
  license=excluded.license, vector_indexed_license=excluded.vector_indexed_license,
  sync_marker=excluded.sync_marker`;

const RELEASE_UPSERT_PRESERVE_READ = `INSERT INTO releases (
  id, tag_name, name, body, html_url, published_at, prerelease, draft, is_read,
  assets, repo_id, repo_full_name, repo_name, zipball_url, tarball_url
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
ON CONFLICT(id) DO UPDATE SET
  tag_name=excluded.tag_name, name=excluded.name, body=excluded.body, html_url=excluded.html_url,
  published_at=excluded.published_at, prerelease=excluded.prerelease, draft=excluded.draft,
  is_read=releases.is_read, assets=excluded.assets, repo_id=excluded.repo_id,
  repo_full_name=excluded.repo_full_name, repo_name=excluded.repo_name,
  zipball_url=excluded.zipball_url, tarball_url=excluded.tarball_url`;

const RELEASE_UPSERT_OVERWRITE_READ = RELEASE_UPSERT_PRESERVE_READ.replace(
  'is_read=releases.is_read',
  'is_read=excluded.is_read',
);

function requiredPositiveId(value: unknown, code: string, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, code, `${label} must be a positive integer`);
  }
  return value;
}

async function bumpRepositoryRevision(db: D1Database, current?: number): Promise<number> {
  const next = (current ?? 0) + 1;
  await db.prepare("INSERT INTO settings (key, value) VALUES ('repositories_revision', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(next)).run();
  return next;
}

function repoValues(repo: Row, marker: string): unknown[] {
  const owner = repo.owner && typeof repo.owner === 'object' ? repo.owner as Row : {};
  const id = requiredPositiveId(repo.id, 'INVALID_REPOSITORY_ID', 'Repository id');
  const name = String(repo.name ?? '');
  const fullName = String(repo.full_name ?? '');
  const htmlUrl = String(repo.html_url ?? '');
  if (!name || !fullName || !htmlUrl) {
    throw new ApiError(400, 'INVALID_REPOSITORY', 'Repository name, full_name, and html_url are required');
  }
  const indexedAt = repo.vector_indexed_at;
  if (indexedAt !== null && indexedAt !== undefined && indexedAt !== ''
    && (typeof indexedAt !== 'string' || Number.isNaN(Date.parse(indexedAt)))) {
    throw new ApiError(400, 'INVALID_VECTOR_INDEXED_AT', 'vector_indexed_at must be an ISO date string or null');
  }
  return [
    id,
    name,
    fullName,
    repo.description ?? null,
    htmlUrl,
    Number(repo.stargazers_count ?? 0),
    repo.language ?? null,
    repo.created_at ?? null,
    repo.updated_at ?? null,
    repo.pushed_at ?? null,
    repo.starred_at ?? null,
    String(owner.login ?? repo.owner_login ?? ''),
    owner.avatar_url ?? repo.owner_avatar_url ?? null,
    jsonValue(repo.topics),
    repo.ai_summary ?? null,
    jsonValue(repo.ai_tags),
    jsonValue(repo.ai_platforms),
    repo.analyzed_at ?? null,
    boolInt(repo.analysis_failed),
    repo.custom_description ?? null,
    jsonValue(repo.custom_tags),
    repo.custom_category ?? null,
    boolInt(repo.category_locked),
    repo.last_edited ?? null,
    boolInt(repo.subscribed_to_releases),
    indexedAt || null,
    licenseId(repo.license),
    licenseId(repo.vector_indexed_license),
    marker,
  ];
}

async function upsertRepositories(db: D1Database, repositories: Row[], fullSync: boolean): Promise<number> {
  const marker = crypto.randomUUID();
  const statements = repositories.map((repo) => db.prepare(REPOSITORY_UPSERT).bind(...repoValues(repo, marker)));
  await batchInChunks(db, statements);
  // A client snapshot is not proof that an omitted row was intentionally
  // deleted. Never turn a PUT into an implicit whole-database delete.
  // Deletions use the explicit /api/repositories/:id DELETE endpoint.
  void fullSync;
  return repositories.length;
}

function releaseValues(release: Row): unknown[] {
  const repository = release.repository && typeof release.repository === 'object' ? release.repository as Row : {};
  const id = requiredPositiveId(release.id, 'RELEASE_ID_REQUIRED', 'Release id');
  const repoId = requiredPositiveId(release.repo_id ?? repository.id, 'RELEASE_REPO_ID_REQUIRED', 'Release repo_id');
  const repoFullName = String(release.repo_full_name ?? repository.full_name ?? '');
  const repoName = String(release.repo_name ?? repository.name ?? '');
  if (!repoFullName || !repoName) {
    throw new ApiError(400, 'RELEASE_REPOSITORY_REQUIRED', 'Release repository full_name and name are required');
  }
  return [
    id,
    String(release.tag_name ?? ''),
    release.name ?? null,
    release.body ?? null,
    release.html_url ?? null,
    release.published_at ?? null,
    boolInt(release.prerelease),
    boolInt(release.draft),
    boolInt(release.is_read),
    jsonValue(release.assets),
    repoId,
    repoFullName,
    repoName,
    release.zipball_url ?? null,
    release.tarball_url ?? null,
  ];
}

async function upsertReleases(db: D1Database, releases: Row[]): Promise<number> {
  const statements = releases.map((release) => {
    const sql = typeof release.is_read === 'boolean' ? RELEASE_UPSERT_OVERWRITE_READ : RELEASE_UPSERT_PRESERVE_READ;
    return db.prepare(sql).bind(...releaseValues(release));
  });
  await batchInChunks(db, statements);
  return releases.length;
}

async function repositoriesRoute(request: Request, db: D1Database, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/repositories' && request.method === 'GET') {
    const page = integerParam(url.searchParams.get('page'), 1, 1, 1_000_000);
    const limit = integerParam(url.searchParams.get('limit'), 100, 1, 10_000);
    const offset = (page - 1) * limit;
    const search = url.searchParams.get('search')?.trim();
    let rows: Row[];
    let count: { total: number } | null;
    if (search) {
      const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      const where = "name LIKE ?1 ESCAPE '\\' OR full_name LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\' OR ai_summary LIKE ?1 ESCAPE '\\' OR ai_tags LIKE ?1 ESCAPE '\\'";
      rows = await all<Row>(db.prepare(`SELECT * FROM repositories WHERE ${where} ORDER BY stargazers_count DESC LIMIT ?2 OFFSET ?3`).bind(pattern, limit, offset));
      count = await first<{ total: number }>(db.prepare(`SELECT COUNT(*) AS total FROM repositories WHERE ${where}`).bind(pattern));
    } else {
      rows = await all<Row>(db.prepare('SELECT * FROM repositories ORDER BY stargazers_count DESC LIMIT ?1 OFFSET ?2').bind(limit, offset));
      count = await first<{ total: number }>(db.prepare('SELECT COUNT(*) AS total FROM repositories'));
    }
    const revision = await first<{ value: string | null }>(db.prepare("SELECT value FROM settings WHERE key = 'repositories_revision'"));
    return json({ repositories: rows.map(transformRepository), total: Number(count?.total ?? 0), page, limit, revision: Number(revision?.value ?? 0) });
  }
  if (url.pathname === '/api/repositories' && request.method === 'PUT') {
    const body = await readJson<Row>(request);
    if (!Array.isArray(body.repositories)) throw new ApiError(400, 'REPOSITORIES_ARRAY_REQUIRED', 'repositories array is required');
    const current = await first<{ value: string | null }>(db.prepare("SELECT value FROM settings WHERE key = 'repositories_revision'"));
    const currentRevision = Number(current?.value ?? 0);
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== currentRevision) {
      throw new ApiError(409, 'SYNC_CONFLICT', 'Repository data changed on another device; refresh before saving', { revision: currentRevision });
    }
    const count = await upsertRepositories(db, body.repositories as Row[], body.isFullSync === true);
    const nextRevision = currentRevision + 1;
    await db.prepare("INSERT INTO settings (key, value) VALUES ('repositories_revision', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(String(nextRevision)).run();
    return json({ upserted: count, revision: nextRevision });
  }
  const match = url.pathname.match(/^\/api\/repositories\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  if (request.method === 'PATCH') {
    const body = await readJson<Row>(request);
    const transforms: Record<string, (value: unknown) => unknown> = {
      ai_summary: (value) => value ?? null,
      ai_tags: jsonValue,
      ai_platforms: jsonValue,
      analyzed_at: (value) => value ?? null,
      analysis_failed: boolInt,
      custom_description: (value) => value ?? null,
      custom_tags: jsonValue,
      custom_category: (value) => value ?? null,
      category_locked: boolInt,
      last_edited: (value) => value ?? null,
      subscribed_to_releases: boolInt,
      vector_indexed_at: (value) => value || null,
      vector_indexed_license: licenseId,
      description: (value) => value ?? null,
      name: (value) => value,
    };
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, transform] of Object.entries(transforms)) {
      if (key in body) {
        clauses.push(`${key} = ?${clauses.length + 1}`);
        values.push(transform(body[key]));
      }
    }
    if (!clauses.length) throw new ApiError(400, 'NO_VALID_FIELDS', 'No valid fields to update');
    await db.prepare(`UPDATE repositories SET ${clauses.join(', ')} WHERE id = ?${clauses.length + 1}`).bind(...values, id).run();
    const revision = await bumpRepositoryRevision(db, Number((await first<{ value: string | null }>(db.prepare("SELECT value FROM settings WHERE key = 'repositories_revision'")))?.value ?? 0));
    const row = await first<Row>(db.prepare('SELECT * FROM repositories WHERE id = ?1').bind(id));
    if (!row) throw new ApiError(404, 'REPOSITORY_NOT_FOUND', 'Repository not found');
    return json({ ...transformRepository(row), revision });
  }
  if (request.method === 'DELETE') {
    const results = await db.batch([
      db.prepare('DELETE FROM releases WHERE repo_id = ?1').bind(id),
      db.prepare('DELETE FROM repositories WHERE id = ?1').bind(id),
    ]);
    if (!results[1].meta.changes) throw new ApiError(404, 'REPOSITORY_NOT_FOUND', 'Repository not found');
    const current = Number((await first<{ value: string | null }>(db.prepare("SELECT value FROM settings WHERE key = 'repositories_revision'")))?.value ?? 0);
    const revision = await bumpRepositoryRevision(db, current);
    return json({ deleted: true, id, releasesDeleted: results[0].meta.changes, revision });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported repository method');
}

async function releasesRoute(request: Request, db: D1Database, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/releases' && request.method === 'GET') {
    const page = integerParam(url.searchParams.get('page'), 1, 1, 1_000_000);
    const limit = integerParam(url.searchParams.get('limit'), 50, 1, 10_000);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const repoId = url.searchParams.get('repo_id');
    if (repoId) {
      conditions.push(`repo_id = ?${values.length + 1}`);
      values.push(Number(repoId));
    }
    if (url.searchParams.get('unread') === 'true') conditions.push('is_read = 0');
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = await all<Row>(
      db.prepare(`SELECT * FROM releases${where} ORDER BY published_at DESC LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`)
        .bind(...values, limit, offset),
    );
    const count = await first<{ total: number }>(db.prepare(`SELECT COUNT(*) AS total FROM releases${where}`).bind(...values));
    return json({ releases: rows.map(transformRelease), total: Number(count?.total ?? 0), page, limit });
  }
  if (url.pathname === '/api/releases' && request.method === 'PUT') {
    const body = await readJson<Row>(request);
    if (!Array.isArray(body.releases)) throw new ApiError(400, 'RELEASES_ARRAY_REQUIRED', 'releases array is required');
    return json({ upserted: await upsertReleases(db, body.releases as Row[]) });
  }
  if (url.pathname === '/api/releases/mark-all-read' && request.method === 'POST') {
    const result = await db.prepare('UPDATE releases SET is_read = 1').run();
    return json({ updated: result.meta.changes });
  }
  const match = url.pathname.match(/^\/api\/releases\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  if (request.method === 'PATCH') {
    const body = await readJson<Row>(request);
    if (typeof body.is_read !== 'boolean') throw new ApiError(400, 'IS_READ_REQUIRED', 'is_read field is required');
    await db.prepare('UPDATE releases SET is_read = ?1 WHERE id = ?2').bind(body.is_read ? 1 : 0, id).run();
    const row = await first<Row>(db.prepare('SELECT * FROM releases WHERE id = ?1').bind(id));
    if (!row) throw new ApiError(404, 'RELEASE_NOT_FOUND', 'Release not found');
    return json(transformRelease(row));
  }
  if (request.method === 'DELETE') {
    const result = await db.prepare('DELETE FROM releases WHERE id = ?1').bind(id).run();
    if (!result.meta.changes) throw new ApiError(404, 'RELEASE_NOT_FOUND', 'Release not found');
    return json({ deleted: true, id });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported release method');
}

interface CollectionDescriptor {
  path: '/api/categories' | '/api/asset-filters';
  table: 'categories' | 'asset_filters';
  select: string;
  insert: string;
  values(body: Row, id: string): unknown[];
  transform(row: Row): Row;
}

const COLLECTIONS: CollectionDescriptor[] = [
  {
    path: '/api/categories',
    table: 'categories',
    select: 'SELECT * FROM categories ORDER BY sort_order ASC, name ASC',
    insert: `INSERT INTO categories (id, name, description, icon, keywords, color, sort_order, is_custom)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
        icon=excluded.icon, keywords=excluded.keywords, color=excluded.color, sort_order=excluded.sort_order`,
    values: (body, id) => [id, String(body.name ?? ''), body.description ?? null, String(body.icon ?? '📁'), jsonValue(body.keywords), body.color ?? null, Number(body.sort_order ?? 0)],
    transform: transformCategory,
  },
  {
    path: '/api/asset-filters',
    table: 'asset_filters',
    select: 'SELECT * FROM asset_filters ORDER BY sort_order ASC, name ASC',
    insert: `INSERT INTO asset_filters (id, name, description, keywords, platform, sort_order)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
        keywords=excluded.keywords, platform=excluded.platform, sort_order=excluded.sort_order`,
    values: (body, id) => [id, String(body.name ?? ''), body.description ?? null, jsonValue(body.keywords), body.platform ?? null, Number(body.sort_order ?? 0)],
    transform: transformAssetFilter,
  },
];

async function collectionRoute(request: Request, db: D1Database, url: URL): Promise<Response | null> {
  for (const descriptor of COLLECTIONS) {
    if (url.pathname === descriptor.path && request.method === 'GET') {
      return json((await all<Row>(db.prepare(descriptor.select))).map(descriptor.transform));
    }
    if (url.pathname === descriptor.path && request.method === 'POST') {
      const body = await readJson<Row>(request);
      const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID();
      await db.prepare(descriptor.insert).bind(...descriptor.values(body, id)).run();
      const row = await first<Row>(db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?1`).bind(id));
      return json(descriptor.transform(row ?? {}), 201);
    }
    const match = url.pathname.match(new RegExp(`^${descriptor.path}/([^/]+)$`));
    if (!match) continue;
    const id = decodeURIComponent(match[1]);
    if (request.method === 'PUT') {
      const body = await readJson<Row>(request);
      await db.prepare(descriptor.insert).bind(...descriptor.values(body, id)).run();
      const row = await first<Row>(db.prepare(`SELECT * FROM ${descriptor.table} WHERE id = ?1`).bind(id));
      return json(descriptor.transform(row ?? {}));
    }
    if (request.method === 'DELETE') {
      const result = await db.prepare(`DELETE FROM ${descriptor.table} WHERE id = ?1`).bind(id).run();
      if (!result.meta.changes) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');
      return json({ deleted: true });
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported collection method');
  }
  return null;
}

async function syncRoute(
  request: Request,
  db: D1Database,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === '/api/sync/auth' && request.method === 'POST') {
    const encrypted = await getSetting(db, 'github_token');
    return json({ configured: Boolean(encrypted) });
  }
  return null;
}

export async function handleApiRoute(
  request: Request,
  db: D1Database,
  url: URL,
): Promise<Response | null> {
  const handlers = [
    () => repositoriesRoute(request, db, url),
    () => releasesRoute(request, db, url),
    () => collectionRoute(request, db, url),
    () => syncRoute(request, db, url),
  ];
  for (const handler of handlers) {
    const response = await handler();
    if (response) return response;
  }
  return null;
}
