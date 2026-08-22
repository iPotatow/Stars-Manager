import Vue, { useMemo } from "../vue-runtime.ts";
import { Activity, BarChart3, Code2, Layers3, Sparkles, Star, TrendingUp } from '@lucide/vue';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { getAllCategories, useAppStore } from '../store/useAppStore';
import { matchesCategory } from '../utils/categoryUtils';
import type { Repository } from '../types';

interface RepositoryAnalyticsProps {
  repositories: Repository[];
}

const CHART_COLORS = ['#2774d9', '#6d91b6', '#7fa8a1', '#c49a87', '#8b8fa6'];

const formatCount = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return value.toLocaleString();
};

const formatPercent = (value: number, total: number): string => {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
};

const buildSparklinePoints = (values: number[], width = 360, height = 112): string => {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 18) - 9;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const EmptyChart = ({ label }: { label: string }) => (
  <div className="flex min-h-[142px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-xs text-muted-foreground">
    {label}
  </div>
);

export const RepositoryAnalytics: Vue.FC<RepositoryAnalyticsProps> = Vue.memo(({ repositories }) => {
  const {
    language,
    customCategories,
    hiddenDefaultCategoryIds,
    defaultCategoryOverrides,
    categoryMatchMode,
  } = useAppStore();
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  const allCategories = useMemo(
    () => getAllCategories(customCategories, language, hiddenDefaultCategoryIds, defaultCategoryOverrides),
    [customCategories, language, hiddenDefaultCategoryIds, defaultCategoryOverrides],
  );

  const analytics = useMemo(() => {
    const totalStars = repositories.reduce((sum, repo) => sum + Math.max(0, repo.stargazers_count || 0), 0);
    const analyzed = repositories.filter(repo => repo.analyzed_at && !repo.analysis_failed).length;
    const languageCounts = new Map<string, number>();
    for (const repo of repositories) {
      const key = repo.language?.trim() || t('未标注', 'Unspecified');
      languageCounts.set(key, (languageCounts.get(key) || 0) + 1);
    }

    const categoryRows = allCategories
      .filter(category => category.id !== 'all')
      .map(category => ({
        label: category.name,
        value: repositories.filter(repo => matchesCategory(repo, category, categoryMatchMode)).length,
      }))
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const languageRows = [...languageCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const starBuckets = [
      { label: '0–99', value: repositories.filter(repo => (repo.stargazers_count || 0) < 100).length },
      { label: '100–999', value: repositories.filter(repo => (repo.stargazers_count || 0) >= 100 && (repo.stargazers_count || 0) < 1_000).length },
      { label: '1k–9.9k', value: repositories.filter(repo => (repo.stargazers_count || 0) >= 1_000 && (repo.stargazers_count || 0) < 10_000).length },
      { label: '10k+', value: repositories.filter(repo => (repo.stargazers_count || 0) >= 10_000).length },
    ];

    const sparklineValues = [...repositories]
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 12)
      .reverse()
      .map(repo => Math.log10(Math.max(repo.stargazers_count || 0, 1)));

    return {
      totalStars,
      analyzed,
      languages: languageCounts.size,
      categoryRows,
      languageRows,
      starBuckets,
      sparklineValues,
    };
  }, [repositories, allCategories, categoryMatchMode, language]);

  const maxCategory = Math.max(...analytics.categoryRows.map(row => row.value), 1);
  const maxLanguage = Math.max(...analytics.languageRows.map(row => row.value), 1);
  const maxBucket = Math.max(...analytics.starBuckets.map(bucket => bucket.value), 1);
  const sparklinePoints = buildSparklinePoints(analytics.sparklineValues);

  return (
    <section className="repository-analytics" aria-label={t('仓库数据概览', 'Repository analytics')}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card class="analytics-metric">
          <CardContent class="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="metric-label">{t('当前仓库', 'Repositories')}</p>
              <p className="metric-value">{repositories.length.toLocaleString()}</p>
              <p className="metric-note">{t('当前筛选范围', 'Current scope')}</p>
            </div>
            <span className="metric-icon metric-icon-blue"><Layers3 aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card class="analytics-metric">
          <CardContent class="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="metric-label">{t('累计 Stars', 'Total stars')}</p>
              <p className="metric-value">{formatCount(analytics.totalStars)}</p>
              <p className="metric-note">{t('GitHub 实时字段', 'From GitHub data')}</p>
            </div>
            <span className="metric-icon metric-icon-amber"><Star aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card class="analytics-metric">
          <CardContent class="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="metric-label">{t('AI 覆盖率', 'AI coverage')}</p>
              <p className="metric-value">{formatPercent(analytics.analyzed, repositories.length)}</p>
              <p className="metric-note">{t(`${analytics.analyzed} 个已完成分析`, `${analytics.analyzed} analyzed`)}</p>
            </div>
            <span className="metric-icon metric-icon-mint"><Sparkles aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card class="analytics-metric">
          <CardContent class="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="metric-label">{t('语言种类', 'Languages')}</p>
              <p className="metric-value">{analytics.languages}</p>
              <p className="metric-note">{t('按仓库主语言', 'Primary language')}</p>
            </div>
            <span className="metric-icon metric-icon-slate"><Code2 aria-hidden="true" /></span>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.05fr_1fr_1.15fr]">
        <Card class="analytics-chart-card">
          <CardHeader class="analytics-card-header">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle class="analytics-card-title">{t('分类命中', 'Category matches')}</CardTitle>
                <CardDescription>{t('当前结果中的分类归属', 'Category matches in this result set')}</CardDescription>
              </div>
              <Badge variant="secondary" class="analytics-badge"><BarChart3 data-icon="inline-start" /> TOP 5</Badge>
            </div>
          </CardHeader>
          <CardContent class="px-4 pb-4 pt-0">
            {analytics.categoryRows.length ? (
              <div className="flex flex-col gap-3" role="list" aria-label={t('分类命中排行', 'Category match ranking')}>
                {analytics.categoryRows.map((row, index) => (
                  <div key={row.label} role="listitem" className="chart-row">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground"><span className="chart-dot" style={{ backgroundColor: CHART_COLORS[index] }} /> <span className="truncate">{row.label}</span></span>
                      <span className="shrink-0 font-semibold text-muted-foreground">{row.value}</span>
                    </div>
                    <div className="chart-track"><span className="chart-fill" style={{ width: `${(row.value / maxCategory) * 100}%`, backgroundColor: CHART_COLORS[index] }} /></div>
                  </div>
                ))}
              </div>
            ) : <EmptyChart label={t('当前筛选没有分类数据', 'No category data in this scope')} />}
          </CardContent>
        </Card>

        <Card class="analytics-chart-card">
          <CardHeader class="analytics-card-header">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle class="analytics-card-title">{t('语言构成', 'Language mix')}</CardTitle>
                <CardDescription>{t('按主语言计数，不重复叠加', 'Counted by primary language')}</CardDescription>
              </div>
              <Badge variant="outline" class="analytics-badge">{analytics.languages} {t('种', 'types')}</Badge>
            </div>
          </CardHeader>
          <CardContent class="px-4 pb-4 pt-0">
            {analytics.languageRows.length ? (
              <div className="flex flex-col gap-3" role="list" aria-label={t('语言排行', 'Language ranking')}>
                {analytics.languageRows.map((row, index) => (
                  <div key={row.label} role="listitem" className="chart-row">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground"><span className="chart-dot" style={{ backgroundColor: CHART_COLORS[(index + 1) % CHART_COLORS.length] }} /> <span className="truncate">{row.label}</span></span>
                      <span className="shrink-0 font-semibold text-muted-foreground">{row.value} · {formatPercent(row.value, repositories.length)}</span>
                    </div>
                    <div className="chart-track"><span className="chart-fill" style={{ width: `${(row.value / maxLanguage) * 100}%`, backgroundColor: CHART_COLORS[(index + 1) % CHART_COLORS.length] }} /></div>
                  </div>
                ))}
              </div>
            ) : <EmptyChart label={t('当前筛选没有语言数据', 'No language data in this scope')} />}
          </CardContent>
        </Card>

        <Card class="analytics-chart-card">
          <CardHeader class="analytics-card-header">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle class="analytics-card-title">{t('Stars 规模', 'Star scale')}</CardTitle>
                <CardDescription>{t('按数量级分组；折线使用 log10 便于比较', 'Bucketed counts; line uses log10 for comparison')}</CardDescription>
              </div>
              <Badge variant="secondary" class="analytics-badge"><TrendingUp data-icon="inline-start" /> {t('趋势', 'TREND')}</Badge>
            </div>
          </CardHeader>
          <CardContent class="px-4 pb-4 pt-0">
            {repositories.length ? (
              <div className="flex flex-col gap-3">
                <svg className="h-[116px] w-full overflow-visible" viewBox="0 0 360 112" role="img" aria-label={t('Stars 规模折线图', 'Star scale line chart')} preserveAspectRatio="none">
                  <path d="M0 103H360" stroke="rgba(39,116,217,.15)" strokeWidth="1" />
                  <path d="M0 58H360" stroke="rgba(39,116,217,.09)" strokeWidth="1" strokeDasharray="3 5" />
                  {sparklinePoints ? <polyline points={sparklinePoints} fill="none" stroke="#2774d9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
                </svg>
                <div className="grid grid-cols-4 gap-2">
                  {analytics.starBuckets.map((bucket, index) => (
                    <div key={bucket.label} className="flex flex-col gap-1.5">
                      <div className="flex h-8 items-end rounded-md bg-slate-100/80"><span className="w-full rounded-md" style={{ height: `${Math.max((bucket.value / maxBucket) * 100, bucket.value ? 12 : 0)}%`, backgroundColor: CHART_COLORS[index] }} /></div>
                      <span className="text-center text-[10px] font-medium text-muted-foreground">{bucket.label}</span>
                      <span className="text-center text-xs font-semibold text-foreground">{bucket.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Activity className="size-3" aria-hidden="true" /> {t('从高到低取前 12 个仓库进行相对比较', 'Top 12 repositories, ranked for relative comparison')}</div>
              </div>
            ) : <EmptyChart label={t('当前筛选没有 Stars 数据', 'No star data in this scope')} />}
          </CardContent>
        </Card>
      </div>
    </section>
  );
});

RepositoryAnalytics.displayName = 'RepositoryAnalytics';
