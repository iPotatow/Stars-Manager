import type { Category } from '../types';

/** The default taxonomy for organizing starred repositories. */
export const defaultCategories: Category[] = [
  {
    id: 'all',
    name: '全部分类',
    icon: '📁',
    keywords: [],
  },
  {
    id: 'ai',
    name: '人工智能',
    icon: '🤖',
    keywords: [
      '人工智能', 'AI', 'artificial intelligence', '机器学习', 'machine learning',
      '深度学习', 'deep learning', 'neural network', 'LLM', 'large language model',
      'language model', '大模型', 'Agent', 'agent', '智能体', 'RAG',
      'retrieval augmented generation', 'MCP', 'model context protocol', '生成式AI',
      'generative AI', 'genai', 'AI应用', 'chatbot', 'copilot',
    ],
  },
  {
    id: 'development',
    name: '开发技术',
    icon: '💻',
    keywords: [
      '开发技术', '前端', '后端', '前后端', 'frontend', 'backend', 'fullstack',
      'full-stack', 'web', 'website', 'api', 'framework', '框架', 'library', '库',
      'sdk', '软件开发', 'software development', 'programming', '编程', 'javascript',
      'typescript', 'python', 'java', 'go', 'rust', 'react', 'vue', 'angular',
      'svelte', '数据库', 'database', 'sql', 'nosql', 'mongodb', 'mysql',
      'postgresql', 'redis', '移动开发', 'mobile', 'android', 'ios', 'flutter',
      'react-native', '桌面应用', 'desktop', 'electron', 'qt', 'gtk',
    ],
  },
  {
    id: 'tools',
    name: '工具软件',
    icon: '🛠️',
    keywords: [
      '工具软件', '开发工具', 'cli', 'command line', '命令行', 'terminal', '终端',
      'shell', 'developer tool', 'devtools', 'utility', 'productivity', '效率',
      '自动化', 'automation', 'workflow', '工作流', 'plugin', '插件', 'extension',
      'editor', 'ide', 'notebook', 'todo', 'calendar', 'task',
    ],
  },
  {
    id: 'operations',
    name: '运维部署',
    icon: '🖥️',
    keywords: [
      '运维部署', 'docker', 'docker compose', 'container', '容器', 'kubernetes', 'k8s',
      'server', '服务器', 'cloud', '云服务', 'self-hosted', 'self hosted', '自托管',
      'devops', 'deployment', 'deploy', '部署', 'infrastructure', 'infra', '基础设施',
      'hosting', 'homelab', 'linux', 'systemd', 'terraform', 'ansible', 'ci/cd',
      'platform engineering',
    ],
  },
  {
    id: 'security',
    name: '网络安全',
    icon: '🔐',
    keywords: [
      '网络安全', '网络', 'network', 'proxy', '代理', 'security', '安全', 'privacy',
      '隐私', 'encryption', '加密', 'auth', 'authentication', 'authorization',
      'vulnerability', '漏洞', 'firewall', '防火墙', 'vpn', 'tls', 'ssl', 'pentest',
      '渗透测试', 'malware', '恶意软件', 'zero trust',
    ],
  },
  {
    id: 'design',
    name: '设计资源',
    icon: '🎨',
    keywords: [
      '设计资源', 'ui', 'ux', 'user interface', 'user experience', 'component', '组件',
      'icon', '图标', 'design', '设计', 'graphics', 'graphic', 'visual', 'illustration',
      '插画', 'theme', '主题', 'template', '模板', 'css', 'tailwind', 'figma',
    ],
  },
  {
    id: 'learning',
    name: '学习资源',
    icon: '📚',
    keywords: [
      '学习资源', '教程', 'tutorial', 'awesome', '书籍', 'book', 'books', '知识库',
      'knowledge base', 'learning', 'education', 'course', '课程', 'docs', 'documentation',
      'reference', 'guide', '指南', 'article', '文章', 'cheatsheet', 'study',
    ],
  },
  {
    id: 'creative',
    name: '创意收藏',
    icon: '💡',
    keywords: [
      '创意收藏', '有趣项目', 'interesting project', 'interesting', 'demo', '演示',
      '实验', 'experiment', 'experimental', 'inspiration', '灵感', 'creative', '创意',
      'showcase', 'playground', 'prototype', '原型', 'game', '游戏', 'interactive',
      '互动', 'art', '艺术',
    ],
  },
];

const categoryTranslations: Record<string, string> = {
  '全部分类': 'All Categories',
  '人工智能': 'Artificial Intelligence',
  '开发技术': 'Development',
  '工具软件': 'Tools & Software',
  '运维部署': 'Operations & Deployment',
  '网络安全': 'Network Security',
  '设计资源': 'Design Resources',
  '学习资源': 'Learning Resources',
  '创意收藏': 'Creative Finds',
};

export const translateCategoryName = (name: string): string => categoryTranslations[name] ?? name;

export const getDefaultCategoryNames = (language: 'zh' | 'en' = 'zh'): string[] => (
  defaultCategories.map(category => language === 'en' ? translateCategoryName(category.name) : category.name)
);

/** Preserve saved preferences and repository assignments when the taxonomy changes. */
const legacyCategoryIdMap: Record<string, string> = {
  all: 'all',
  web: 'development',
  mobile: 'development',
  desktop: 'development',
  database: 'development',
  ai: 'ai',
  devtools: 'tools',
  security: 'security',
  game: 'creative',
  design: 'design',
  productivity: 'tools',
  education: 'learning',
  social: 'creative',
  analytics: 'development',
  development: 'development',
  tools: 'tools',
  operations: 'operations',
  learning: 'learning',
  creative: 'creative',
  frontend: 'development',
  backend: 'development',
  systems: 'operations',
  data: 'development',
  intelligence: 'ai',
  delivery: 'operations',
  games: 'creative',
  automation: 'tools',
  community: 'creative',
  general: 'tools',
  inbox: 'tools',
  build: 'development',
  learn: 'learning',
  adopt: 'tools',
  watch: 'creative',
  reference: 'learning',
  create: 'creative',
  archive: 'tools',
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
  return legacyCategoryNameMap[name] ?? name;
};

export const migrateRepositoryCategory = <T extends { custom_category?: string | null }>(repository: T): T => {
  if (repository.custom_category == null) return repository;
  const migratedName = migrateCategoryName(repository.custom_category);
  return migratedName === repository.custom_category
    ? repository
    : { ...repository, custom_category: migratedName };
};
