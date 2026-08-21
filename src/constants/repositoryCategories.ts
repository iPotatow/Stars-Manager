import type { Category } from '../types';

/**
 * Built-in application categories.
 *
 * These are intentionally small, Chinese, and user-facing. Matching remains
 * keyword-based so AI tags and repository metadata can resolve to the same
 * categories without an external classification dependency.
 */
export const defaultCategories: Category[] = [
  {
    id: 'all',
    name: '全部分类',
    icon: '📁',
    keywords: [],
  },
  {
    id: 'web',
    name: 'Web应用',
    icon: '🌐',
    keywords: ['web应用', 'web', 'website', 'frontend', 'react', 'vue', 'angular'],
  },
  {
    id: 'mobile',
    name: '移动应用',
    icon: '📱',
    keywords: ['移动应用', 'mobile', 'android', 'ios', 'flutter', 'react-native'],
  },
  {
    id: 'desktop',
    name: '桌面应用',
    icon: '💻',
    keywords: ['桌面应用', 'desktop', 'electron', 'gui', 'qt', 'gtk'],
  },
  {
    id: 'database',
    name: '数据库',
    icon: '🗄️',
    keywords: ['数据库', 'database', 'sql', 'nosql', 'mongodb', 'mysql', 'postgresql'],
  },
  {
    id: 'ai',
    name: 'AI/机器学习',
    icon: '🤖',
    keywords: ['ai工具', 'ai', 'ml', 'machine learning', 'deep learning', 'neural', 'llm', 'agent', 'rag'],
  },
  {
    id: 'devtools',
    name: '开发工具',
    icon: '🔧',
    keywords: ['开发工具', 'tool', 'cli', 'build', 'deploy', 'debug', 'test', 'automation', 'devops', 'developer'],
  },
  {
    id: 'security',
    name: '安全工具',
    icon: '🛡️',
    keywords: ['安全工具', 'security', 'encryption', 'auth', 'vulnerability', 'privacy', 'cybersecurity'],
  },
  {
    id: 'game',
    name: '游戏',
    icon: '🎮',
    keywords: ['游戏', 'game', 'gaming', 'unity', 'unreal', 'godot'],
  },
  {
    id: 'design',
    name: '设计工具',
    icon: '🎨',
    keywords: ['设计工具', 'design', 'ui', 'ux', 'graphics', 'image', 'illustration', 'css', 'figma'],
  },
  {
    id: 'productivity',
    name: '效率工具',
    icon: '⚡',
    keywords: ['效率工具', 'productivity', 'note', 'todo', 'calendar', 'task', 'workflow', 'plugin', 'extension'],
  },
  {
    id: 'education',
    name: '教育学习',
    icon: '📚',
    keywords: ['教育学习', 'education', 'learning', 'tutorial', 'course', 'documentation', 'docs', 'guide', 'reference'],
  },
  {
    id: 'social',
    name: '社交网络',
    icon: '👥',
    keywords: ['社交网络', 'social', 'chat', 'messaging', 'communication', 'community'],
  },
  {
    id: 'analytics',
    name: '数据分析',
    icon: '📊',
    keywords: ['数据分析', 'analytics', 'data', 'visualization', 'chart', 'statistics', 'data science'],
  },
];

const categoryTranslations: Record<string, string> = {
  '全部分类': 'All Categories',
  'Web应用': 'Web Apps',
  '移动应用': 'Mobile Apps',
  '桌面应用': 'Desktop Apps',
  '数据库': 'Database',
  'AI/机器学习': 'AI/Machine Learning',
  '开发工具': 'Development Tools',
  '安全工具': 'Security Tools',
  '游戏': 'Games',
  '设计工具': 'Design Tools',
  '效率工具': 'Productivity Tools',
  '教育学习': 'Education',
  '社交网络': 'Social Network',
  '数据分析': 'Data Analytics',
};

export const translateCategoryName = (name: string): string => categoryTranslations[name] ?? name;

export const getDefaultCategoryNames = (language: 'zh' | 'en' = 'zh'): string[] => (
  defaultCategories
    .filter(category => category.id !== 'all')
    .map(category => language === 'en' ? translateCategoryName(category.name) : category.name)
);

const categoryNameById = (id: string): string | undefined => (
  defaultCategories.find(category => category.id === id)?.name
);

/** Preserve saved sidebar preferences from previous local versions. */
const legacyCategoryIdMap: Record<string, string> = {
  all: 'all',
  web: 'web',
  mobile: 'mobile',
  desktop: 'desktop',
  database: 'database',
  ai: 'ai',
  devtools: 'devtools',
  security: 'security',
  game: 'game',
  design: 'design',
  productivity: 'productivity',
  education: 'education',
  social: 'social',
  analytics: 'analytics',
  development: 'devtools',
  tools: 'devtools',
  operations: 'devtools',
  learning: 'education',
  creative: 'design',
  frontend: 'web',
  backend: 'web',
  systems: 'devtools',
  data: 'analytics',
  intelligence: 'ai',
  delivery: 'devtools',
  games: 'game',
  automation: 'devtools',
  community: 'social',
  general: 'productivity',
  inbox: 'productivity',
  build: 'devtools',
  learn: 'education',
  adopt: 'productivity',
  watch: 'productivity',
  reference: 'education',
  create: 'design',
  archive: 'productivity',
};

const legacyCategoryTermMap: Record<string, string> = {
  'web-development': 'web',
  'mobile-development': 'mobile',
  'desktop-development': 'desktop',
  database: 'database',
  'machine-learning': 'ai',
  developer: 'devtools',
  'cli-tool': 'devtools',
  'build-tool': 'devtools',
  security: 'security',
  'game-development': 'game',
  designer: 'design',
  application: 'productivity',
  education: 'education',
  'end-user': 'social',
  'data-science': 'analytics',
  devops: 'devtools',
  hobbyist: 'design',
  frontend: 'web',
  backend: 'web',
  'operating-system': 'devtools',
  automation: 'devtools',
  documentation: 'education',
};

export const migrateCategoryId = (id: string): string => {
  const direct = legacyCategoryIdMap[id];
  if (direct) return direct;
  const legacyTerm = id.split(':').pop()?.toLowerCase();
  return (legacyTerm && legacyCategoryTermMap[legacyTerm]) || id;
};

export const migrateCategoryIds = (ids: string[]): string[] => (
  Array.from(new Set(ids.map(migrateCategoryId)))
);

const legacyCategoryNameMap: Record<string, string> = {
  '全部分类': 'all',
  'All Categories': 'all',
  'All': 'all',
  '全部仓库': 'all',
  'All Repositories': 'all',
  '人工智能': 'ai',
  'Artificial Intelligence': 'ai',
  'AI/机器学习': 'ai',
  'AI/Machine Learning': 'ai',
  'AI/ML': 'ai',
  '智能与模型': 'ai',
  'AI & Models': 'ai',
  'Web应用': 'web',
  'Web Apps': 'web',
  'Web Development': 'web',
  '前端与界面': 'web',
  'Frontend & UI': 'web',
  '前端': 'web',
  'Frontend': 'web',
  '移动应用': 'mobile',
  'Mobile Apps': 'mobile',
  'Mobile Development': 'mobile',
  '移动与跨端': 'mobile',
  'Mobile & Cross-platform': 'mobile',
  '桌面应用': 'desktop',
  'Desktop Apps': 'desktop',
  'Desktop Development': 'desktop',
  '系统与桌面': 'desktop',
  'Systems & Desktop': 'desktop',
  '数据库': 'database',
  'Database': 'database',
  'Database System': 'database',
  '数据与存储': 'database',
  'Data & Storage': 'database',
  '数据分析': 'analytics',
  'Data Analytics': 'analytics',
  'Data Analysis': 'analytics',
  'Data Science': 'analytics',
  '工具软件': 'productivity',
  'Tools & Software': 'productivity',
  '开发工具': 'devtools',
  'Development Tools': 'devtools',
  'Dev Tools': 'devtools',
  'Developer': 'devtools',
  'CLI Tool': 'devtools',
  'Build Tool': 'devtools',
  'DevOps': 'devtools',
  '效率工具': 'productivity',
  'Productivity Tools': 'productivity',
  'Productivity': 'productivity',
  '自动化与生产力': 'productivity',
  'Automation & Productivity': 'productivity',
  '待整理': 'productivity',
  'Inbox': 'productivity',
  '可直接使用': 'productivity',
  'Ready to Use': 'productivity',
  '已归档': 'productivity',
  'Archive': 'productivity',
  '通用与其他': 'productivity',
  'General & Utilities': 'productivity',
  '运维部署': 'devtools',
  'Operations & Deployment': 'devtools',
  '工程与交付': 'devtools',
  'DevOps & Toolchains': 'devtools',
  '安全工具': 'security',
  'Security Tools': 'security',
  '网络安全': 'security',
  'Network Security': 'security',
  'Security': 'security',
  '安全与隐私': 'security',
  'Security & Privacy': 'security',
  '设计资源': 'design',
  'Design Resources': 'design',
  '设计工具': 'design',
  'Design Tools': 'design',
  'Designer': 'design',
  '设计与媒体': 'design',
  'Design & Media': 'design',
  '学习资源': 'education',
  'Learning Resources': 'education',
  '教育学习': 'education',
  'Education': 'education',
  '知识与学习': 'education',
  'Learning & Reference': 'education',
  '学习资料': 'education',
  'Learning': 'education',
  '参考资料': 'education',
  'Reference': 'education',
  '创意收藏': 'design',
  'Creative Finds': 'design',
  '游戏': 'game',
  'Games': 'game',
  'Game Development': 'game',
  '游戏与互动': 'game',
  'Games & Interactive': 'game',
  '社交网络': 'social',
  'Social Network': 'social',
  'Social Networks': 'social',
  'End User': 'social',
  '社区与协作': 'social',
  'Community & Collaboration': 'social',
  '持续关注': 'productivity',
  'Watchlist': 'productivity',
  '灵感创作': 'design',
  'Creative': 'design',
  'Machine Learning': 'ai',
  'machine-learning': 'ai',
  'Hobbyist': 'design',
};

const categoryIdFromLegacyName = (name: string): string | undefined => {
  const direct = legacyCategoryNameMap[name];
  if (direct) return direct;

  const normalized = name.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!normalized) return undefined;
  if (/\b(ai|ml|machine learning|deep learning|neural|llm|agent|rag)\b/.test(normalized)) return 'ai';
  if (/\b(web|website|frontend|front end|react|vue|angular)\b/.test(normalized)) return 'web';
  if (/\b(mobile|android|ios|flutter)\b/.test(normalized)) return 'mobile';
  if (/\b(desktop|electron|qt|gtk)\b/.test(normalized)) return 'desktop';
  if (/\b(database|sql|nosql|mongodb|mysql|postgresql)\b/.test(normalized)) return 'database';
  if (/\b(security|privacy|encryption|auth|vulnerability|cybersecurity)\b/.test(normalized)) return 'security';
  if (/\b(game|gaming|unity|unreal|godot)\b/.test(normalized)) return 'game';
  if (/\b(design|designer|ui|ux|graphics|image|illustration|figma)\b/.test(normalized)) return 'design';
  if (/\b(education|learning|tutorial|course|documentation|docs|guide|reference)\b/.test(normalized)) return 'education';
  if (/\b(social|chat|messaging|community)\b/.test(normalized)) return 'social';
  if (/\b(analytics|data science|visualization|statistics|chart)\b/.test(normalized)) return 'analytics';
  if (/\b(cli|tool|build|deploy|debug|test|automation|devops|developer|framework|library|compiler)\b/.test(normalized)) return 'devtools';
  if (/\b(productivity|note|todo|calendar|task|workflow|plugin|extension|application)\b/.test(normalized)) return 'productivity';
  return undefined;
};

export const migrateCategoryName = (name: string | undefined): string | undefined => {
  if (name == null) return name;
  const categoryId = categoryIdFromLegacyName(name);
  return categoryId ? categoryNameById(categoryId) : name;
};

export const migrateRepositoryCategory = <T extends { custom_category?: string | null }>(repository: T): T => {
  if (repository.custom_category == null) return repository;
  const migratedName = migrateCategoryName(repository.custom_category);
  return migratedName === repository.custom_category
    ? repository
    : { ...repository, custom_category: migratedName };
};
