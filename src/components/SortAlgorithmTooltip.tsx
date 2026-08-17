import React, { useState } from 'react';
import { Info } from '@lucide/vue';
import type { DiscoveryChannelId } from '../types';

interface SortAlgorithmTooltipProps {
  channelId: DiscoveryChannelId;
  language: 'zh' | 'en';
}

export const SortAlgorithmTooltip: React.FC<SortAlgorithmTooltipProps> = ({ channelId, language }) => {
  const [isVisible, setIsVisible] = useState(false);

  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  const getAlgorithmInfo = (channel: DiscoveryChannelId): { title: string; description: string; highlight: string } => {
    switch (channel) {
      case 'trending':
        return {
          title: t('热门仓库', 'Trending Repositories'),
          highlight: t('最近更新的热门项目', 'Popular projects updated recently'),
          description: t(
            '时间范围：最近30天有更新\nStar门槛：50+\n排序：按 Star 数降序\n\n适合查看近期活跃的热门项目。',
            '【Features】\n• Time range: Updated in last 30 days\n• Star threshold: 50+\n• Sort by: Stars descending\n\n【Best for】\nDiscovering emerging hot projects, tracking tech trends.'
          ),
        };
      case 'hot-release':
        return {
          title: t('热门发布', 'Hot Release'),
          highlight: t('最近发布过新版本的项目', 'Projects with recent releases'),
          description: t(
            '时间范围：最近14天有更新\nStar门槛：10+\n排序：按更新时间降序\n\n适合查看近期有版本或代码更新的项目。',
            '【Features】\n• Time range: Updated in last 14 days\n• Star threshold: 10+\n• Sort by: Update time descending\n\n【Best for】\nFinding actively developed projects with recent updates or new releases.'
          ),
        };
      case 'most-popular':
        return {
          title: t('最受欢迎', 'Most Popular'),
          highlight: t('高 Star 数的成熟项目', 'Mature projects with many stars'),
          description: t(
            '创建时间：超过 6 个月\n更新时间：1 年内\nStar门槛：1000+\n排序：按 Star 数降序\n\n适合查找成熟的工具和框架。',
            '【Features】\n• Time range: Created 6+ months ago, updated within 1 year\n• Star threshold: 1000+\n• Sort by: Stars descending\n\n【Best for】\nFinding time-tested, widely recognized classic projects for stable tools and frameworks.'
          ),
        };
      case 'topic':
        return {
          title: t('主题探索', 'Topic Exploration'),
          highlight: t('按技术主题浏览', 'Browse by tech topic'),
          description: t(
            '按选定主题筛选\nStar门槛：10+\n排序：按 Star 数降序\n\n适合按技术领域浏览项目。',
            '【Features】\n• Filter by selected topic\n• Star threshold: 10+\n• Sort by: Stars descending\n\n【Best for】\nBrowsing quality projects by specific tech domain (AI, Database, Web, etc.).'
          ),
        };
      case 'search':
        return {
          title: t('搜索', 'Search'),
          highlight: t('按关键词搜索', 'Search by keyword'),
          description: t(
            '支持自定义关键词\n排序：最佳匹配、Star 数或 Fork 数\n可按语言和平台筛选\n\n适合查找特定项目或技术栈。',
            '【Features】\n• Custom keyword search\n• Sort options: Best match, Most stars, Most forks\n• Language and platform filters\n\n【Best for】\nPrecise search for specific projects or tech stack related repos.'
          ),
        };
      default:
        return {
          title: t('排序算法', 'Sorting Algorithm'),
          highlight: '',
          description: t('按默认规则排序', 'Sorted by default rules'),
        };
    }
  };

  const info = getAlgorithmInfo(channelId);

  return (
    <div className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="p-1 rounded-full text-gray-400 dark:text-text-quaternary hover:text-brand-violet hover:bg-gray-100 dark:bg-white/[0.04] dark:hover:bg-gray-100 dark:bg-white/[0.04] transition-colors"
      >
        <Info className="w-4 h-4" />
      </button>

      {isVisible && (
        <div className="absolute top-full mt-2 left-0 sm:left-1/2 sm:-translate-x-1/2 z-[9999]" style={{ zIndex: 9999 }}>
          <div className="relative bg-white dark:bg-panel-dark border border-black/[0.06] dark:border-white/[0.04] rounded-lg shadow-xl p-4 w-[calc(100vw-2rem)] sm:w-80 max-w-[calc(100vw-2rem)]">
            {/* Arrow */}
            <div className="absolute top-0 left-4 sm:left-1/2 sm:-translate-x-1/2 -translate-y-full z-[10000]">
              <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-8 border-b-black/[0.06] dark:border-b-white/[0.04]" />
              <div className="absolute left-1/2 -translate-x-1/2 top-0.5 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-8 border-b-white dark:border-b-panel-dark" />
            </div>

            <h4 className="font-semibold text-gray-900 dark:text-text-primary mb-2 text-sm">
              {info.title}
            </h4>
            {info.highlight && (
              <p className="text-sm font-medium text-brand-violet dark:text-brand-violet mb-2">
                {info.highlight}
              </p>
            )}
            <p className="text-xs text-gray-700 dark:text-text-tertiary whitespace-pre-line leading-relaxed">
              {info.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
