import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAllStarredRepositories, forceSyncToBackend } = vi.hoisted(() => ({
  getAllStarredRepositories: vi.fn(),
  forceSyncToBackend: vi.fn(),
}));

vi.mock('./githubApiFactory', () => ({
  createGitHubApiService: () => ({ getAllStarredRepositories }),
}));

vi.mock('./autoSync', () => ({ forceSyncToBackend }));

import { useAppStore } from '../store/useAppStore';
import { getLocalDateKey, hasSyncedToday, syncStarredRepositories, syncStarredRepositoriesIfNeeded } from './starSync';

const getState = useAppStore as unknown as { getState: () => StarSyncTestState };

type StarSyncTestState = {
  user: { login: string } | null;
  githubToken: string | null;
  repositories: Array<Record<string, unknown>>;
  lastSync: string | null;
  setRepositories: (repositories: Array<Record<string, unknown>>) => void;
  setLastSync: (lastSync: string) => void;
  setSyncingStars: (isSyncing: boolean) => void;
};

let state: StarSyncTestState;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  state = {
    user: { login: 'test-user' },
    githubToken: 'worker-managed',
    repositories: [],
    lastSync: null,
    setRepositories: (repositories) => { state.repositories = repositories; },
    setLastSync: (lastSync) => { state.lastSync = lastSync; },
    setSyncingStars: vi.fn(),
  };
  getState.getState = () => state;
  getAllStarredRepositories.mockResolvedValue([]);
  forceSyncToBackend.mockResolvedValue(true);
});

describe('daily starred repository sync date checks', () => {
  it('uses the local calendar date', () => {
    const localDate = new Date(2026, 7, 15, 9, 30, 0);

    expect(getLocalDateKey(localDate)).toBe('2026-08-15');
    expect(hasSyncedToday(localDate.toISOString(), localDate)).toBe(true);
  });

  it('does not treat a previous local day as synced today', () => {
    const now = new Date(2026, 7, 15, 0, 15, 0);
    const previousDay = new Date(2026, 7, 14, 23, 59, 0);

    expect(hasSyncedToday(previousDay.toISOString(), now)).toBe(false);
  });

  it('rejects missing and invalid timestamps', () => {
    const now = new Date(2026, 7, 15, 12, 0, 0);

    expect(hasSyncedToday(null, now)).toBe(false);
    expect(hasSyncedToday('not-a-date', now)).toBe(false);
  });

  it('shares one in-flight sync and records a successful daily run', async () => {
    getAllStarredRepositories.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve([]), 5);
    }));

    const first = syncStarredRepositories();
    const second = syncStarredRepositories();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { newRepoCount: 0, repositoriesCount: 0 },
      { newRepoCount: 0, repositoriesCount: 0 },
    ]);
    expect(getAllStarredRepositories).toHaveBeenCalledTimes(1);
    expect(state.lastSync).not.toBeNull();

    await expect(syncStarredRepositoriesIfNeeded()).resolves.toEqual({
      synced: false,
      reason: 'already-synced',
    });
  });

  it('does not record lastSync when backend persistence fails', async () => {
    forceSyncToBackend.mockResolvedValue(false);

    await expect(syncStarredRepositories()).rejects.toThrow('could not be saved');
    expect(state.lastSync).toBeNull();
    expect(state.setSyncingStars).toHaveBeenLastCalledWith(false);
  });
});
