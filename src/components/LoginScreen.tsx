import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Key, UserRound } from '@lucide/vue';
import { useAppStore } from '../store/useAppStore';
import { createGitHubApiService } from '../services/githubApiFactory';
import { backend } from '../services/backendAdapter';
import { safeReadText } from '../utils/clipboardUtils';

type LoginStep = 'credentials' | 'github';

export const LoginScreen: React.FC = () => {
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

  const handleKeyPress = async (event: React.KeyboardEvent<HTMLInputElement>, action: 'login' | 'github') => {
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
          <p>{t('搜索、整理并继续查看你的 GitHub 收藏。', 'Search, organize, and return to your GitHub stars.')}</p>
          <div className="signal-login-index"><span>01 / SIGN IN</span><span>02 / CONNECT</span><span>03 / ORGANIZE</span></div>
        </section>

        <section className="signal-login-panel">
          <div className="signal-panel-bar"><span>{step === 'credentials' ? '01' : '02'}</span><span>{step === 'credentials' ? t('验证工作区', 'VERIFY WORKSPACE') : t('连接资料源', 'CONNECT SOURCE')}</span></div>
          <h2>{step === 'credentials' ? t('登录 Stars Manager', 'Sign in to Stars Manager') : t('连接 GitHub', 'Connect GitHub')}</h2>
          <p className="signal-panel-description">
            {step === 'credentials'
              ? t('使用部署者在 Cloudflare Variables & Secrets 中配置的账号登录。', 'Sign in with the credentials configured by the deployer in Cloudflare Variables & Secrets.')
              : t('登录成功。GitHub token 会先验证，再加密保存到 D1。', 'Signed in. The GitHub token will be validated and encrypted into D1.')}
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

              <div className="signal-token-help">
                <div className="signal-help-title"><span>03</span><h3>{t('准备访问令牌', 'Prepare your access token')}</h3></div>
                <ol>
                  <li>{t('打开 GitHub Settings → Developer settings', 'Open GitHub Settings → Developer settings')}</li>
                  <li>{t('创建 classic token', 'Create a classic token')}</li>
                  <li>{t('启用 repo、user 和 gist 权限', 'Enable repo, user, and gist scopes')}</li>
                </ol>
                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
                  {t('前往 GitHub 创建令牌', 'Create a token on GitHub')} <ArrowRight aria-hidden="true" />
                </a>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
};
