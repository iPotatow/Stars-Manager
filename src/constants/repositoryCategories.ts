import type { Category } from '../types';
import {
  buildOssTaxonomyKeywords,
  formatOssTaxonomyTermName,
  ossTaxonomy,
  OSS_TAXONOMY_FACETS,
} from './ossTaxonomy';

const taxonomyCategories: Category[] = OSS_TAXONOMY_FACETS.flatMap(facet => (
  ossTaxonomy[facet.id].map(term => ({
    id: `oss:${facet.id}:${term.name}`,
    name: term.name === 'networking'
      ? `${formatOssTaxonomyTermName(term.name)} (${facet.label})`
      : formatOssTaxonomyTermName(term.name),
    icon: facet.icon,
    keywords: buildOssTaxonomyKeywords([{ facet: facet.id, terms: [term.name] }]),
    facet: facet.id,
    taxonomyTerm: term.name,
    description: term.description,
  }))
));

/** Complete OSS Taxonomy snapshot, grouped by its six native facets. */
export const defaultCategories: Category[] = [
  {
    id: 'all',
    name: '全部分类',
    icon: '📁',
    keywords: [],
  },
  ...taxonomyCategories,
];

const categoryTranslations: Record<string, string> = {
  '全部分类': 'All Categories',
};

export const translateCategoryName = (name: string): string => categoryTranslations[name] ?? name;

export const getDefaultCategoryNames = (language: 'zh' | 'en' = 'zh'): string[] => (
  defaultCategories
    .filter(category => category.id !== 'all')
    .map(category => category.taxonomyTerm ?? (language === 'en' ? translateCategoryName(category.name) : category.name))
);

/** Preserve saved preferences and repository assignments when the taxonomy changes. */
const legacyCategoryIdMap: Record<string, string> = {
  all: 'all',
  web: 'oss:domain:web-development',
  mobile: 'oss:domain:mobile-development',
  desktop: 'oss:domain:desktop-development',
  database: 'oss:domain:database',
  ai: 'oss:domain:machine-learning',
  devtools: 'oss:audience:developer',
  security: 'oss:domain:security',
  game: 'oss:domain:game-development',
  design: 'oss:audience:designer',
  productivity: 'oss:role:application',
  education: 'oss:domain:education',
  social: 'oss:audience:end-user',
  analytics: 'oss:domain:data-science',
  development: 'oss:audience:developer',
  tools: 'oss:role:application',
  operations: 'oss:domain:devops',
  learning: 'oss:domain:education',
  creative: 'oss:audience:hobbyist',
  frontend: 'oss:layer:frontend',
  backend: 'oss:layer:backend',
  systems: 'oss:layer:operating-system',
  data: 'oss:domain:data-science',
  intelligence: 'oss:domain:machine-learning',
  delivery: 'oss:domain:devops',
  games: 'oss:domain:game-development',
  automation: 'oss:function:automation',
  community: 'oss:audience:end-user',
  general: 'oss:role:application',
  inbox: 'oss:role:application',
  build: 'oss:role:build-tool',
  learn: 'oss:domain:education',
  adopt: 'oss:role:application',
  watch: 'oss:audience:hobbyist',
  reference: 'oss:function:documentation',
  create: 'oss:audience:hobbyist',
  archive: 'oss:role:application',
};

/** Names from prior local versions, used only for persisted-data migration. */
const legacyCategoryNameMap: Record<string, string> = {
  '全部分类': '全部分类',
  'All Categories': '全部分类',
  'All': '全部分类',
  '全部仓库': '全部分类',
  'All Repositories': '全部分类',
  '人工智能': '人工智能',
  'Artificial Intelligence': '人工智能',
  'AI/机器学习': '人工智能',
  'AI/Machine Learning': '人工智能',
  'AI/ML': '人工智能',
  '智能与模型': '人工智能',
  'AI & Models': '人工智能',
  '开发技术': '开发技术',
  'Development': '开发技术',
  'Web应用': '开发技术',
  'Web Apps': '开发技术',
  '前端与界面': '开发技术',
  'Frontend & UI': '开发技术',
  '移动应用': '开发技术',
  'Mobile Apps': '开发技术',
  '移动与跨端': '开发技术',
  'Mobile & Cross-platform': '开发技术',
  '桌面应用': '开发技术',
  'Desktop Apps': '开发技术',
  '系统与桌面': '开发技术',
  'Systems & Desktop': '开发技术',
  '数据库': '开发技术',
  'Database': '开发技术',
  '数据与存储': '开发技术',
  'Data & Storage': '开发技术',
  '数据分析': '开发技术',
  'Data Analytics': '开发技术',
  'Data Analysis': '开发技术',
  '构建实践': '开发技术',
  'Build & Integrate': '开发技术',
  '工具软件': '工具软件',
  'Tools & Software': '工具软件',
  '开发工具': '工具软件',
  'Development Tools': '工具软件',
  'Dev Tools': '工具软件',
  '效率工具': '工具软件',
  'Productivity Tools': '工具软件',
  'Productivity': '工具软件',
  '自动化与生产力': '工具软件',
  'Automation & Productivity': '工具软件',
  '待整理': '工具软件',
  'Inbox': '工具软件',
  '可直接使用': '工具软件',
  'Ready to Use': '工具软件',
  '已归档': '工具软件',
  'Archive': '工具软件',
  '通用与其他': '工具软件',
  'General & Utilities': '工具软件',
  '运维部署': '运维部署',
  'Operations & Deployment': '运维部署',
  '工程与交付': '运维部署',
  'DevOps & Toolchains': '运维部署',
  '安全工具': '网络安全',
  'Security Tools': '网络安全',
  '网络安全': '网络安全',
  'Network Security': '网络安全',
  '安全与隐私': '网络安全',
  'Security & Privacy': '网络安全',
  '设计资源': '设计资源',
  'Design Resources': '设计资源',
  '设计工具': '设计资源',
  'Design Tools': '设计资源',
  '设计与媒体': '设计资源',
  'Design & Media': '设计资源',
  '学习资源': '学习资源',
  'Learning Resources': '学习资源',
  '教育学习': '学习资源',
  'Education': '学习资源',
  '知识与学习': '学习资源',
  'Learning & Reference': '学习资源',
  '学习资料': '学习资源',
  'Learning': '学习资源',
  '参考资料': '学习资源',
  'Reference': '学习资源',
  '创意收藏': '创意收藏',
  'Creative Finds': '创意收藏',
  '游戏': '创意收藏',
  'Games': '创意收藏',
  '游戏与互动': '创意收藏',
  'Games & Interactive': '创意收藏',
  '社交网络': '创意收藏',
  'Social Network': '创意收藏',
  'Social Networks': '创意收藏',
  '社区与协作': '创意收藏',
  'Community & Collaboration': '创意收藏',
  '持续关注': '创意收藏',
  'Watchlist': '创意收藏',
  '灵感创作': '创意收藏',
  'Creative': '创意收藏',
};

export const migrateCategoryId = (id: string): string => legacyCategoryIdMap[id] ?? id;

export const migrateCategoryIds = (ids: string[]): string[] => (
  Array.from(new Set(ids.map(migrateCategoryId)))
);

export const migrateCategoryName = (name: string | undefined): string | undefined => {
  if (name == null) return name;
  const legacyName = legacyCategoryNameMap[name] ?? name;
  const formerCategoryTargets: Record<string, string> = {
    '人工智能': 'Machine Learning',
    '开发技术': 'Developer',
    '工具软件': 'Application',
    '运维部署': 'DevOps',
    '网络安全': 'Security',
    '设计资源': 'Designer',
    '学习资源': 'Education',
    '创意收藏': 'Hobbyist',
  };
  return formerCategoryTargets[legacyName] ?? legacyName;
};

export const migrateRepositoryCategory = <T extends { custom_category?: string | null }>(repository: T): T => {
  if (repository.custom_category == null) return repository;
  const migratedName = migrateCategoryName(repository.custom_category);
  return migratedName === repository.custom_category
    ? repository
    : { ...repository, custom_category: migratedName };
};
