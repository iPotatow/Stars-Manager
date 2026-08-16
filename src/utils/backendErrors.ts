const ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  // Auth
  UNAUTHORIZED: { zh: '登录会话已失效，请重新登录', en: 'Your login session has expired; please sign in again' },
  AUTH_CONFIG_REQUIRED: { zh: 'Worker 尚未配置 ADMIN_USER / ADMIN_PASSWORD', en: 'ADMIN_USER / ADMIN_PASSWORD are not configured on the Worker' },
  INVALID_CREDENTIALS: { zh: '用户名或密码错误', en: 'Invalid username or password' },
  LOGIN_RATE_LIMITED: { zh: '登录尝试过于频繁，请稍后再试', en: 'Too many login attempts; try again later' },
  ENCRYPTION_KEY_REQUIRED: { zh: 'Worker 尚未配置 ENCRYPTION_KEY 或 ADMIN_PASSWORD', en: 'ENCRYPTION_KEY or ADMIN_PASSWORD is not configured on the Worker' },
  GITHUB_TOKEN_REQUIRED: { zh: '请输入 GitHub Token', en: 'GitHub token is required' },
  GITHUB_TOKEN_INVALID: { zh: 'GitHub Token 无效或权限不足', en: 'GitHub token is invalid or lacks the required access' },
  GITHUB_UNAVAILABLE: { zh: '暂时无法验证 GitHub Token，请稍后再试', en: 'GitHub is temporarily unavailable; try again later' },
  // Proxy
  GITHUB_TOKEN_NOT_CONFIGURED: { zh: 'GitHub Token 未配置', en: 'GitHub token not configured' },
  GITHUB_TOKEN_DECRYPT_FAILED: { zh: 'GitHub Token 解密失败', en: 'Failed to decrypt GitHub token' },
  GITHUB_PROXY_FAILED: { zh: 'GitHub 代理请求失败', en: 'GitHub proxy failed' },
  CONFIG_ID_REQUIRED: { zh: '缺少配置 ID', en: 'Config ID required' },
  AI_CONFIG_NOT_FOUND: { zh: 'AI 配置未找到', en: 'AI config not found' },
  AI_PROXY_FAILED: { zh: 'AI 代理请求失败', en: 'AI proxy failed' },
  GATEWAY_TIMEOUT: { zh: '网关超时', en: 'Gateway Timeout' },
  BAD_GATEWAY: { zh: '网关错误', en: 'Bad Gateway' },
  // Repositories
  FETCH_REPOSITORIES_FAILED: { zh: '获取仓库列表失败', en: 'Failed to fetch repositories' },
  REPOSITORIES_ARRAY_REQUIRED: { zh: '需要仓库数组', en: 'Repositories array required' },
  UPSERT_REPOSITORIES_FAILED: { zh: '更新仓库失败', en: 'Failed to upsert repositories' },
  NO_VALID_FIELDS: { zh: '没有有效的更新字段', en: 'No valid fields to update' },
  REPOSITORY_NOT_FOUND: { zh: '仓库未找到', en: 'Repository not found' },
  UPDATE_REPOSITORY_FAILED: { zh: '更新仓库失败', en: 'Failed to update repository' },
  // Releases
  FETCH_RELEASES_FAILED: { zh: '获取发布列表失败', en: 'Failed to fetch releases' },
  RELEASES_ARRAY_REQUIRED: { zh: '需要发布数组', en: 'Releases array required' },
  UPSERT_RELEASES_FAILED: { zh: '更新发布信息失败', en: 'Failed to upsert releases' },
  IS_READ_REQUIRED: { zh: '需要 is_read 字段', en: 'is_read field required' },
  RELEASE_NOT_FOUND: { zh: '发布未找到', en: 'Release not found' },
  UPDATE_RELEASE_FAILED: { zh: '更新发布失败', en: 'Failed to update release' },
  MARK_ALL_READ_FAILED: { zh: '标记全部已读失败', en: 'Failed to mark all as read' },
  // Categories
  FETCH_CATEGORIES_FAILED: { zh: '获取分类失败', en: 'Failed to fetch categories' },
  CREATE_CATEGORY_FAILED: { zh: '创建分类失败', en: 'Failed to create category' },
  CATEGORY_NOT_FOUND: { zh: '分类未找到', en: 'Category not found' },
  UPDATE_CATEGORY_FAILED: { zh: '更新分类失败', en: 'Failed to update category' },
  DELETE_CATEGORY_FAILED: { zh: '删除分类失败', en: 'Failed to delete category' },
  // Asset filters
  FETCH_ASSET_FILTERS_FAILED: { zh: '获取资源过滤器失败', en: 'Failed to fetch asset filters' },
  CREATE_ASSET_FILTER_FAILED: { zh: '创建资源过滤器失败', en: 'Failed to create asset filter' },
  ASSET_FILTER_NOT_FOUND: { zh: '资源过滤器未找到', en: 'Asset filter not found' },
  UPDATE_ASSET_FILTER_FAILED: { zh: '更新资源过滤器失败', en: 'Failed to update asset filter' },
  DELETE_ASSET_FILTER_FAILED: { zh: '删除资源过滤器失败', en: 'Failed to delete asset filter' },
  // Configs
  FETCH_AI_CONFIGS_FAILED: { zh: '获取 AI 配置失败', en: 'Failed to fetch AI configs' },
  CREATE_AI_CONFIG_FAILED: { zh: '创建 AI 配置失败', en: 'Failed to create AI config' },
  UPDATE_AI_CONFIG_FAILED: { zh: '更新 AI 配置失败', en: 'Failed to update AI config' },
  DELETE_AI_CONFIG_FAILED: { zh: '删除 AI 配置失败', en: 'Failed to delete AI config' },
  SYNC_AI_CONFIGS_FAILED: { zh: '同步 AI 配置失败', en: 'Failed to sync AI configs' },
  SYNC_AI_CONFIGS_ALL_SKIPPED: { zh: '同步 AI 配置失败：所有配置均被跳过，请查看错误详情', en: 'Failed to sync AI configs: all configs skipped, see errors for details' },
  INVALID_REQUEST: { zh: '无效的请求', en: 'Invalid request' },
  FETCH_SETTINGS_FAILED: { zh: '获取设置失败', en: 'Failed to fetch settings' },
  UPDATE_SETTINGS_FAILED: { zh: '更新设置失败', en: 'Failed to update settings' },
  // General
  INTERNAL_SERVER_ERROR: { zh: '服务器内部错误', en: 'Internal server error' },
};

function getCurrentLanguage(): 'zh' | 'en' {
  try {
    for (const key of ['stars-manager', 'github-stars-manager']) {
      const storeData = localStorage.getItem(key);
      if (storeData) {
        const parsed = JSON.parse(storeData);
        const lang = parsed.state?.language;
        if (lang === 'en') return 'en';
      }
    }
  } catch { /* ignore */ }
  return 'zh';
}

export function translateBackendError(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  const entry = ERROR_MESSAGES[code];
  if (!entry) return fallback;
  const lang = getCurrentLanguage();
  return entry[lang];
}
