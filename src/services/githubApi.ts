import {
  Repository,
  Gist,
  GistFile,
  Release,
  GitHubUser,
  ForkRepo,
  GitHubOrganization,
  WorkflowDefinition,
  DiscoveryPlatform,
  ProgrammingLanguage,
  SortBy,
  SortOrder,
  TrendingTimeRange,
  TopicCategory,
  DiscoveryChannelId,
  PaginatedDiscoveryRepositories,
  SubscriptionRepo,
  SubscriptionDev,
  GitHubSearchUserResponse,
  GitHubUserDetail,
} from '../types';
import { logger } from './logger';
import { isReadmeCandidateItem, type GitHubReadmeCandidateItem } from '../utils/readmeVariants';

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

interface GitHubTreeResponse {
  tree?: GitHubReadmeCandidateItem[];
  truncated?: boolean;
}

interface GitHubStarredItem {
  starred_at?: string;
  repo?: Repository;
  [key: string]: unknown;
}

interface GitHubSearchRepoResponse { items: Repository[]; total_count: number; }
interface GitHubRateLimitResponse { rate: { remaining: number; reset: number } }
export interface GistFileInput { filename: string; content: string; }
export interface GistCreateInput { description: string; public: boolean; files: GistFileInput[]; }
export interface GistUpdateInput { description?: string; files?: Array<GistFileInput & { previousFilename?: string; deleted?: boolean }>; }

/**
 * 把 GitHub 返回的 license 值统一为 SPDX id 字符串或 null。
 * 接受 GitHub 原始对象 `{ key, spdx_id, name, url }`、已规范化的字符串、null。
 * 优先取 spdx_id（如 "MIT"），无则回退 key（如 "Other"）。
 */
function toLicenseSpdxId(license: unknown): string | null {
  if (license == null) return null;
  if (typeof license === 'string') return license.trim() || null;
  if (typeof license === 'object') {
    // 运行时校验：malformed 备份/第三方源可能把 spdx_id/key 写成非字符串
    const l = license as { spdx_id?: unknown; key?: unknown };
    const spdx = typeof l.spdx_id === 'string' ? l.spdx_id.trim() : '';
    const key = typeof l.key === 'string' ? l.key.trim() : '';
    return spdx || key || null;
  }
  return null;
}

export interface ReleaseFetchOptions {
  includePreRelease?: boolean;
  /**
   * 开启后，对已同步仓库额外检测“每仓最新一条 Release”的资产指纹是否变化，
   * 并把“资产已变化但 id 已存在”的条目放入 updatedReleases，供调用方按 id 合并更新。
   * 不产生额外网络请求：最新一条 Release 由增量分支第一页（per_page=10）即可获得。
   */
  refreshExistingAssets?: boolean;
}

export interface MultipleReleasesResult {
  /** 新增（本地不存在的 id）的 Release */
  releases: Release[];
  /**
   * 已同步仓库“最新一条”Release（仅当 refreshExistingAssets 开启时收集）。
   * 用于调用方与本地存储做资产指纹比对，指纹变化则合并更新资产，保留 is_read。
   */
  latestReleases?: Release[];
  failedRepos: { repoId: number; full_name: string; error: string }[];
}


export class GitHubApiService {
  private rateLimitRemaining: number | null = null;
  private rateLimitReset: number | null = null;
  private readonly backendUrl = '/api';

  constructor(...legacyArgs: unknown[]) {
    // GitHub credentials remain in the Cloudflare Worker session; the optional
    // argument is accepted for compatibility with product components and is
    // intentionally not retained in the browser.
    void legacyArgs;
  }

  private getBackendHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const startTime = Date.now();
    const method = (options.method || 'GET') as string;
    const fetchOptions = options;

    // Check rate limit before making request
    if (this.rateLimitRemaining !== null && this.rateLimitRemaining < 100 && this.rateLimitReset !== null) {
      const waitMs = (this.rateLimitReset * 1000) - Date.now();
      if (waitMs > 0) {
        logger.warn('githubApi', 'Rate limit low, waiting for reset', { remaining: this.rateLimitRemaining, resetTime: this.rateLimitReset });
        // Honor abort signal during rate limit wait
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve(), waitMs + 1000);
          const signalHandler = () => {
            clearTimeout(timeoutId);
            reject(new Error('Aborted'));
          };
          signal?.addEventListener('abort', signalHandler);
          // Also check if already aborted
          if (signal?.aborted) {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', signalHandler);
            reject(new Error('Aborted'));
          }
        }).catch(err => {
          if (err.message === 'Aborted') throw err;
        });
      }
    }

    // GitHub 的 gist 等端点偶发 502/503/504（网关瞬时故障），这里对 5xx 做指数退避重试，
    // 退避策略与 backendAdapter.fetchWithRetry 保持一致（1s/2s/4s，最多重试 3 次）。
    const maxRetries = 3;
    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const proxyUrl = `${this.backendUrl}/proxy/github${endpoint}`;
        const proxyBody: Record<string, unknown> = { method };
        const requestHeaders = fetchOptions.headers as Record<string, string> | undefined;
        const acceptHeader = requestHeaders?.Accept || requestHeaders?.accept;
        const contentTypeHeader = requestHeaders?.['Content-Type'] || requestHeaders?.['content-type'];
        const proxyHeaders: Record<string, string> = {};
        if (acceptHeader) proxyHeaders.Accept = acceptHeader;
        if (contentTypeHeader) proxyHeaders['Content-Type'] = contentTypeHeader;
        if (Object.keys(proxyHeaders).length > 0) proxyBody.headers = proxyHeaders;
        if (fetchOptions.body) proxyBody.body = fetchOptions.body;

        response = await fetch(proxyUrl, {
          method: 'POST',
          signal,
          credentials: 'same-origin',
          headers: this.getBackendHeaders(),
          body: JSON.stringify(proxyBody),
        });
      } catch (fetchError) {
        const durationMs = Date.now() - startTime;
        // 网络错误（连接断开、DNS 超时、socket hang-up 等）视为可重试的瞬时故障，
        // 仅在最后一次尝试时抛出；之前的尝试会继续走指数退避重试。
        if (attempt === maxRetries || signal?.aborted) {
          logger.error('githubApi', 'API request network error', { method, endpoint, durationMs, attempt: attempt + 1, maxRetries: maxRetries + 1, error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
          throw fetchError;
        }
        logger.warn('githubApi', 'API request network error, retrying', { method, endpoint, attempt: attempt + 1, maxRetries: maxRetries + 1, durationMs, error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
            reject(new Error('Aborted'));
          };
          const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, delayMs);
          signal?.addEventListener('abort', onAbort);
          if (signal?.aborted) onAbort();
        });
        continue;
      }

      // Parse rate limit headers
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const reset = response.headers.get('X-RateLimit-Reset');
      if (remaining !== null) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      if (reset !== null) {
        this.rateLimitReset = parseInt(reset, 10);
      }

      if (response.ok) break;

      const durationMs = Date.now() - startTime;
      if (response.status === 401) {
        logger.warn('githubApi', 'API request failed: unauthorized', { method, endpoint, status: response.status, durationMs });
        throw new Error('GitHub token expired or invalid');
      }
      if (response.status === 403 && this.rateLimitRemaining === 0) {
        const resetDate = this.rateLimitReset
          ? new Date(this.rateLimitReset * 1000).toLocaleString()
          : 'unknown';
        logger.warn('githubApi', 'API request failed: rate limit exceeded', { method, endpoint, status: response.status, durationMs });
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}`);
      }

      // 5xx 视为可重试的瞬时故障；其余 4xx 直接抛出（重试无意义）。
      const isRetryable = response.status >= 500 && response.status <= 599;
      if (!isRetryable || attempt === maxRetries) {
        logger.warn('githubApi', 'API request failed', { method, endpoint, status: response.status, durationMs });
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      // 重试前若请求已被取消，则不再等待，直接以当前失败状态抛出。
      if (signal?.aborted) {
        logger.warn('githubApi', 'API request aborted before retry', { method, endpoint, status: response.status });
        throw new Error('Aborted');
      }
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
      logger.warn('githubApi', 'API request failed, retrying', { method, endpoint, status: response.status, attempt: attempt + 1, maxRetries: maxRetries + 1, delayMs, durationMs });
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timeoutId);
          signal?.removeEventListener('abort', onAbort);
          reject(new Error('Aborted'));
        };
        const timeoutId = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        signal?.addEventListener('abort', onAbort);
        if (signal?.aborted) onAbort();
      });
    }

    // 循环正常退出时 response 一定已赋值（最后一次成功 break 或在循环内抛出）。
    const finalResponse = response!;

    const data = finalResponse.status === 204 ? null : await finalResponse.json();

    // 如果是starred repositories的响应，需要处理特殊格式
    if (endpoint.includes('/user/starred') && Array.isArray(data)) {
      return data.map((item: GitHubStarredItem) => {
        // 如果使用了star+json格式，数据结构会不同
        if (item.starred_at && item.repo) {
          return {
            ...item.repo,
            // 归一化 GitHub 的 license 值（对象/字符串/null）为 SPDX id 字符串或 null
            license: toLicenseSpdxId(item.repo.license),
            starred_at: item.starred_at
          };
        }
        return {
          ...item,
          license: toLicenseSpdxId(item.license),
        };
      }) as T;
    }

    return data;
  }

  async getCurrentUser(): Promise<GitHubUser> {
    return this.makeRequest<GitHubUser>('/user');
  }

  async getStarredRepositories(page = 1, perPage = 100): Promise<Repository[]> {
    const repos = await this.makeRequest<Repository[]>(
      `/user/starred?page=${page}&per_page=${perPage}&sort=updated`,
      {
        headers: {
          'Accept': 'application/vnd.github.star+json'
        }
      }
    );
    return repos;
  }

  async getAllStarredRepositories(): Promise<Repository[]> {
    let allRepos: Repository[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const repos = await this.getStarredRepositories(page, perPage);
      if (repos.length === 0) break;

      allRepos = [...allRepos, ...repos];

      if (repos.length < perPage) break;
      page++;

      // Rate limiting protection
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allRepos;
  }

  private mergeGistMetadata(existing: Gist | undefined, incoming: Gist, starred?: boolean): Gist {
    // 列表 API 不返回文件内容，深度合并文件以保留已加载过的 content；
    // starred 仅信任显式传入或接口新值，不再回退到缓存，避免取消收藏后状态陈旧。
    const mergedFiles: Record<string, GistFile> = { ...incoming.files };
    if (existing?.files) {
      for (const [filename, file] of Object.entries(mergedFiles)) {
        const existingFile = existing.files[filename];
        if (existingFile) {
          // 优先保留已加载过的完整内容：
          // - incoming.content 不存在（列表 API 不返回 content）
          // - incoming 标记为截断，而 existing 已有完整内容
          const incomingIncomplete = file.content === undefined || (file.truncated && existingFile.content !== undefined && !existingFile.truncated);
          if (incomingIncomplete && existingFile.content !== undefined) {
            mergedFiles[filename] = { ...file, content: existingFile.content, truncated: false };
          }
        }
      }
    }

    return {
      ...incoming,
      files: mergedFiles,
      starred: starred ?? incoming.starred,
      ai_summary: existing?.ai_summary,
      analyzed_at: existing?.analyzed_at,
      analysis_failed: existing?.analysis_failed,
      analysis_error: existing?.analysis_error,
      last_edited: existing?.last_edited,
    };
  }

  async getGists(page = 1, perPage = 100): Promise<Gist[]> {
    return this.makeRequest<Gist[]>(`/gists?page=${page}&per_page=${perPage}`);
  }

  async getAllGists(existingGists: Gist[] = []): Promise<Gist[]> {
    let allGists: Gist[] = [];
    let page = 1;
    const perPage = 100;
    const existingById = new Map(existingGists.map(gist => [gist.id, gist]));

    while (true) {
      const gists = await this.getGists(page, perPage);
      if (gists.length === 0) break;

      allGists = [
        ...allGists,
        ...gists.map(gist => this.mergeGistMetadata(existingById.get(gist.id), gist)),
      ];

      if (gists.length < perPage) break;
      page++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allGists;
  }

  async getStarredGists(page = 1, perPage = 100): Promise<Gist[]> {
    return this.makeRequest<Gist[]>(`/gists/starred?page=${page}&per_page=${perPage}`);
  }

  async getAllStarredGists(existingGists: Gist[] = []): Promise<Gist[]> {
    let allGists: Gist[] = [];
    let page = 1;
    const perPage = 100;
    const existingById = new Map(existingGists.map(gist => [gist.id, gist]));

    while (true) {
      const gists = await this.getStarredGists(page, perPage);
      if (gists.length === 0) break;

      allGists = [
        ...allGists,
        ...gists.map(gist => this.mergeGistMetadata(existingById.get(gist.id), gist, true)),
      ];

      if (gists.length < perPage) break;
      page++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allGists;
  }

  async getGist(gistId: string, existing?: Gist): Promise<Gist> {
    const gist = await this.makeRequest<Gist>(`/gists/${encodeURIComponent(gistId)}`);
    return this.mergeGistMetadata(existing, gist, existing?.starred);
  }

  /**
   * 获取 gist 用于 AI 分析。正常走详情 API；若详情 API 返回 5xx（如某些 gist 稳定 502），
   * 则降级用缓存元数据 + raw_url 拉取文件内容，确保分析不中断。
   */
  async getGistForAnalysis(gistId: string, existing?: Gist, signal?: AbortSignal): Promise<Gist> {
    try {
      return await this.getGist(gistId, existing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isServerFailure = /5\d{2}/.test(msg);
      if (!isServerFailure || !existing) throw err;

      // 降级：用 existing 的元数据，从 raw_url 逐个拉取文件内容
      const files = { ...existing.files };
      const entries = Object.entries(files);
      await Promise.all(entries.map(async ([filename, file]) => {
        if (file.content || !file.raw_url) return;
        try {
          const content = await this.getGistFileRaw(file.raw_url, signal);
          files[filename] = { ...file, content, truncated: false };
        } catch { /* 单文件失败不影响其他文件 */ }
      }));
      return { ...existing, files };
    }
  }

  /**
   * 拉取 gist 单个文件的原始内容。
   * 用于 GitHub gist 详情 API 返回 truncated:true（文件 >1MB，content 被省略）时的回退取数。
   * raw_url 指向 gist.githubusercontent.com，通过 Worker 的白名单代理读取。
   */
  async getGistFileRaw(rawUrl: string, signal?: AbortSignal): Promise<string> {
    const proxyUrl = `${this.backendUrl}/proxy/github-raw`;
    const response = await fetch(proxyUrl, {
      method: 'POST',
      signal,
      credentials: 'same-origin',
      headers: this.getBackendHeaders(),
      body: JSON.stringify({ url: rawUrl }),
    });
    if (!response.ok) {
      let detail = response.statusText;
      try { const data = await response.json(); detail = (data as { error?: string }).error || detail; } catch { /* ignore */ }
      throw new Error(`GitHub raw proxy error: ${response.status} ${detail}`);
    }
    return response.text();
  }

  async unstarGist(gistId: string): Promise<void> {
    await this.makeRequest<void>(`/gists/${encodeURIComponent(gistId)}/star`, {
      method: 'DELETE',
    });
  }

  async starGist(gistId: string): Promise<void> {
    await this.makeRequest<void>(`/gists/${encodeURIComponent(gistId)}/star`, { method: 'PUT' });
  }

  async createGist(input: GistCreateInput): Promise<Gist> {
    const files: Record<string, { content: string }> = {};
    input.files.forEach(file => { files[file.filename] = { content: file.content }; });
    return this.makeRequest<Gist>('/gists', { method: 'POST', body: JSON.stringify({ description: input.description, public: input.public, files }) });
  }

  async updateGist(gistId: string, input: GistUpdateInput, existing?: Gist): Promise<Gist> {
    const files: Record<string, { content?: string } | null> = {};
    input.files?.forEach(file => {
      if (file.deleted) files[file.previousFilename || file.filename] = null;
      else {
        if (file.previousFilename && file.previousFilename !== file.filename) files[file.previousFilename] = null;
        files[file.filename] = { content: file.content };
      }
    });
    const gist = await this.makeRequest<Gist>(`/gists/${encodeURIComponent(gistId)}`, { method: 'PATCH', body: JSON.stringify({ description: input.description, files }) });
    return this.mergeGistMetadata(existing, gist, existing?.starred);
  }

  async deleteGist(gistId: string): Promise<void> {
    await this.makeRequest<void>(`/gists/${encodeURIComponent(gistId)}`, { method: 'DELETE' });
  }

  getGistContentPreview(gist: Gist, maxChars = 6000): string {
    return Object.values(gist.files || {})
      .map((file: GistFile) => {
        const content = file.content || '';
        return `### ${file.filename}\n${content.slice(0, maxChars)}`;
      })
      .join('\n\n')
      .slice(0, maxChars);
  }

  async getWatchedRepositories(page = 1, perPage = 100, username?: string): Promise<Repository[]> {
    const endpoint = username
      ? `/users/${encodeURIComponent(username)}/subscriptions?page=${page}&per_page=${perPage}`
      : `/user/subscriptions?page=${page}&per_page=${perPage}`;
    // GitHub 对 watched repos 同样返回原始 license 对象，这里统一归一化为 SPDX id / null，
    // 与 /user/starred 路径保持一致，避免下游 normalizeLicense 拿到对象时崩溃。
    const repos = await this.makeRequest<Repository[]>(endpoint);
    return repos.map((repo) => ({ ...repo, license: toLicenseSpdxId(repo.license) }));
  }

  async getAllWatchedRepositories(username?: string): Promise<Repository[]> {
    let allRepos: Repository[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const repos = await this.getWatchedRepositories(page, perPage, username);
      if (repos.length === 0) break;

      allRepos = [...allRepos, ...repos];

      if (repos.length < perPage) break;
      page++;

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allRepos;
  }

  async getAllWatchedRepositoriesForCurrentUser(): Promise<Repository[]> {
    const currentUser = await this.getCurrentUser();
    const [privateAware, publicProfile] = await Promise.all([
      this.getAllWatchedRepositories(),
      this.getAllWatchedRepositories(currentUser.login),
    ]);
    const reposByName = new Map<string, Repository>();
    [...privateAware, ...publicProfile].forEach(repo => {
      reposByName.set(repo.full_name.toLowerCase(), repo);
    });
    return Array.from(reposByName.values());
  }

  private decodeContentResponse(response: GitHubContentResponse): string {
    if (response.encoding === 'base64' && response.content) {
      // 使用 TextDecoder 正确处理 UTF-8 编码，避免中文乱码
      const binaryString = atob(response.content.replace(/\s/g, ''));
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    return response.content || '';
  }

  private encodeContentPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  async getRepositoryReadme(owner: string, repo: string, signal?: AbortSignal): Promise<string> {
    try {
      const response = await this.makeRequest<GitHubContentResponse>(
        `/repos/${owner}/${repo}/readme`,
        undefined,
        signal
      );

      return this.decodeContentResponse(response);
    } catch (error) {
      logger.warn('githubApi', `Failed to fetch README for ${owner}/${repo}`, error);
      return '';
    }
  }

  async listRepositoryReadmeCandidates(owner: string, repo: string, defaultBranch?: string, signal?: AbortSignal): Promise<GitHubReadmeCandidateItem[]> {
    const fetchRootContents = async (): Promise<GitHubReadmeCandidateItem[]> => {
      const rootItems = await this.makeRequest<GitHubReadmeCandidateItem[]>(
        `/repos/${owner}/${repo}/contents`,
        undefined,
        signal
      );
      return rootItems.filter(isReadmeCandidateItem);
    };

    let branch = defaultBranch;
    if (!branch) {
      try {
        const repoDetails = await this.makeRequest<{ default_branch?: string }>(
          `/repos/${owner}/${repo}`,
          undefined,
          signal
        );
        branch = repoDetails.default_branch;
      } catch (error) {
        logger.warn('githubApi', `Failed to fetch default branch for ${owner}/${repo}`, error);
      }
    }

    if (!branch) {
      try {
        return await fetchRootContents();
      } catch (error) {
        logger.warn('githubApi', `Failed to list README candidates for ${owner}/${repo}`, error);
        return [];
      }
    }

    try {
      const tree = await this.makeRequest<GitHubTreeResponse>(
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        undefined,
        signal
      );
      const candidates = (tree.tree || []).filter(isReadmeCandidateItem);
      if (tree.truncated) {
        logger.warn('githubApi', `README candidate tree was truncated for ${owner}/${repo}`);
        if (candidates.length === 0) return await fetchRootContents();
      }
      return candidates;
    } catch (error) {
      logger.warn('githubApi', `Failed to list README candidates from tree for ${owner}/${repo}`, error);
      try {
        return await fetchRootContents();
      } catch (contentsError) {
        logger.warn('githubApi', `Failed to list README candidates from root contents for ${owner}/${repo}`, contentsError);
        return [];
      }
    }
  }

  async getRepositoryReadmeByPath(owner: string, repo: string, path: string, signal?: AbortSignal): Promise<string> {
    try {
      const response = await this.makeRequest<GitHubContentResponse>(
        `/repos/${owner}/${repo}/contents/${this.encodeContentPath(path)}`,
        undefined,
        signal
      );

      return this.decodeContentResponse(response);
    } catch (error) {
      logger.warn('githubApi', `Failed to fetch README ${path} for ${owner}/${repo}`, error);
      return '';
    }
  }

  async getRepositoryReleases(owner: string, repo: string, page = 1, perPage = 30): Promise<Release[]> {
    try {
      const releases = await this.makeRequest<Release[]>(
        `/repos/${owner}/${repo}/releases?page=${page}&per_page=${perPage}`
      );

      return releases.map(release => ({
        id: release.id,
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || '',
        published_at: release.published_at,
        html_url: release.html_url,
        assets: release.assets || [],
        zipball_url: release.zipball_url,
        tarball_url: release.tarball_url,
        prerelease: release.prerelease ?? false,
        repository: {
          id: 0,
          full_name: `${owner}/${repo}`,
          name: repo,
        },
      }));
    } catch (error) {
      logger.warn('githubApi', `Failed to fetch releases for ${owner}/${repo}`, error);
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Fetch all releases for a repository with pagination.
   * New repos (never synced) use this for full sync - paginates until exhausted.
   */
  async fetchAllReleasesForRepo(owner: string, repo: string): Promise<Release[]> {
    const allReleases: Release[] = [];
    let page = 1;

    while (true) {
      const batch = await this.makeRequest<Release[]>(
        `/repos/${owner}/${repo}/releases?page=${page}&per_page=30`
      );

      if (batch.length === 0) break;

      const mapped = batch.map(release => ({
        id: release.id,
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || '',
        published_at: release.published_at,
        html_url: release.html_url,
        assets: release.assets || [],
        zipball_url: release.zipball_url,
        tarball_url: release.tarball_url,
        prerelease: release.prerelease ?? false,
        repository: {
          id: 0,
          full_name: `${owner}/${repo}`,
          name: repo,
        },
      }));

      allReleases.push(...mapped);

      if (batch.length < 30) break;
      page++;

      // Rate limiting protection between pages
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allReleases;
  }

  async getMultipleRepositoryReleases(
    repositories: Repository[],
    options: ReleaseFetchOptions = {}
  ): Promise<MultipleReleasesResult> {
    const startTime = Date.now();
    const { includePreRelease = true, refreshExistingAssets = false } = options;
    const allReleases: Release[] = [];
    const latestReleases: Release[] = [];
    const failedRepos: { repoId: number; full_name: string; error: string }[] = [];

    // Controlled concurrency: process 3 repos at a time
    const concurrency = 3;
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, repositories.length) }, async () => {
      while (true) {
        const currentIndex = index++;
        if (currentIndex >= repositories.length) break;

        const repo = repositories[currentIndex];
        const [owner, name] = repo.full_name.split('/');

        try {
          let releases: Release[];

          if (!repo.has_fetched_releases) {
            // New subscription: full sync (fetch up to 30)
            releases = await this.fetchAllReleasesForRepo(owner, name);
          } else {
            // Already synced: incremental sync with pagination until we cross the watermark
            const sinceTime = repo.last_release_fetch_time
              ? new Date(repo.last_release_fetch_time)
              : null;

            let page = 1;
            releases = [];
            // 资产刷新：收集“每仓最新一条、且符合预发布过滤的 Release”。
            // 当 includePreRelease=false 且前几页全是预发布时，需继续翻页找最新正式版，
            // 不能只看 page=1 就停（否则正式版资产变化会被漏掉）。
            let collectedLatest = false;
            while (true) {
              const batch = await this.getRepositoryReleases(owner, name, page, 10);

              if (batch.length === 0) break;

              if (refreshExistingAssets && !collectedLatest && batch.length > 0) {
                const latest = includePreRelease
                  ? batch[0]
                  : batch.find(r => !r.prerelease);
                if (latest) {
                  latest.repository.id = repo.id;
                  latestReleases.push(latest);
                  collectedLatest = true;
                }
              }

              const fresh = sinceTime
                ? batch.filter(r => new Date(r.published_at) > sinceTime)
                : batch;

              releases.push(...fresh);

              // 未收集到符合过滤条件的最新 Release 时，即使已触达水印也继续翻页，
              // 直到找到候选或耗尽分页（避免前 10 条全是预发布时漏掉正式版）。
              const needMoreForLatest = refreshExistingAssets && !collectedLatest && batch.length >= 10;
              if (needMoreForLatest) {
                page++;
                continue;
              }

              // Stop if we hit the watermark or ran out of data
              if (
                batch.length < 10 ||
                (sinceTime && batch.some(r => new Date(r.published_at) <= sinceTime))
              ) {
                break;
              }

              page++;
            }
          }

          // Add repository info to releases
          releases.forEach(release => {
            release.repository.id = repo.id;
          });

          // Filter by pre-release setting
          if (!includePreRelease) {
            releases = releases.filter(r => !r.prerelease);
          }

          allReleases.push(...releases);
        } catch (error) {
          failedRepos.push({
            repoId: repo.id,
            full_name: repo.full_name,
            error: error instanceof Error ? error.message : String(error)
          });
        }

        // Rate limiting protection between repos
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    });

    await Promise.all(workers);

    // Sort by published date (newest first)
    const sortedReleases = allReleases.sort((a, b) =>
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

    logger.info('githubApi', 'Update releases completed', { repoCount: repositories.length, releaseCount: sortedReleases.length, latestReleaseCount: latestReleases.length, durationMs: Date.now() - startTime });

    if (refreshExistingAssets) {
      const latest = includePreRelease
        ? latestReleases
        : latestReleases.filter(r => !r.prerelease);
      return { releases: sortedReleases, latestReleases: latest, failedRepos };
    }
    return { releases: sortedReleases, failedRepos };
  }

  // 新增：获取仓库的增量releases（基于时间戳）
  async getIncrementalRepositoryReleases(
    owner: string,
    repo: string,
    since?: string,
    perPage = 10
  ): Promise<Release[]> {
    try {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}`;

      const releases = await this.makeRequest<Release[]>(endpoint);

      const mappedReleases = releases.map(release => ({
        id: release.id,
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || '',
        published_at: release.published_at,
        html_url: release.html_url,
        assets: release.assets || [],
        zipball_url: release.zipball_url,
        tarball_url: release.tarball_url,
        prerelease: release.prerelease ?? false,
        repository: {
          id: 0,
          full_name: `${owner}/${repo}`,
          name: repo,
        },
      }));

      // 如果提供了since时间戳，只返回更新的releases
      if (since) {
        const sinceDate = new Date(since);
        return mappedReleases.filter(release =>
          new Date(release.published_at) > sinceDate
        );
      }

      return mappedReleases;
    } catch (error) {
      logger.warn('githubApi', `Failed to fetch incremental releases for ${owner}/${repo}`, error);
      return [];
    }
  }

  async unstarRepository(owner: string, repo: string): Promise<void> {
    await this.makeRequest<void>(`/user/starred/${owner}/${repo}`, {
      method: 'DELETE',
    });
  }

  async starRepository(owner: string, repo: string): Promise<void> {
    await this.makeRequest<void>(`/user/starred/${owner}/${repo}`, { method: 'PUT' });
  }

  async checkRateLimit(): Promise<{ remaining: number; reset: number }> {
    const response = await this.makeRequest<GitHubRateLimitResponse>('/rate_limit');
    return response.rate;
  }

  private buildPlatformQuery(platform: DiscoveryPlatform): string {
    return platform === 'Android' ? 'android' : platform === 'Macos' ? 'macos OR mac OR osx' : platform === 'Windows' ? 'windows' : platform === 'Linux' ? 'linux' : '';
  }

  async searchMostStars(perPage = 10): Promise<SubscriptionRepo[]> {
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=${perPage}`);
    return (data.items || []).map((repo, index) => ({ ...repo, rank: index + 1, channel: 'most-stars' as const }));
  }

  async searchMostForks(perPage = 10): Promise<SubscriptionRepo[]> {
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=forks:>1000&sort=forks&order=desc&per_page=${perPage}`);
    return (data.items || []).map((repo, index) => ({ ...repo, rank: index + 1, channel: 'most-forks' as const }));
  }

  async searchTrending(perPage = 10, timeRange: TrendingTimeRange = 'weekly'): Promise<SubscriptionRepo[]> {
    const since = timeRange === 'daily' ? 1 : timeRange === 'monthly' ? 30 : 7;
    const date = new Date(Date.now() - since * 86400000).toISOString().slice(0, 10);
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=pushed:>=${date}&sort=stars&order=desc&per_page=${perPage}`);
    return (data.items || []).map((repo, index) => ({ ...repo, rank: index + 1, channel: 'trending' as const }));
  }

  async searchDailyDevs(perPage = 10): Promise<SubscriptionDev[]> {
    const users = await this.makeRequest<GitHubSearchUserResponse>(`/search/users?q=followers:>1000&sort=followers&order=desc&per_page=${perPage}`);
    return Promise.all((users.items || []).map(async (user, index) => {
      let detail: GitHubUserDetail = { login: user.login, avatar_url: user.avatar_url, html_url: user.html_url, name: null, bio: null, public_repos: 0, followers: 0 };
      try { detail = await this.makeRequest<GitHubUserDetail>(`/users/${encodeURIComponent(user.login)}`); } catch { /* retain search result */ }
      let topRepo: SubscriptionRepo | null = null;
      try { const repos = await this.makeRequest<Repository[]>(`/users/${encodeURIComponent(user.login)}/repos?sort=stars&per_page=1`); if (repos[0]) topRepo = { ...repos[0], rank: 1, channel: 'most-dev' }; } catch { /* optional */ }
      return { rank: index + 1, login: detail.login, avatar_url: detail.avatar_url, html_url: detail.html_url, name: detail.name, bio: detail.bio, public_repos: detail.public_repos, followers: detail.followers, topRepo };
    }));
  }

  private buildLanguageQuery(language: ProgrammingLanguage): string {
    if (language === 'All') return '';
    const value = language === 'CSharp' ? 'C#' : language === 'CPlusPlus' ? 'C++' : language;
    return `language:${value}`;
  }

  private buildSortParams(sortBy: SortBy, sortOrder: SortOrder): { sort: string; order: string } {
    return { sort: sortBy === 'MostStars' ? 'stars' : sortBy === 'MostForks' ? 'forks' : 'best-match', order: sortOrder === 'Ascending' ? 'asc' : 'desc' };
  }

  private mapDiscoveryResults(data: GitHubSearchRepoResponse, channel: DiscoveryChannelId, platform: DiscoveryPlatform, page: number, perPage: number): PaginatedDiscoveryRepositories {
    const repos = (data.items || []).map((repo, index) => ({ ...repo, rank: (page - 1) * perPage + index + 1, channel, platform }));
    return { repos, hasMore: repos.length === perPage, nextPageIndex: page + 1, totalCount: data.total_count };
  }

  async getTrendingRepositories(platform: DiscoveryPlatform, page = 1, perPage = 20, timeRange: TrendingTimeRange = 'weekly'): Promise<PaginatedDiscoveryRepositories> {
    const days = timeRange === 'daily' ? 1 : timeRange === 'monthly' ? 30 : 7;
    const date = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    let query = `pushed:>=${date} archived:false`;
    const platformQuery = this.buildPlatformQuery(platform); if (platformQuery) query += ` ${platformQuery}`;
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`);
    return this.mapDiscoveryResults(data, 'trending', platform, page, perPage);
  }

  async getHotReleaseRepositories(platform: DiscoveryPlatform, page = 1, perPage = 20): Promise<PaginatedDiscoveryRepositories> {
    const date = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    let query = `stars:>10 archived:false pushed:>=${date}`; const platformQuery = this.buildPlatformQuery(platform); if (platformQuery) query += ` ${platformQuery}`;
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}&page=${page}`);
    return this.mapDiscoveryResults(data, 'hot-release', platform, page, perPage);
  }

  async getMostPopular(platform: DiscoveryPlatform, page = 1, perPage = 20): Promise<PaginatedDiscoveryRepositories> {
    let query = 'stars:>1000 archived:false'; const platformQuery = this.buildPlatformQuery(platform); if (platformQuery) query += ` ${platformQuery}`;
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`);
    return this.mapDiscoveryResults(data, 'most-popular', platform, page, perPage);
  }

  async searchByTopic(keywords: string, platform: DiscoveryPlatform, page = 1, perPage = 20): Promise<PaginatedDiscoveryRepositories> {
    let query = `${keywords} in:name,description,topics stars:>10 archived:false`; const platformQuery = this.buildPlatformQuery(platform); if (platformQuery) query += ` ${platformQuery}`;
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`);
    return this.mapDiscoveryResults(data, 'topic', platform, page, perPage);
  }

  async getTopicRepositories(topic: TopicCategory, platform: DiscoveryPlatform, page = 1, perPage = 20): Promise<PaginatedDiscoveryRepositories> {
    const keywords: Record<TopicCategory, string> = { ai: 'artificial-intelligence machine-learning ai', ml: 'machine-learning deep-learning neural-network', database: 'database sql nosql', web: 'web frontend backend react vue', mobile: 'mobile android ios flutter', devtools: 'devtools ide editor tools', security: 'security cybersecurity encryption', game: 'game game-engine unity unreal' };
    return this.searchByTopic(keywords[topic], platform, page, perPage);
  }

  async searchRepositories(query: string, platform: DiscoveryPlatform, language: ProgrammingLanguage, sortBy: SortBy, sortOrder: SortOrder, page = 1, perPage = 20): Promise<PaginatedDiscoveryRepositories> {
    let searchQuery = `${query} archived:false`; const platformQuery = this.buildPlatformQuery(platform); if (platformQuery) searchQuery += ` ${platformQuery}`; const languageQuery = this.buildLanguageQuery(language); if (languageQuery) searchQuery += ` ${languageQuery}`;
    const sort = this.buildSortParams(sortBy, sortOrder);
    const data = await this.makeRequest<GitHubSearchRepoResponse>(`/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=${sort.sort}&order=${sort.order}&per_page=${perPage}&page=${page}`);
    return this.mapDiscoveryResults(data, 'search', platform, page, perPage);
  }

  async getUserOrganizations(): Promise<GitHubOrganization[]> {
    return this.getPaginatedFromEndpoint<GitHubOrganization>('/user/orgs');
  }

  private async getPaginatedFromEndpoint<T>(endpoint: string): Promise<T[]> {
    const result: T[] = []; let page = 1; const perPage = 100;
    while (true) { const separator = endpoint.includes('?') ? '&' : '?'; const items = await this.makeRequest<T[]>(`${endpoint}${separator}per_page=${perPage}&page=${page}`); result.push(...items); if (items.length < perPage) return result; page++; }
  }

  async getUserForks(): Promise<ForkRepo[]> { return this.getPaginatedFromEndpoint<ForkRepo>('/user/repos?type=forks&sort=updated'); }
  async getOrganizationForks(orgLogin: string): Promise<ForkRepo[]> { return this.getPaginatedFromEndpoint<ForkRepo>(`/orgs/${encodeURIComponent(orgLogin)}/repos?type=forks&sort=updated`); }

  async syncFork(owner: string, repo: string, branch: string): Promise<{ hasUpdates: boolean; sourceUpdatedAt: string | null; mergeType?: string }> {
    const result = await this.makeRequest<{ merge_type: string }>(`/repos/${owner}/${repo}/merge-upstream`, { method: 'POST', body: JSON.stringify({ branch }) });
    return { hasUpdates: result.merge_type !== 'none', sourceUpdatedAt: new Date().toISOString(), mergeType: result.merge_type };
  }

  async checkForkSyncNeeded(owner: string, repo: string, branch: string, parentFullName?: string): Promise<{ needsSync: boolean; parentFullName?: string; parentHtmlUrl?: string }> {
    try {
      let parent = parentFullName; let parentHtmlUrl: string | undefined;
      if (!parent) { const data = await this.makeRequest<{ parent?: { owner: { login: string }; full_name: string; html_url: string } }>(`/repos/${owner}/${repo}`); if (!data.parent) return { needsSync: false }; parent = data.parent.full_name; parentHtmlUrl = data.parent.html_url; }
      const parentOwner = parent.split('/')[0]; const compare = await this.makeRequest<{ behind_by: number }>(`/repos/${owner}/${repo}/compare/${parentOwner}:${branch}...${owner}:${branch}`);
      return { needsSync: compare.behind_by > 0, parentFullName: parent, parentHtmlUrl };
    } catch { return { needsSync: false }; }
  }

  async getBranches(owner: string, repo: string): Promise<string[]> {
    try { const branches = await this.makeRequest<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=100`); return branches.map(branch => branch.name); } catch { return []; }
  }

  async getRepositoryWorkflows(owner: string, repo: string): Promise<WorkflowDefinition[]> {
    try { const data = await this.makeRequest<{ workflows: WorkflowDefinition[] }>(`/repos/${owner}/${repo}/actions/workflows?per_page=100`); return data.workflows || []; } catch { return []; }
  }

  async triggerWorkflowRun(owner: string, repo: string, workflowPath: string, branch: string): Promise<void> {
    await this.makeRequest<void>(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowPath)}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: branch }) });
  }

};
