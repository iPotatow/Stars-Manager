import type {
  AIConfig,
  AssetFilter,
  Category,
  DiscoveryRepo,
  Release,
  ReleaseSourceSettings,
  SearchFilters,
  SubscriptionChannel,
  SubscriptionRepo,
  Repository,
} from '../types';

/**
 * Stable, app-owned interchange format for local data transfer.
 *
 * This is intentionally separate from the Vue store persistence shape and from
 * any upstream project's export format. Secrets are represented by the
 * caller's masked config values and are never enabled by a snapshot flag.
 */
export interface DataSnapshotPayload {
  repositories?: Repository[];
  releases?: Release[];
  aiConfigs?: AIConfig[];
  customCategories?: Category[];
  assetFilters?: AssetFilter[];
  discoveryRepos?: Record<string, DiscoveryRepo[]>;
  discoveryTotalCount?: Record<string, number>;
  discoveryHasMore?: Record<string, boolean>;
  discoveryNextPage?: Record<string, number>;
  subscriptionRepos?: Record<string, SubscriptionRepo[]>;
  subscriptionLastRefresh?: Record<string, string | null>;
  subscriptionChannels?: SubscriptionChannel[];
  releaseSubscriptions?: number[];
  releaseSourceSettings?: ReleaseSourceSettings;
  readReleases?: number[];
  searchFilters?: SearchFilters;
  hiddenDefaultCategoryIds?: string[];
  defaultCategoryOverrides?: Record<string, Partial<Category>>;
  categoryOrder?: string[];
  language?: 'zh' | 'en';
  isSidebarCollapsed?: boolean;
  releaseViewMode?: 'timeline' | 'repository';
  releaseSelectedFilters?: string[];
  releaseSearchQuery?: string;
  releaseExpandedRepositories?: number[];
}

export interface DataSnapshot {
  kind: 'stars-manager.data';
  schemaVersion: 2;
  createdAt: string;
  appVersion: string;
  payload: DataSnapshotPayload;
}

interface LegacySnapshot {
  version?: unknown;
  exportDate?: unknown;
  appVersion?: unknown;
  data?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const withoutRemovedFields = (value: Record<string, unknown>): DataSnapshotPayload => {
  const payload = { ...value } as DataSnapshotPayload & Record<string, unknown>;
  delete payload.webdavConfigs;
  delete payload.includeKeysInBackup;
  return payload;
};

/** Accept the new format and migrate the old local export envelope. */
export function parseDataSnapshot(value: unknown): DataSnapshot | null {
  if (isRecord(value)
    && value.kind === 'stars-manager.data'
    && value.schemaVersion === 2
    && typeof value.createdAt === 'string'
    && typeof value.appVersion === 'string'
    && isRecord(value.payload)) {
    return {
      kind: 'stars-manager.data',
      schemaVersion: 2,
      createdAt: value.createdAt,
      appVersion: value.appVersion,
      payload: withoutRemovedFields(value.payload),
    };
  }

  if (!isRecord(value)) return null;
  const legacy = value as LegacySnapshot;
  if (typeof legacy.version !== 'string' || !isRecord(legacy.data)) return null;

  return {
    kind: 'stars-manager.data',
    schemaVersion: 2,
    createdAt: typeof legacy.exportDate === 'string' ? legacy.exportDate : new Date(0).toISOString(),
    appVersion: typeof legacy.appVersion === 'string' ? legacy.appVersion : 'legacy',
    payload: withoutRemovedFields(legacy.data),
  };
}
