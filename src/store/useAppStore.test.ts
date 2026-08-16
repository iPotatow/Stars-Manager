import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingConfig, Release, Repository, VectorSearchConfig } from '../types';
import { EMBEDDING_FORMAT_VERSION, indexAllRepos } from '../services/vectorSearchService';

let useAppStore: typeof import('./useAppStore').useAppStore;
let normalizePersistedState: typeof import('./useAppStore').normalizePersistedState;

beforeAll(async () => {
  const { indexedDBStorage } = await vi.importActual<typeof import('../services/indexedDbStorage')>('../services/indexedDbStorage');
  window.localStorage?.removeItem?.('stars-manager');
  window.localStorage?.removeItem?.('github-stars-manager');
  await indexedDBStorage.removeItem('stars-manager');
  await indexedDBStorage.removeItem('github-stars-manager');
  ({ useAppStore, normalizePersistedState } = await vi.importActual<typeof import('./useAppStore')>('./useAppStore'));
});

const createRepository = (id: number, overrides: Partial<Repository> = {}): Repository => ({
  id,
  name: `repo-${id}`,
  full_name: `owner/repo-${id}`,
  description: 'A test repository',
  html_url: `https://github.com/owner/repo-${id}`,
  stargazers_count: 10,
  forks_count: 1,
  forks: 1,
  language: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  pushed_at: '2026-01-03T00:00:00.000Z',
  owner: {
    login: 'owner',
    avatar_url: 'https://github.com/avatar.png',
  },
  topics: ['test'],
  ...overrides,
});

describe('useAppStore release add/upsert actions', () => {
  const makeRelease = (id: number, overrides: Partial<Release> = {}): Release => ({
    id,
    tag_name: `v${id}`,
    name: `Release ${id}`,
    body: null,
    published_at: '2026-01-01T00:00:00.000Z',
    html_url: `https://github.com/owner/repo/releases/tag/v${id}`,
    assets: [
      {
        id: 100 + id,
        name: 'app.dmg',
        size: 1000,
        download_count: 0,
        browser_download_url: 'https://example.com/app.dmg',
        content_type: 'application/octet-stream',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    repository: { id: 1, full_name: 'owner/repo', name: 'repo' },
    ...overrides,
  });

  beforeEach(() => {
    useAppStore.setState({
      releaseSubscriptions: new Set<number>(),
      releases: [],
      readReleases: new Set<number>(),
    });
  });

  it('addReleases only appends new ids', () => {
    useAppStore.getState().addReleases([makeRelease(1), makeRelease(2)]);
    useAppStore.getState().addReleases([makeRelease(2), makeRelease(3)]);
    expect(useAppStore.getState().releases.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('upsertReleases updates assets/metadata but preserves is_read', () => {
    useAppStore.getState().addReleases([makeRelease(1, { is_read: true })]);

    const updated = makeRelease(1, {
      name: 'Updated name',
      assets: [{ ...makeRelease(1).assets[0], size: 9999 }],
    });
    useAppStore.getState().upsertReleases([updated]);

    const result = useAppStore.getState().releases[0];
    expect(result.name).toBe('Updated name');
    expect(result.assets[0].size).toBe(9999);
    expect(result.is_read).toBe(true);
  });

  it('upsertReleases ignores ids not present in store', () => {
    useAppStore.getState().addReleases([makeRelease(1)]);
    useAppStore.getState().upsertReleases([makeRelease(99)]);
    expect(useAppStore.getState().releases.map(r => r.id)).toEqual([1]);
  });
});

describe('useAppStore vector search config normalization', () => {
  const embeddingConfig: EmbeddingConfig = {
    id: 'emb-1',
    name: 'Test Embedding',
    apiType: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    apiKey: 'test-key',
    model: 'test-model',
    dimensions: 1024,
    isActive: true,
  };

  it('preserves full vectorSearchConfig during persisted-state hydration', () => {
    const normalized = normalizePersistedState({
      embeddingConfigs: [embeddingConfig],
      activeEmbeddingConfig: embeddingConfig.id,
      vectorSearchConfig: {
        enabled: true,
        embeddingConfigId: embeddingConfig.id,
        indexMode: 'description',
        readmeMaxChars: 4096,
        searchThreshold: 0,
        searchTopK: 12,
        enableHyDE: false,
        enableReranking: false,
        embeddingFormatVersion: 2,
      },
    }, useAppStore.getState());

    expect(normalized.vectorSearchConfig).toEqual({
      enabled: true,
      embeddingConfigId: embeddingConfig.id,
      indexMode: 'description',
      readmeMaxChars: 4096,
      searchThreshold: 0,
      searchTopK: 12,
      enableHyDE: false,
      enableReranking: false,
      embeddingFormatVersion: 2,
    });
  });

  it('defaults missing vectorSearchConfig fields for old persisted state', () => {
    const normalized = normalizePersistedState({
      embeddingConfigs: [embeddingConfig],
      vectorSearchConfig: {
        enabled: true,
        embeddingConfigId: embeddingConfig.id,
        indexMode: 'readme',
        readmeMaxChars: 6000,
      },
    }, useAppStore.getState());

    expect(normalized.vectorSearchConfig).toMatchObject({
      enabled: true,
      embeddingConfigId: embeddingConfig.id,
      indexMode: 'readme',
      readmeMaxChars: 6000,
      searchThreshold: 0.35,
      searchTopK: 30,
      enableHyDE: true,
      enableReranking: true,
      embeddingFormatVersion: 1,
    });
  });

  it('uses the latest format version for a fresh/reset config so new users are not forced into a full reindex', () => {
    const normalized = normalizePersistedState(
      { embeddingConfigs: [embeddingConfig] },
      useAppStore.getState()
    );

    expect(normalized.vectorSearchConfig?.embeddingFormatVersion).toBe(EMBEDDING_FORMAT_VERSION);
  });

  const baseVectorSearchConfig: VectorSearchConfig = {
    enabled: true,
    embeddingConfigId: embeddingConfig.id,
    indexMode: 'readme',
    readmeMaxChars: 6000,
    searchThreshold: 0.35,
    searchTopK: 30,
    enableHyDE: true,
    enableReranking: true,
    embeddingFormatVersion: EMBEDDING_FORMAT_VERSION,
  };

  beforeEach(() => {
    useAppStore.setState({
      embeddingConfigs: [embeddingConfig],
      vectorSearchConfig: { ...baseVectorSearchConfig },
    });
  });

  it('does not downgrade embeddingFormatVersion from stale runtime config updates', () => {
    useAppStore.getState().setVectorSearchConfig({ embeddingFormatVersion: 1 });

    expect(useAppStore.getState().vectorSearchConfig.embeddingFormatVersion).toBe(EMBEDDING_FORMAT_VERSION);
  });

  it('merges ordinary config fields while preserving current embeddingFormatVersion', () => {
    useAppStore.getState().setVectorSearchConfig({
      searchTopK: 22,
      embeddingFormatVersion: 1,
    });

    expect(useAppStore.getState().vectorSearchConfig).toMatchObject({
      searchTopK: 22,
      embeddingFormatVersion: EMBEDDING_FORMAT_VERSION,
    });
  });

  it('allows runtime upgrades from legacy to the latest embeddingFormatVersion', () => {
    useAppStore.setState({
      vectorSearchConfig: { ...baseVectorSearchConfig, embeddingFormatVersion: 1 },
    });

    useAppStore.getState().setVectorSearchConfig({ embeddingFormatVersion: EMBEDDING_FORMAT_VERSION });

    expect(useAppStore.getState().vectorSearchConfig.embeddingFormatVersion).toBe(EMBEDDING_FORMAT_VERSION);
  });

  it('ignores invalid runtime embeddingFormatVersion updates', () => {
    useAppStore.getState().setVectorSearchConfig({
      embeddingFormatVersion: EMBEDDING_FORMAT_VERSION + 1,
    });

    expect(useAppStore.getState().vectorSearchConfig.embeddingFormatVersion).toBe(EMBEDDING_FORMAT_VERSION);
  });

  it('keeps incremental indexing scoped to newly analyzed repos after a stale backend config sync', async () => {
    useAppStore.getState().setVectorSearchConfig({ embeddingFormatVersion: 1 });
    expect(useAppStore.getState().vectorSearchConfig.embeddingFormatVersion).toBe(EMBEDDING_FORMAT_VERSION);

    const indexedIds: number[] = [];
    const client = {
      embed: vi.fn(async (texts: string[]) => texts.map((_, i) => [i, i + 1, i + 2])),
    } as unknown as Parameters<typeof indexAllRepos>[1];
    const vectorService = {
      upsert: vi.fn(async (vectors: Array<{ id: string }>) => ({ upserted: vectors.length })),
    } as unknown as Parameters<typeof indexAllRepos>[2];

    const result = await indexAllRepos([
      createRepository(1, { analyzed_at: '2026-01-04T00:00:00.000Z', vector_indexed_at: '2026-01-05T00:00:00.000Z' }),
      createRepository(2, { analyzed_at: '2026-01-04T00:00:00.000Z', vector_indexed_at: '2026-01-05T00:00:00.000Z' }),
      createRepository(3, { analyzed_at: '2026-01-06T00:00:00.000Z', vector_indexed_at: undefined }),
      createRepository(4, { analyzed_at: undefined, vector_indexed_at: undefined }),
    ], client, vectorService, {
      incremental: true,
      formatVersion: useAppStore.getState().vectorSearchConfig.embeddingFormatVersion,
      currentFormatVersion: EMBEDDING_FORMAT_VERSION,
      indexMode: 'description',
      onRepoIndexed: (repoId) => indexedIds.push(repoId),
    });

    expect(indexedIds).toEqual([3]);
    expect(result.indexedRepoIds).toEqual([3]);
  });
});

describe('useAppStore repository performance guards', () => {
  beforeEach(() => {
    useAppStore.setState({
      repositories: [],
      searchResults: [],
      analyzingRepositoryIds: new Set(),
    });
  });

  it('does not notify subscribers when updateRepository receives an equivalent repository', () => {
    const repo = createRepository(1);
    useAppStore.setState({ repositories: [repo], searchResults: [repo] });

    const previousRepositories = useAppStore.getState().repositories;
    const previousSearchResults = useAppStore.getState().searchResults;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications++;
    });

    useAppStore.getState().updateRepository({ ...repo });
    unsubscribe();

    expect(notifications).toBe(0);
    expect(useAppStore.getState().repositories).toBe(previousRepositories);
    expect(useAppStore.getState().searchResults).toBe(previousSearchResults);
  });

  it('updates only lists that contain the repository', () => {
    const repo = createRepository(1);
    useAppStore.setState({ repositories: [repo], searchResults: [] });

    const previousSearchResults = useAppStore.getState().searchResults;
    useAppStore.getState().updateRepository({ ...repo, ai_summary: 'Updated summary' });

    expect(useAppStore.getState().repositories[0].ai_summary).toBe('Updated summary');
    expect(useAppStore.getState().searchResults).toBe(previousSearchResults);
  });

  it('does not notify subscribers when analyzing state is unchanged', () => {
    useAppStore.setState({ analyzingRepositoryIds: new Set([1]) });

    const previousAnalyzingIds = useAppStore.getState().analyzingRepositoryIds;
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications++;
    });

    useAppStore.getState().setAnalyzingRepository(1, true);
    unsubscribe();

    expect(notifications).toBe(0);
    expect(useAppStore.getState().analyzingRepositoryIds).toBe(previousAnalyzingIds);
  });
});

describe('useAppStore auth localStorage mirror (Issue #259)', () => {
  const AUTH_MIRROR_KEY = 'stars-manager-auth';
  const user = { id: 1, login: 'test-user', name: 'Test', avatar_url: 'https://x/a.png', email: null };

  beforeEach(() => {
    window.localStorage?.removeItem?.(AUTH_MIRROR_KEY);
  });

  it('persists auth to the synchronous localStorage mirror on login', () => {
    useAppStore.getState().setGitHubToken('ghp_xxx');
    useAppStore.getState().setUser(user);

    const raw = window.localStorage.getItem(AUTH_MIRROR_KEY);
    const mirror = JSON.parse(raw || '{}');
    expect(mirror.githubToken).toBe('worker-managed');
    expect(mirror.user.login).toBe('test-user');
  });

  it('clears the auth mirror on logout without persisting a backend secret', () => {
    useAppStore.getState().setGitHubToken('ghp_xxx');
    useAppStore.getState().setUser(user);
    useAppStore.getState().logout();
    expect(window.localStorage.getItem(AUTH_MIRROR_KEY)).toBeNull();
    expect(useAppStore.getState().githubToken).toBeNull();
  });

  it('restores auth from the mirror when the persisted snapshot lacks credentials', () => {
    // Simulate the reported bug: async IndexedDB write never landed, so the
    // persisted snapshot has empty auth while the mirror holds the real values.
    window.localStorage.setItem(
      AUTH_MIRROR_KEY,
      JSON.stringify({ user, githubToken: 'ghp_restored' })
    );

    const normalized = normalizePersistedState({}, useAppStore.getState());
    expect(normalized.user).toEqual(user);
    expect(normalized.githubToken).toBe('worker-managed');
    expect(normalized.isAuthenticated).toBe(true);
  });

  it('prefers persisted credentials over the mirror when both exist', () => {
    window.localStorage.setItem(
      AUTH_MIRROR_KEY,
      JSON.stringify({ user, githubToken: 'ghp_mirror' })
    );
    const otherUser = { id: 2, login: 'other', name: 'Other', avatar_url: 'https://x/b.png', email: null };

    const normalized = normalizePersistedState(
      { user: otherUser, githubToken: 'ghp_persisted' },
      useAppStore.getState()
    );
    expect(normalized.user).toEqual(otherUser);
    expect(normalized.githubToken).toBe('worker-managed');
  });
});
