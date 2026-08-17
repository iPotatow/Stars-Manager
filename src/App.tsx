import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { RepositoryList } from './components/RepositoryList';
import { CategorySidebar } from './components/CategorySidebar';
import { ReleaseTimeline } from './components/ReleaseTimeline';
import { ForkTimeline } from './components/ForkTimeline';
import { DiscoveryView } from './components/DiscoveryView';
import { SettingsPanel } from './components/SettingsPanel';
import { GistView } from './components/GistView';
import { BackToTop } from './components/BackToTop';
import { useAppStore } from './store/useAppStore';
import { logger } from './services/logger';
import { backend } from './services/backendAdapter';
import { syncFromBackend, startAutoSync, stopAutoSync, tryRestoreAuthFromBackend } from './services/autoSync';
import { syncStarredRepositoriesIfNeeded } from './services/starSync';
import type { AppState, SearchFilters } from './types';

/**
 * Check if any search/filter/sort condition is active (non-default).
 * Used to decide whether to display searchResults or the full repository list.
 */
function hasActiveSearchFilters(filters: SearchFilters): boolean {
  return (
    !!filters.query.trim() ||
    filters.languages.length > 0 ||
    filters.tags.length > 0 ||
    filters.platforms.length > 0 ||
    filters.minStars !== undefined ||
    filters.maxStars !== undefined ||
    filters.isAnalyzed !== undefined ||
    filters.isSubscribed !== undefined ||
    filters.isEdited !== undefined ||
    filters.isCategoryLocked !== undefined ||
    filters.analysisFailed !== undefined ||
    filters.sortBy !== 'stars' ||
    filters.sortOrder !== 'desc'
  );
}

/**
 * Main repository view combining category sidebar, search bar, and repository list.
 * Switches between search results and full list based on active search filters.
 */
const RepositoriesView = React.memo(({
  repositories,
  searchResults,
  searchFilters,
  selectedCategory,
  onCategorySelect
}: {
  repositories: AppState['repositories'];
  searchResults: AppState['searchResults'];
  searchFilters: AppState['searchFilters'];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
}) => {
  const isActive = hasActiveSearchFilters(searchFilters);
  const similarView = useAppStore((state) => state.similarView);
  const exitSimilarView = useAppStore((state) => state.exitSimilarView);

  // 相似视图下用户发起搜索时，自动退出相似视图（搜索优先于相似浏览，避免界面歧义）
  useEffect(() => {
    if (similarView?.active && isActive) {
      exitSimilarView();
    }
  }, [similarView?.active, isActive, exitSimilarView]);

  // 相似仓库视图激活时，列表数据源切换为相似结果，且忽略分类过滤
  const listRepositories = similarView?.active
    ? similarView.similarResults
    : (isActive ? searchResults : repositories);

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-5">
      <CategorySidebar
        repositories={repositories}
        selectedCategory={selectedCategory}
        onCategorySelect={onCategorySelect}
      />
      <div className="min-w-0 flex-1 space-y-5">
        <SearchBar />
        <RepositoryList
          repositories={listRepositories}
          selectedCategory={similarView?.active ? 'all' : selectedCategory}
        />
      </div>
    </div>
  );
});
RepositoriesView.displayName = 'RepositoriesView';

const ReleasesView = React.memo(() => <ReleaseTimeline />);
ReleasesView.displayName = 'ReleasesView';

const GistsView = React.memo(() => <GistView />);
GistsView.displayName = 'GistsView';

const ForksView = React.memo(() => <ForkTimeline />);
ForksView.displayName = 'ForksView';

const DiscoveryViewRoute = React.memo(() => <DiscoveryView />);
DiscoveryViewRoute.displayName = 'DiscoveryViewRoute';

const SettingsView = React.memo(() => <SettingsPanel />);
SettingsView.displayName = 'SettingsView';

const VIEW_LABELS: Record<AppState['currentView'], { zh: string; en: string }> = {
  repositories: { zh: '仓库', en: 'Repositories' },
  gists: { zh: 'Gist', en: 'Gists' },
  releases: { zh: '发布', en: 'Releases' },
  forks: { zh: '复刻', en: 'Forks' },
  subscription: { zh: '趋势', en: 'Trending' },
  settings: { zh: '设置', en: 'Settings' },
};

const App: React.FC = () => {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const {
    user,
    githubToken,
    isAuthenticated,
    currentView,
    selectedCategory,
    hasHydrated,
    searchResults,
    searchFilters,
    repositories,
    language,
    lastSync,
    setSelectedCategory,
  } = useAppStore();

  useEffect(() => {
    // Bright-only product surface: remove any legacy persisted dark class.
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initBackend = async () => {
      try {
        await backend.init();
        if (backend.isAvailable && !cancelled) {
          // Issue #259: recover a session on a fresh browser/device. Only acts
          // when there is no local session and the backend is authenticated.
          // Run before the backend data pull so auth can complete before the
          // app decides whether to render LoginScreen.
          await tryRestoreAuthFromBackend();
        }
      } catch (err) {
        console.error('Failed to initialize backend:', err);
      } finally {
        if (!cancelled) {
          setRuntimeReady(true);
        }
      }
    };

    initBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated || !runtimeReady || !isAuthenticated || !backend.isAvailable || !backend.isSessionAuthenticated) return;

    let cancelled = false;
    const unsubscribe = startAutoSync();
    const runStartupSync = async () => {
      try {
        // Complete the D1 bootstrap before refreshing GitHub stars so the two
        // sources cannot overwrite each other during application startup.
        await syncFromBackend();
        if (cancelled) return;
        const result = await syncStarredRepositoriesIfNeeded();
        if (result.synced) {
          logger.info('app.sync', 'Automatic daily starred repository sync completed', {
            newRepoCount: result.newRepoCount,
            repositoriesCount: result.repositoriesCount,
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          logger.warn('app.sync', 'Initial backend or daily starred repository sync failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    void runStartupSync();

    return () => {
      cancelled = true;
      stopAutoSync(unsubscribe);
    };
  }, [hasHydrated, runtimeReady, isAuthenticated, user, githubToken]);

  const handleCategorySelect = useCallback((category: string) => {
    // 相似仓库视图下点击分类 = 离开相似视图并切换到该分类，避免交互歧义
    if (useAppStore.getState().similarView?.active) {
      useAppStore.getState().exitSimilarView();
    }
    setSelectedCategory(category);
  }, [setSelectedCategory]);

  const currentViewContent = useMemo(() => {
    switch (currentView) {
      case 'repositories':
        return (
          <RepositoriesView
            repositories={repositories}
            searchResults={searchResults}
            searchFilters={searchFilters}
            selectedCategory={selectedCategory}
            onCategorySelect={handleCategorySelect}
          />
        );
      case 'gists':
        return <GistsView />;
      case 'releases':
        return <ReleasesView />;
      case 'forks':
        return <ForksView />;
      case 'subscription':
        return <DiscoveryViewRoute />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  }, [currentView, repositories, searchResults, searchFilters, selectedCategory, handleCategorySelect]);

  // Show loading state while store is hydrating.
  if (!hasHydrated || !runtimeReady) {
    return (
      <div className="archive-loading flex min-h-screen items-center justify-center">
        <div className="signal-loading-label">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !backend.isAvailable || !backend.isSessionAuthenticated) {
    return <LoginScreen />;
  }

  return (
      <div className="signal-app min-h-screen text-slate-950 lg:pl-[248px]">
      <Header />
      <main className="mx-auto w-full max-w-[1720px] px-3 py-4 sm:px-5 sm:py-6 xl:px-8 xl:py-7">
        <div className="signal-page-heading mb-5 flex min-h-12 items-end justify-between gap-4 px-1 sm:mb-7">
          <div>
            <div className="signal-page-kicker">{language === 'zh' ? '资料库 / 当前视图' : 'LIBRARY / CURRENT VIEW'}</div>
            <h1 className="text-[1.75rem] font-bold leading-none tracking-[-0.035em] text-slate-950 sm:text-[2rem]">
              {language === 'zh' ? VIEW_LABELS[currentView].zh : VIEW_LABELS[currentView].en}
            </h1>
              <p className="mt-2 text-xs font-medium text-slate-400 signal-page-subtitle">
              {currentView === 'repositories'
                ? (language === 'zh' ? `${repositories.length} 个已收藏仓库` : `${repositories.length} starred repositories`)
                : (language === 'zh' ? 'Stars / Index 工作区' : 'Stars / Index workspace')}
            </p>
          </div>
          <div className="signal-sync-status hidden items-center gap-2 sm:flex">
            <span className="signal-status-dot" />
            <span className="signal-sync-label">{language === 'zh' ? '同步状态' : 'SYNC STATUS'}</span>
            {lastSync
              ? (language === 'zh' ? `同步于 ${new Date(lastSync).toLocaleString()}` : `Synced ${new Date(lastSync).toLocaleString()}`)
              : (language === 'zh' ? '等待首次同步' : 'Waiting for first sync')}
          </div>
        </div>
        {currentViewContent}
      </main>
      <BackToTop />
    </div>
  );
};

export default App;
