import { createGitHubApiService } from './githubApiFactory';
import { forceSyncToBackend } from './autoSync';
import { logger } from './logger';
import { useAppStore } from '../store/useAppStore';

const DAILY_SYNC_LOCK_PREFIX = 'gsm:star-sync-lock:v1:';
const DAILY_SYNC_LOCK_TTL_MS = 10 * 60 * 1000;

type DailySyncMarker = {
  status: 'in-flight' | 'completed';
  owner: string;
  dateKey: string;
  expiresAt: number;
};

export interface StarSyncResult {
  newRepoCount: number;
  repositoriesCount: number;
}

export type DailyStarSyncResult =
  | ({ synced: true } & StarSyncResult)
  | { synced: false; reason: 'not-authenticated' | 'already-synced' | 'in-flight' };

/** Return a calendar date in the user's local timezone. */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Compare timestamps by local calendar day rather than UTC day. */
export function hasSyncedToday(lastSync: string | null, now: Date = new Date()): boolean {
  if (!lastSync) return false;
  const parsed = new Date(lastSync);
  return !Number.isNaN(parsed.getTime()) && getLocalDateKey(parsed) === getLocalDateKey(now);
}

function dailySyncStorageKey(login: string): string {
  return `${DAILY_SYNC_LOCK_PREFIX}${encodeURIComponent(login)}`;
}

function readDailySyncMarker(storageKey: string): DailySyncMarker | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const marker = JSON.parse(raw) as Partial<DailySyncMarker>;
    if (
      (marker.status !== 'in-flight' && marker.status !== 'completed')
      || typeof marker.owner !== 'string'
      || typeof marker.dateKey !== 'string'
      || typeof marker.expiresAt !== 'number'
    ) {
      return null;
    }
    return marker as DailySyncMarker;
  } catch {
    return null;
  }
}

function writeDailySyncMarker(storageKey: string, marker: DailySyncMarker): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(marker));
    return true;
  } catch {
    // Private browsing and storage quotas should not block a normal sync.
    return false;
  }
}

type DailySyncLease = {
  acquired: boolean;
  reason?: 'already-synced' | 'in-flight';
  release: () => void;
};

function acquireDailySyncLease(login: string, dateKey: string, now = Date.now()): DailySyncLease {
  if (typeof window === 'undefined') {
    return { acquired: true, release: () => undefined };
  }

  const storageKey = dailySyncStorageKey(login);
  const existing = readDailySyncMarker(storageKey);
  if (existing?.dateKey === dateKey && existing.status === 'completed') {
    return { acquired: false, reason: 'already-synced', release: () => undefined };
  }
  if (existing?.dateKey === dateKey && existing.status === 'in-flight' && existing.expiresAt > now) {
    return { acquired: false, reason: 'in-flight', release: () => undefined };
  }

  const owner = `${now}-${Math.random().toString(36).slice(2)}`;
  const marker: DailySyncMarker = {
    status: 'in-flight',
    owner,
    dateKey,
    expiresAt: now + DAILY_SYNC_LOCK_TTL_MS,
  };

  // Confirm ownership after writing. This prevents two tabs that both read an
  // expired marker from proceeding with the lock that the other tab won.
  if (!writeDailySyncMarker(storageKey, marker)) {
    return { acquired: true, release: () => undefined };
  }
  const stored = readDailySyncMarker(storageKey);
  if (stored?.owner !== owner || stored.status !== 'in-flight') {
    return { acquired: false, reason: 'in-flight', release: () => undefined };
  }

  return {
    acquired: true,
    release: () => {
      const current = readDailySyncMarker(storageKey);
      if (current?.owner !== owner || typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage cleanup failures.
      }
    },
  };
}

function markDailySyncCompleted(login: string, dateKey: string): void {
  const storageKey = dailySyncStorageKey(login);
  writeDailySyncMarker(storageKey, {
    status: 'completed',
    owner: 'completed',
    dateKey,
    expiresAt: Number.MAX_SAFE_INTEGER,
  });
}

function mergeStarredRepositories(
  incomingRepositories: Awaited<ReturnType<ReturnType<typeof createGitHubApiService>['getAllStarredRepositories']>>,
  localRepositories: ReturnType<typeof useAppStore.getState>['repositories'],
) {
  const existingRepoMap = new Map(localRepositories.map((repo) => [repo.id, repo]));
  return incomingRepositories.map((newRepo) => {
    const existing = existingRepoMap.get(newRepo.id);
    if (!existing) return newRepo;

    return {
      ...existing,
      name: newRepo.name,
      full_name: newRepo.full_name,
      description: newRepo.description,
      html_url: newRepo.html_url,
      stargazers_count: newRepo.stargazers_count,
      forks_count: newRepo.forks_count,
      forks: newRepo.forks,
      language: newRepo.language,
      updated_at: newRepo.updated_at,
      pushed_at: newRepo.pushed_at,
      starred_at: newRepo.starred_at,
      owner: newRepo.owner,
      topics: newRepo.topics,
      // GitHub is the source of truth for this source metadata.
      license: newRepo.license ?? null,
    };
  });
}

async function runStarredRepositorySync(): Promise<StarSyncResult> {
  const initialState = useAppStore.getState();
  const login = initialState.user?.login;
  if (!login || !initialState.githubToken) {
    throw new Error('GitHub session is not available');
  }

  initialState.setSyncingStars(true);
  const syncDateKey = getLocalDateKey();
  try {
    const githubApi = createGitHubApiService();
    const incomingRepositories = await githubApi.getAllStarredRepositories();

    const currentState = useAppStore.getState();
    if (currentState.user?.login !== login || !currentState.githubToken) {
      throw new Error('GitHub session changed during sync');
    }

    const mergedRepositories = mergeStarredRepositories(incomingRepositories, currentState.repositories);
    const existingRepoIds = new Set(currentState.repositories.map((repo) => repo.id));
    const newRepoCount = incomingRepositories.filter((repo) => !existingRepoIds.has(repo.id)).length;

    currentState.setRepositories(mergedRepositories);
    const persisted = await forceSyncToBackend();
    if (!persisted) {
      throw new Error('Starred repositories were fetched but could not be saved to the backend');
    }

    useAppStore.getState().setLastSync(new Date().toISOString());
    markDailySyncCompleted(login, syncDateKey);
    logger.info('starSync', 'Synced starred repositories', {
      login,
      repositoriesCount: mergedRepositories.length,
      newRepoCount,
    });
    return { newRepoCount, repositoriesCount: mergedRepositories.length };
  } finally {
    useAppStore.getState().setSyncingStars(false);
  }
}

let _starredSyncPromise: Promise<StarSyncResult> | null = null;

/** Run the GitHub Star sync, sharing one in-flight request across callers. */
export function syncStarredRepositories(): Promise<StarSyncResult> {
  if (_starredSyncPromise) return _starredSyncPromise;

  _starredSyncPromise = (async () => {
    try {
      return await runStarredRepositorySync();
    } catch (error) {
      logger.warn('starSync', 'Starred repository sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      _starredSyncPromise = null;
    }
  })();

  return _starredSyncPromise;
}

/** Run the sync at most once per local calendar day for this GitHub account. */
export async function syncStarredRepositoriesIfNeeded(): Promise<DailyStarSyncResult> {
  const state = useAppStore.getState();
  const login = state.user?.login;
  if (!login || !state.githubToken) {
    return { synced: false, reason: 'not-authenticated' };
  }

  const now = new Date();
  const dateKey = getLocalDateKey(now);
  if (hasSyncedToday(state.lastSync, now)) {
    return { synced: false, reason: 'already-synced' };
  }

  const lease = acquireDailySyncLease(login, dateKey);
  if (!lease.acquired) {
    return { synced: false, reason: lease.reason ?? 'in-flight' };
  }

  try {
    // Re-read after acquiring the lease in case a manual sync completed while
    // another tab was contending for the same daily run.
    const latestState = useAppStore.getState();
    if (hasSyncedToday(latestState.lastSync, now)) {
      return { synced: false, reason: 'already-synced' };
    }

    const result = await syncStarredRepositories();
    return { synced: true, ...result };
  } finally {
    lease.release();
  }
}
