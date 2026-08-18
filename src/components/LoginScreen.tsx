import Vue, { useState } from "../vue-runtime.ts";
import { AlertCircle, ArrowRight, Key, UserRound } from '@lucide/vue';
import { useAppStore } from '../store/useAppStore';
import { createGitHubApiService } from '../services/githubApiFactory';
import { backend } from '../services/backendAdapter';
import { safeReadText } from '../utils/clipboardUtils';

type LoginStep = 'credentials' | 'github';

export const LoginScreen: Vue.FC = () => {
  const [step, setStep] = useState<LoginStep>(() => (
    backend.isSessionAuthenticated ? 'github' : 'credentials'
  ));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [hasStoredToken, setHasStoredToken] = useState(() => backend.hasGitHubToken);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { setUser, setGitHubToken, repositories, lastSync, language, setLanguage } = useAppStore();
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const completeGitHubConnection = async () => {
    const githubApi = createGitHubApiService();
    const user = await githubApi.getCurrentUser();
    setGitHubToken('worker-managed');
    setUser(user);
  };

  const handleLogin = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError(t('请输入用户名和密码', 'Enter your username and password'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const result = await backend.login(trimmedUsername, password);
      setHasStoredToken(result.githubConfigured);
      if (result.githubConfigured) {
        try {
          await completeGitHubConnection();
          return;
        } catch (storedTokenError) {
          console.warn('Stored GitHub token could not be used:', storedTokenError);
          setError(t('D1 中已保存的 GitHub token 当前不可用，请重新设置。', 'The GitHub token stored in D1 is unavailable; enter a new token.'));
        }
      }
      setStep('github');
    } catch (loginError) {
      console.error('Login failed:', loginError);
      setError(loginError instanceof Error ? loginError.message : t('登录失败，请检查用户名和密码。', 'Login failed. Check your username and password.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectGitHub = async () => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError(t('请输入 GitHub token', 'Enter your GitHub token'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      // The Worker validates the token first, then encrypts it into D1. The
      // browser never stores the GitHub credential.
      await backend.configureGitHubToken(trimmedToken);
      await completeGitHubConnection();
    } catch (connectError) {
      console.error('GitHub connection failed:', connectError);
      setError(connectError instanceof Error ? connectError.message : t('连接失败，请检查您的 token。', 'Connection failed. Check your token.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = async (event: Vue.KeyboardEvent<HTMLInputElement>, action: 'login' | 'github') => {
    if (event.key === 'Enter' && !isLoading) {
      if (action === 'login') {
        void handleLogin();
      } else {
        void handleConnectGitHub();
      }
      return;
    }
    if (action === 'github' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && !isLoading) {
      const result = await safeReadText();
      if (result.success && result.text) {
        setToken(result.text.trim());
        setError('');
      }
    }
  };

  return (
    <main className="signal-login">
      <header className="signal-login-header">
        <div className="signal-login-wordmark"><span aria-hidden="true">S</span><strong>STARS MANAGER</strong></div>
        <div className="signal-login-tools">
          <span className="signal-live-mark"><i /> {t('Cloudflare', 'CLOUDFLARE')}</span>
          <div className="signal-language-toggle" aria-label={t('语言', 'Language')}>
            {(['zh', 'en'] as const).map((locale) => (
              <button key={locale} type="button" onClick={() => setLanguage(locale)} className={language === locale ? 'is-active' : ''}>
                {locale === 'zh' ? '中文' : 'EN'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="signal-login-grid">
        <section className="signal-login-intro">
          <div className="signal-intro-blocks" aria-hidden="true"><span /><span /><span /></div>
          <h1>{language === 'zh' ? <>管理你的 GitHub<br />收藏。</> : <>Manage your GitHub<br />stars.</>}</h1>
        </section>

        <section className="signal-login-panel">
          <div className="signal-panel-bar"><span>{step === 'credentials' ? '01' : '02'}</span><span>{step === 'credentials' ? t('验证工作区', 'VERIFY WORKSPACE') : t('连接资料源', 'CONNECT SOURCE')}</span></div>
          <h2>{step === 'credentials' ? t('登录 Stars Manager', 'Sign in to Stars Manager') : t('连接 GitHub', 'Connect GitHub')}</h2>
          <p className="signal-panel-description">
            {step === 'credentials'
              ? t('输入工作区账号。', 'Enter your workspace credentials.')
              : t('输入 GitHub token。', 'Enter your GitHub token.')}
          </p>

          {repositories.length > 0 && lastSync ? (
            <div className="signal-cached-note" role="status">
              <span className="signal-status-dot" />
              <span>{t(`已缓存 ${repositories.length} 个仓库`, `${repositories.length} repositories cached`)}</span>
              <small>{t('上次同步', 'Last sync')}: {new Date(lastSync).toLocaleString()}</small>
            </div>
          ) : null}

          {step === 'credentials' ? (
            <>
              <label htmlFor="workspace-username" className="signal-field-label">Workspace username</label>
              <div className="signal-token-field">
                <UserRound aria-hidden="true" />
                <input
                  id="workspace-username"
                  type="text"
                  placeholder="ADMIN_USER"
                  value={username}
                  onInput={(event) => { setUsername(event.target.value); setError(''); }}
                  onKeyDown={(event) => void handleKeyPress(event, 'login')}
                  disabled={isLoading}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <label htmlFor="workspace-password" className="signal-field-label">Workspace password</label>
              <div className="signal-token-field">
                <Key aria-hidden="true" />
                <input
                  id="workspace-password"
                  type="password"
                  placeholder="ADMIN_PASSWORD"
                  value={password}
                  onInput={(event) => { setPassword(event.target.value); setError(''); }}
                  onKeyDown={(event) => void handleKeyPress(event, 'login')}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>

              {error ? <div role="alert" className="signal-error"><AlertCircle aria-hidden="true" /><p>{error}</p></div> : null}

              <button type="button" onClick={() => void handleLogin()} disabled={isLoading || !username.trim() || !password} className="signal-connect-button">
                {isLoading ? <><span className="signal-spinner" />{t('验证中…', 'Verifying…')}</> : <>{t('登录工作区', 'Sign in')}<ArrowRight aria-hidden="true" /></>}
              </button>
            </>
          ) : (
            <>
              {hasStoredToken ? (
                <div className="signal-cached-note" role="status">
                  <span className="signal-status-dot" />
                  <span>{t('D1 中已有 GitHub token，可输入新 token 替换。', 'A GitHub token is already stored in D1; enter a new one to replace it.')}</span>
                </div>
              ) : null}

              <label htmlFor="github-token" className="signal-field-label">GitHub Personal Access Token</label>
              <div className="signal-token-field">
                <Key aria-hidden="true" />
                <input
                  id="github-token"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onInput={(event) => { setToken(event.target.value); setError(''); }}
                  onKeyDown={(event) => void handleKeyPress(event, 'github')}
                  disabled={isLoading}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {error ? <div role="alert" className="signal-error"><AlertCircle aria-hidden="true" /><p>{error}</p></div> : null}

              <button type="button" onClick={() => void handleConnectGitHub()} disabled={isLoading || !token.trim()} className="signal-connect-button">
                {isLoading ? <><span className="signal-spinner" />{t('连接中…', 'Connecting…')}</> : <>{t('连接到 GitHub', 'Connect to GitHub')}<ArrowRight aria-hidden="true" /></>}
              </button>

              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {t('没有 token？去 GitHub 创建', 'Need a token? Create one on GitHub')} <ArrowRight aria-hidden="true" />
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
};
