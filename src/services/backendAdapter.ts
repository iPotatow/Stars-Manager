import { translateBackendError } from '../utils/backendErrors';
import { logger } from './logger';

import { Repository, Release, AIConfig, EmbeddingConfig, VectorSearchConfig } from '../types';
import { isReadmeCandidateItem, type GitHubReadmeCandidateItem } from '../utils/readmeVariants';

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

interface GitHubTreeResponse {
  tree?: GitHubReadmeCandidateItem[];
  truncated?: boolean;
}

interface SessionStatus {
  status?: string;
  authenticated?: boolean;
  githubConfigured?: boolean;
}

class BackendAdapter {
  private readonly _backendUrl = '/api';
  private _connected = false;
  private _sessionAuthenticated = false;
  private _githubConfigured = false;
  private _repositoriesRevision: number | undefined;

  async init(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this._backendUrl}/auth/session`, {
        signal: controller.signal,
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json() as SessionStatus;
        if (data.status === 'ok') {
          this._connected = true;
          this._sessionAuthenticated = data.authenticated === true;
          this._githubConfigured = data.githubConfigured === true;
          logger.info('backendAdapter', 'Cloudflare Worker connected', { url: this._backendUrl });
          return;
        }
      }
      this._connected = false;
      this._sessionAuthenticated = false;
      this._githubConfigured = false;
      logger.warn('backendAdapter', 'Cloudflare Worker session endpoint failed', { status: res.status });
    } catch (error) {
      this._connected = false;
      this._sessionAuthenticated = false;
      this._githubConfigured = false;
      logger.warn('backendAdapter', 'Cloudflare Worker unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get isAvailable(): boolean {
    return this._connected;
  }

  get isSessionAuthenticated(): boolean {
    return this._sessionAuthenticated;
  }

  get hasGitHubToken(): boolean {
    return this._githubConfigured;
  }

  get backendUrl(): string {
    return this._backendUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async login(username: string, password: string): Promise<{ githubConfigured: boolean }> {
    const res = await this.fetchWithTimeout(`${this._backendUrl}/auth/login`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ username, password }),
    }, 10000);
    if (!res.ok) await this.throwTranslatedError(res, 'Login error');
    const data = await res.json() as SessionStatus;
    this._sessionAuthenticated = data.authenticated === true;
    this._githubConfigured = data.githubConfigured === true;
    return { githubConfigured: this._githubConfigured };
  }

  async configureGitHubToken(token: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this._backendUrl}/auth/github-token`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ token }),
    });
    if (!res.ok) await this.throwTranslatedError(res, 'GitHub token setup error');
    this._githubConfigured = true;
  }

  async logout(): Promise<void> {
    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }, 10000);
      if (!res.ok) await this.throwTranslatedError(res, 'Logout error');
    } finally {
      this._sessionAuthenticated = false;
      this._githubConfigured = false;
    }
  }

  private async fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If the caller provides a signal, forward its abort to our internal controller
    const callerSignal = options?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      return await fetch(url, {
        ...options,
        credentials: options?.credentials ?? 'same-origin',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Retry wrapper with exponential backoff for transient network errors.
   * Covers browser fetch (Chrome/Firefox/Safari) and Node.js undici fetch.
   */
  private async fetchWithRetry(url: string, options?: RequestInit, timeoutMs = 30000, maxRetries = 3): Promise<Response> {
    const retryStartTime = Date.now();
    const method = (options?.method || 'GET').toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchWithTimeout(url, options, timeoutMs);
      } catch (err) {
        lastError = err as Error;
        const isRetryable =
          lastError.name === 'AbortError' ||
          // Browser messages: Chrome/Edge "Failed to fetch", Firefox "NetworkError...", Safari "Load failed"
          lastError.message?.includes('Failed to fetch') ||
          lastError.message?.includes('NetworkError') ||
          lastError.message?.includes('Load failed') ||
          // Node.js undici: message is "fetch failed", real code is in error.cause
          lastError.message === 'fetch failed' ||
          (lastError as { cause?: { code?: string } }).cause?.code === 'ECONNRESET' ||
          (lastError as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED' ||
          (lastError as { cause?: { code?: string } }).cause?.code === 'UND_ERR_SOCKET' ||
          (lastError as { cause?: { code?: string } }).cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          (lastError as { cause?: { code?: string } }).cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
        if (!isRetryable || attempt === maxRetries) throw lastError;
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        logger.warn('backendAdapter', 'Sync request failed, retrying', { attempt: attempt + 1, maxRetries: maxRetries + 1, delayMs: delay, durationMs: Date.now() - retryStartTime, method, path });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError!;
  }
  private async throwTranslatedError(res: Response, fallbackPrefix: string): Promise<never> {
    let code: string | undefined;
    let detail = '';
    try {
      const data = await res.json();
      code = data.code;
      // Extract nested error details (e.g., DeepSeek returns { error: { message, type, code } })
      if (data.error) {
        const err = data.error;
        detail = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
      } else if (data.message) {
        detail = data.message;
      }
    } catch { /* body not JSON */ }
    const translated = translateBackendError(code, `${fallbackPrefix}: ${res.status}`);
    const error = new Error(detail ? `${translated} - ${detail}` : translated) as Error & { statusCode?: number; code?: string; retryAfterMs?: number };
    error.statusCode = res.status;
    if (code) error.code = code;
    // 后端透传上游 Retry-After 头后，这里解析成毫秒供限流器使用（retry-after-ms 为毫秒，retry-after 为秒）
    if (res.status === 429) {
      const retryAfterMsHeader = res.headers.get('retry-after-ms');
      if (retryAfterMsHeader) {
        const v = Number(retryAfterMsHeader);
        if (Number.isFinite(v) && v > 0) error.retryAfterMs = Math.round(v);
      } else {
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) {
          // Retry-After 可能是「秒数」或「HTTP-date」；数值解析失败时按日期计算剩余时长
          const numeric = Number(retryAfter);
          if (Number.isFinite(numeric) && numeric > 0) {
            error.retryAfterMs = Math.round(numeric * 1000);
          } else {
            const parsedDate = Date.parse(retryAfter);
            if (!Number.isNaN(parsedDate)) {
              const remaining = parsedDate - Date.now();
              if (remaining > 0) error.retryAfterMs = Math.round(remaining);
            }
          }
        }
      }
    }
    throw error;
  }

  // === GitHub Proxy ===

  async fetchStarredRepos(page = 1, perPage = 100): Promise<Repository[]> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/user/starred?page=${page}&per_page=${perPage}&sort=updated`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        method: 'GET',
        headers: { 'Accept': 'application/vnd.github.star+json' }
      })
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Backend proxy error');
    const data = await res.json();
    return (data as Record<string, unknown>[]).map((item) =>
      (item as { starred_at?: string; repo?: Repository }).starred_at && (item as { repo?: Repository }).repo
        ? { ...((item as { repo: Repository }).repo), starred_at: (item as { starred_at: string }).starred_at }
        : item as unknown as Repository
    );
  }

  async getCurrentUser(): Promise<Record<string, unknown>> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/user`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ method: 'GET' })
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Backend proxy error');
    return res.json() as Promise<Record<string, unknown>>;
  }

  private decodeContentResponse(data: GitHubContentResponse): string {
    if (data.encoding === 'base64' && data.content) {
      const binaryStr = atob(data.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
    return data.content || '';
  }

  private encodeContentPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  async getRepositoryReadme(owner: string, repo: string, signal?: AbortSignal): Promise<string> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}/readme`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ method: 'GET' }),
      signal,
    });
    if (res.status === 404) return '';
    if (!res.ok) await this.throwTranslatedError(res, 'Backend proxy error');
    const data = await res.json() as GitHubContentResponse;
    return this.decodeContentResponse(data);
  }

  async listRepositoryReadmeCandidates(owner: string, repo: string, defaultBranch?: string, signal?: AbortSignal): Promise<GitHubReadmeCandidateItem[]> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const fetchRootContents = async (): Promise<GitHubReadmeCandidateItem[]> => {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}/contents`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ method: 'GET' }),
        signal,
      });
      if (!res.ok) return [];
      const data = await res.json() as GitHubReadmeCandidateItem[];
      return data.filter(isReadmeCandidateItem);
    };

    let branch = defaultBranch;
    if (!branch) {
      try {
        const repoRes = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ method: 'GET' }),
          signal,
        });
        if (repoRes.ok) {
          const repoDetails = await repoRes.json() as { default_branch?: string };
          branch = repoDetails.default_branch;
        }
      } catch {
        // Fall back to root contents below
      }
    }

    if (!branch) {
      try {
        return await fetchRootContents();
      } catch {
        return [];
      }
    }

    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ method: 'GET' }),
        signal,
      });
      if (!res.ok) return await fetchRootContents();
      const data = await res.json() as GitHubTreeResponse;
      const candidates = (data.tree || []).filter(isReadmeCandidateItem);
      if (data.truncated) {
        logger.warn('backendAdapter', 'README candidate tree was truncated', { owner, repo });
        if (candidates.length === 0) return await fetchRootContents();
      }
      return candidates;
    } catch {
      try {
        return await fetchRootContents();
      } catch {
        return [];
      }
    }
  }

  async getRepositoryReadmeByPath(owner: string, repo: string, path: string, signal?: AbortSignal): Promise<string> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}/contents/${this.encodeContentPath(path)}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ method: 'GET' }),
      signal,
    });
    if (res.status === 404) return '';
    if (!res.ok) await this.throwTranslatedError(res, 'Backend proxy error');
    const data = await res.json() as GitHubContentResponse;
    return this.decodeContentResponse(data);
  }

  async getRepositoryReleases(owner: string, repo: string, page = 1, perPage = 30): Promise<Record<string, unknown>[]> {
    if (!this._backendUrl) throw new Error('Backend not available');

    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/repos/${owner}/${repo}/releases?page=${page}&per_page=${perPage}`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ method: 'GET' })
      });
      if (!res.ok) return [];
      return res.json() as Promise<Record<string, unknown>[]>;
    } catch {
      return [];
    }
  }

  async checkRateLimit(): Promise<{ remaining: number; reset: number }> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/rate_limit`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ method: 'GET' })
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Backend proxy error');
    const data = await res.json() as { rate: { remaining: number; reset: number } };
    return { remaining: data.rate.remaining, reset: data.rate.reset };
  }

  // === AI Proxy ===

  async proxyAIRequest(configId: string, body: object, signal?: AbortSignal): Promise<unknown> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/ai`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ configId, body }),
      signal,
    }, 120000);
    if (!res.ok) await this.throwTranslatedError(res, 'AI proxy error');
    return res.json();
  }

  async proxyAIRequestWithFallback(configId: string, _aiConfig: { apiType?: string; baseUrl: string; apiKey: string; model: string; reasoningEffort?: string }, body: object, signal?: AbortSignal): Promise<unknown> {
    return this.proxyAIRequest(configId, body, signal);
  }

  async proxyEmbedding(configId: string, texts: string[], purpose: 'document' | 'query', signal?: AbortSignal): Promise<number[][]> {
    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/embedding`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ configId, texts, purpose }),
      signal,
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Embedding proxy error');
    const data = await res.json() as { vectors?: number[][] };
    if (!Array.isArray(data.vectors)) throw new Error('Embedding proxy returned an invalid response');
    return data.vectors;
  }

  async proxyTranslation(
    texts: string[],
    to: string,
    from?: string,
    textType: 'html' | 'plain' = 'plain',
    signal?: AbortSignal,
  ): Promise<Array<{ translatedText: string; detectedLanguage: string }>> {
    const res = await this.fetchWithRetry(`${this._backendUrl}/proxy/translate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ texts, to, from, textType }),
      signal,
    }, 60000, 2);
    if (!res.ok) await this.throwTranslatedError(res, 'Translation proxy error');
    const data = await res.json() as { results?: Array<{ translatedText: string; detectedLanguage: string }> };
    if (!Array.isArray(data.results)) throw new Error('Translation proxy returned an invalid response');
    return data.results;
  }

  // === Data Sync ===

  async syncRepositories(repos: Repository[]): Promise<void> {
    if (!this._backendUrl) return;

    const res = await this.fetchWithRetry(`${this._backendUrl}/repositories`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ repositories: repos, isFullSync: false, expectedRevision: this._repositoriesRevision })
    }, 120000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Sync repositories error');
    const data = await res.json() as { revision?: number };
    if (Number.isInteger(data.revision)) this._repositoriesRevision = data.revision;
  }

  async deleteRepository(id: number): Promise<void> {
    const res = await this.fetchWithRetry(`${this._backendUrl}/repositories/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    }, 30000, 2);
    if (!res.ok) await this.throwTranslatedError(res, 'Delete repository error');
    // The explicit delete is also a versioned write. Refreshing here keeps a
    // subsequent local write from using a stale compare-and-swap value.
    const data = await res.json() as { revision?: number };
    if (Number.isInteger(data.revision)) this._repositoriesRevision = data.revision;
  }

  async fetchRepositories(): Promise<{ repositories: Repository[]; total: number }> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithRetry(`${this._backendUrl}/repositories?limit=10000`, {
      headers: this.getAuthHeaders()
    }, 120000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch error');
    const data = await res.json() as { repositories: Repository[]; total: number; revision?: number };
    if (Number.isInteger(data.revision)) this._repositoriesRevision = data.revision;
    return data;
  }

  async syncReleases(releases: Release[]): Promise<void> {
    if (!this._backendUrl) return;

    const res = await this.fetchWithRetry(`${this._backendUrl}/releases`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ releases })
    }, 120000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Sync releases error');
  }

  async markAllReleasesAsRead(): Promise<{ updated: number }> {
    if (!this._backendUrl) return { updated: 0 };

    const res = await this.fetchWithRetry(`${this._backendUrl}/releases/mark-all-read`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Mark all read error');
    return res.json() as Promise<{ updated: number }>;
  }

  async fetchReleases(): Promise<{ releases: Release[]; total: number }> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithRetry(`${this._backendUrl}/releases?limit=10000`, {
      headers: this.getAuthHeaders()
    }, 120000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch error');
    return res.json() as Promise<{ releases: Release[]; total: number }>;
  }

  async syncAIConfigs(configs: AIConfig[]): Promise<void> {
    if (!this._backendUrl) return;

    // Pre-sync validation: warn about configs that will likely be skipped
    for (const c of configs) {
      if (!c.apiKey) {
        logger.warn('backendAdapter', 'AI config has empty apiKey, will be skipped', { name: c.name, id: c.id });
      }
    }

    const res = await this.fetchWithRetry(`${this._backendUrl}/configs/ai/bulk`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ configs })
    }, 30000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Sync AI configs error');

    // Parse response and throw on partial failure so callers don't clear pending changes
    try {
      const data = await res.json() as { synced?: number; skipped?: number; errors?: Array<{ id: string; name: string; reason: string }> };
      if (data.skipped && data.skipped > 0) {
        const reasons = data.errors?.map(e => `${e.name}: ${e.reason}`).join('; ') ?? '';
        throw new Error(`Sync AI configs partial failure: ${data.skipped} skipped${reasons ? ` (${reasons})` : ''}`);
      }
    } catch (err) {
      // Re-throw our own errors; ignore JSON parse errors from empty responses
      if (err instanceof Error && err.message.startsWith('Sync AI configs partial failure')) throw err;
    }
  }

  async fetchAIConfigs(): Promise<AIConfig[]> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/configs/ai`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch AI configs error');
    return res.json() as Promise<AIConfig[]>;
  }

  // === Embedding Configs ===

  async syncEmbeddingConfigs(configs: EmbeddingConfig[]): Promise<void> {
    if (!this._backendUrl) return;

    const res = await this.fetchWithRetry(`${this._backendUrl}/configs/embedding/bulk`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ configs })
    }, 30000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Sync embedding configs error');

    try {
      const data = await res.json() as { synced?: number; skipped?: number; errors?: Array<{ id: string; name: string; reason: string }> };
      if (data.skipped && data.skipped > 0) {
        const reasons = data.errors?.map(e => `${e.name}: ${e.reason}`).join('; ') ?? '';
        throw new Error(`Sync embedding configs partial failure: ${data.skipped} skipped${reasons ? ` (${reasons})` : ''}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Sync embedding configs partial failure')) throw err;
    }
  }

  async fetchEmbeddingConfigs(): Promise<EmbeddingConfig[]> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/configs/embedding`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch embedding configs error');
    return res.json() as Promise<EmbeddingConfig[]>;
  }

  // === Vector Search Config ===

  async syncVectorSearchConfig(config: VectorSearchConfig): Promise<void> {
    if (!this._backendUrl) return;

    const res = await this.fetchWithRetry(`${this._backendUrl}/configs/vector-search`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(config)
    }, 30000, 3);
    if (!res.ok) await this.throwTranslatedError(res, 'Sync vector search config error');
  }

  async fetchVectorSearchConfig(): Promise<VectorSearchConfig> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/configs/vector-search?decrypt=true`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch vector search config error');
    return res.json() as Promise<VectorSearchConfig>;
  }


  // === Settings (active selections) ===

  async syncSettings(settings: Record<string, unknown>): Promise<void> {
    if (!this._backendUrl) return;

    const res = await this.fetchWithTimeout(`${this._backendUrl}/settings`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(settings)
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Sync settings error');
  }

  async fetchSettings(): Promise<Record<string, unknown>> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/settings`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch settings error');
    return res.json() as Promise<Record<string, unknown>>;
  }

  // === Health ===

  async checkHealth(): Promise<{ status: string; version: string; timestamp: string } | null> {
    if (!this._backendUrl) return null;

    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/health`, {
        headers: this.getAuthHeaders(),
      }, 5000);
      if (res.ok) return res.json() as Promise<{ status: string; version: string; timestamp: string }>;
      return null;
    } catch {
      return null;
    }
  }

  async verifyAuth(): Promise<boolean> {
    if (!this._backendUrl) return false;

    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/settings`, {
        headers: this.getAuthHeaders(),
      }, 5000);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Confirm that the Worker has a stored GitHub credential without returning it. */
  async restoreAuth(): Promise<{ configured: boolean } | null> {
    if (!this._backendUrl) return null;

    try {
      const res = await this.fetchWithTimeout(`${this._backendUrl}/sync/auth`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }, 8000);
      if (!res.ok) return null;
      return res.json() as Promise<{ configured: boolean }>;
    } catch {
      return null;
    }
  }

  // === GitHub Search Proxy ===

  async searchRepositories(queryParams: Record<string, string>): Promise<{ items: Repository[] }> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/search/repositories`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ query_params: queryParams })
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Search repositories proxy error');
    return res.json() as Promise<{ items: Repository[] }>;
  }

  async searchUsers(queryParams: Record<string, string>): Promise<{ items: Array<{
    login: string;
    avatar_url: string;
    html_url: string;
    name: string | null;
    bio: string | null;
    public_repos: number;
    followers: number;
  }> }> {
    if (!this._backendUrl) throw new Error('Backend not available');

    const res = await this.fetchWithTimeout(`${this._backendUrl}/proxy/github/search/users`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ query_params: queryParams })
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Search users proxy error');
    return res.json() as Promise<{ items: Array<{
      login: string;
      avatar_url: string;
      html_url: string;
      name: string | null;
      bio: string | null;
      public_repos: number;
      followers: number;
    }> }>;
  }

  // === MCP admin (Cloudflare Worker Streamable HTTP) ===

  async getMcpStatus(): Promise<{
    enabled: boolean;
    token: string;
    endpoints: { streamableHttp: string };
  }> {
    if (!this._backendUrl) throw new Error('Backend not available');
    const res = await this.fetchWithTimeout(`${this._backendUrl}/mcp/status`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Fetch MCP status error');
    return res.json();
  }

  async updateMcpConfig(body: {
    enabled?: boolean;
    resetToken?: boolean;
  }): Promise<{
    enabled: boolean;
    token: string;
    endpoints: { streamableHttp: string };
  }> {
    if (!this._backendUrl) throw new Error('Backend not available');
    const res = await this.fetchWithTimeout(`${this._backendUrl}/mcp/config`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.throwTranslatedError(res, 'Update MCP config error');
    return res.json();
  }
}

export const backend = new BackendAdapter();
