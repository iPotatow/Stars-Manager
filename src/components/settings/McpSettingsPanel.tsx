import Vue, { useCallback, useEffect, useMemo, useState } from "../../vue-runtime.ts";
import {
  Cable,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  AlertCircle,
} from '@lucide/vue';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backendAdapter';
import { useDialog } from '../../hooks/useDialog';

interface McpSettingsPanelProps {
  t: (zh: string, en: string) => string;
}

export const McpSettingsPanel: Vue.FC<McpSettingsPanelProps> = ({ t }) => {
  const { mcpConfig, setMcpConfig } = useAppStore();
  const { toast, confirm } = useDialog();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [endpoints, setEndpoints] = useState({
    streamableHttp: '/mcp',
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mcpHttpUrl = `${window.location.origin}${endpoints.streamableHttp}`;

  // Cloudflare Workers exposes the stateless Streamable HTTP transport only.
  const agentConfigJson = useMemo(() => {
    const config = {
      mcpServers: {
        'stars-manager': {
          url: mcpHttpUrl,
          headers: {
            Authorization: `Bearer ${mcpConfig.token || '<token>'}`,
          },
        },
      },
    };
    return JSON.stringify(config, null, 2);
  }, [mcpHttpUrl, mcpConfig.token]);

  const refreshFromBackend = useCallback(async () => {
    if (!backend.isAvailable) {
      setError(t('Cloudflare Worker 未连接', 'Cloudflare Worker is not connected'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await backend.getMcpStatus();
      setMcpConfig({
        enabled: status.enabled,
        token: status.token,
      });
      setEndpoints(status.endpoints);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setMcpConfig, t]);

  useEffect(() => {
    void refreshFromBackend();
  }, [refreshFromBackend]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast(t('已复制', 'Copied'), 'success');
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast(t('复制失败', 'Copy failed'), 'error');
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (!backend.isAvailable) throw new Error(t('Cloudflare Worker 未连接', 'Cloudflare Worker is not connected'));
      const result = await backend.updateMcpConfig({ enabled });
      setMcpConfig({ enabled: result.enabled, token: result.token });
      setEndpoints(result.endpoints);
      toast(
        enabled ? t('MCP 服务已开启', 'MCP server enabled') : t('MCP 服务已关闭', 'MCP server disabled'),
        'success'
      );
    } catch (err) {
      setError((err as Error).message);
      toast(t('操作失败', 'Operation failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToken = async () => {
    if (!mcpConfig.enabled) {
      toast(
        t('请先开启 MCP 服务再重置 Token', 'Enable MCP before resetting the token'),
        'error'
      );
      return;
    }
    const ok = await confirm(
      t('重置 MCP Token', 'Reset MCP Token'),
      t(
        '重置后旧 Token 立即失效，需要更新 Agent 配置。是否继续？',
        'The old token will stop working immediately. Update your agent config. Continue?'
      )
    );
    if (!ok) return;

    setSaving(true);
    try {
      if (!backend.isAvailable) throw new Error(t('Cloudflare Worker 未连接', 'Cloudflare Worker is not connected'));
      const result = await backend.updateMcpConfig({ resetToken: true, enabled: true });
      setMcpConfig({ token: result.token, enabled: result.enabled });
      toast(t('Token 已重置', 'Token reset'), 'success');
    } catch (err) {
      setError((err as Error).message);
      toast(t('重置失败', 'Reset failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = mcpConfig.enabled
    ? t('运行中', 'Running')
    : t('已停止', 'Stopped');

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Cable className="w-6 h-6 text-gray-700 dark:text-text-secondary" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-text-primary">
          {t('MCP 服务', 'MCP Server')}
        </h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-text-tertiary">
        {t(
          'Claude Code、Cursor 等 Agent 可以通过 Streamable HTTP 读取 Star、AI 摘要和标签。服务默认关闭。',
          'Claude Code, Cursor, and other agents can read stars, AI summaries, and tags through Streamable HTTP. The service is off by default.'
        )}
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Enable + status */}
      <div className="gsm-panel space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-text-primary">
              {t('启用 MCP 服务', 'Enable MCP Server')}
            </h4>
            <p className="text-xs text-gray-500 dark:text-text-tertiary mt-1">
              {t('Cloudflare Worker：挂载于 /mcp', 'Cloudflare Worker: mounted at /mcp')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mcpConfig.enabled}
            disabled={saving || loading}
            onClick={() => void handleToggle(!mcpConfig.enabled)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-violet focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
              mcpConfig.enabled ? 'bg-brand-violet' : 'bg-gray-200 dark:bg-white/10'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                mcpConfig.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          ) : mcpConfig.enabled ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-gray-700 dark:text-text-secondary">
            {t('状态', 'Status')}: {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => void refreshFromBackend()}
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
            aria-label={t('刷新', 'Refresh')}
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>

      </div>

      {/* Token */}
      <div className="gsm-panel space-y-3 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900 dark:text-text-primary">
            {t('访问 Token', 'Access Token')}
          </h4>
          <button
            type="button"
            onClick={() => void handleResetToken()}
            disabled={saving || !mcpConfig.enabled}
            title={
              !mcpConfig.enabled
                ? t('请先开启 MCP 服务', 'Enable MCP first')
                : undefined
            }
            className="text-sm px-3 py-1.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/10 text-gray-700 dark:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('重置 Token', 'Reset Token')}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-text-tertiary">
          {t(
            'Token 会在重启后保持不变。点击“重置 Token”后才会更换，旧配置会失效。不要泄露 Token。',
            'The token stays the same across restarts. It changes only after you reset it, which invalidates old agent configs. Do not share it.'
          )}
        </p>
        <div className="flex items-center gap-2">
          <input
            type={showToken ? 'text' : 'password'}
            readOnly
            value={mcpConfig.token || ''}
            placeholder={t('开启服务后自动生成', 'Generated when enabled')}
            className="flex-1 px-3 py-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-light-surface dark:bg-white/[0.04] text-gray-900 dark:text-text-primary text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
            aria-label={showToken ? t('隐藏', 'Hide') : t('显示', 'Show')}
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => void copyText('token', mcpConfig.token)}
            disabled={!mcpConfig.token}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-40"
            aria-label={t('复制 Token', 'Copy token')}
          >
            {copiedKey === 'token' ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* URLs + copy config */}
      <div className="gsm-panel space-y-4 p-5 sm:p-6">
        <h4 className="font-medium text-gray-900 dark:text-text-primary">
          {t('连接信息', 'Connection')}
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-text-tertiary w-36 flex-shrink-0">
              Streamable HTTP
            </span>
            <code className="flex-1 truncate text-xs font-mono text-gray-800 dark:text-text-primary">
              {mcpHttpUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyText('http', mcpHttpUrl)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              aria-label={t('复制 Streamable HTTP 地址', 'Copy Streamable HTTP URL')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700 dark:text-text-secondary">
              {t('复制 Agent 配置（JSON）', 'Copy agent config (JSON)')}
            </span>
            <button
              type="button"
              onClick={() => void copyText('json', agentConfigJson)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedKey === 'json' ? t('已复制', 'Copied') : t('复制 JSON', 'Copy JSON')}
            </button>
          </div>
          <pre className="text-xs font-mono p-3 rounded-lg bg-light-bg dark:bg-black/30 overflow-x-auto text-gray-800 dark:text-text-secondary border border-black/[0.04] dark:border-white/[0.04]">
            {agentConfigJson}
          </pre>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.04] bg-light-bg/50 dark:bg-white/[0.02] text-xs text-gray-600 dark:text-text-tertiary space-y-1">
        <p>
          {t(
            '只读工具：gsm_status / gsm_search_repos / gsm_get_repo / gsm_list_categories / gsm_list_repos_by_category / gsm_stats',
            'Read-only tools: gsm_status / gsm_search_repos / gsm_get_repo / gsm_list_categories / gsm_list_repos_by_category / gsm_stats'
          )}
        </p>
        <p>
          {t(
            '可选：gsm_vector_search（需已配置向量搜索）',
            'Optional: gsm_vector_search (when vector search is configured)'
          )}
        </p>
      </div>
    </div>
  );
};
