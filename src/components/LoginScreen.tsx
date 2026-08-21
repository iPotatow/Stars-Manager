import Vue, { useState } from "../vue-runtime.ts";
import { AlertCircle, ArrowRight, Key, UserRound } from '@lucide/vue';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
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
    <main className="min-h-screen bg-[#f5f5f7] px-[clamp(18px,5vw,80px)] pb-[42px] text-[#1d1d1f] max-[760px]:px-4 max-[760px]:pb-7">
      <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between border-b border-black/[0.12] bg-white/[0.68] backdrop-blur-xl backdrop-saturate-150 max-[760px]:min-h-16">
        <div className="flex items-center gap-2.5"><span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#1d1d1f] text-base font-bold tracking-[-0.04em] text-white" aria-hidden="true">S</span><strong className="text-xs font-bold leading-[1.2] tracking-[0.08em] text-[#1d1d1f]">STARS MANAGER</strong></div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73] max-[760px]:hidden"><i className="h-[7px] w-[7px] rounded-full bg-[#34c759] shadow-[0_0_0_3px_rgba(52,199,89,.13)]" /> {t('Cloudflare', 'CLOUDFLARE')}</span>
          <div className="flex rounded-[9px] bg-black/[0.055] p-0.5" aria-label={t('语言', 'Language')}>
            {(['zh', 'en'] as const).map((locale) => (
              <Button key={locale} type="button" variant={language === locale ? 'secondary' : 'ghost'} size="sm" onClick={() => setLanguage(locale)} class="min-w-[35px] rounded-[7px] px-2 py-1.5 text-xs font-medium">
                {locale === 'zh' ? '中文' : 'EN'}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-114px)] max-w-[1160px] grid-cols-[minmax(0,1fr)_minmax(320px,470px)] items-center gap-[clamp(50px,9vw,150px)] max-[760px]:flex max-[760px]:min-h-0 max-[760px]:flex-col max-[760px]:justify-center max-[760px]:gap-[38px] max-[760px]:pb-6 max-[760px]:pt-[54px]">
        <section className="max-w-[600px]">
          <div className="hidden" aria-hidden="true"><span /><span /><span /></div>
          <h1 className="mb-6 text-[clamp(44px,5.5vw,72px)] font-bold leading-[1.02] tracking-[-0.055em] text-[#1d1d1f] max-[760px]:text-[clamp(42px,12vw,60px)] max-[760px]:break-words">{language === 'zh' ? <>管理你的 GitHub<br />收藏。</> : <>Manage your GitHub<br />stars.</>}</h1>
        </section>

        <Card class="animate-material-in w-full rounded-[18px] border-black/[0.16] bg-white/[0.78] py-0 shadow-[0_18px_48px_rgba(0,0,0,.08),0_2px_8px_rgba(0,0,0,.04)] backdrop-blur-2xl backdrop-saturate-150 max-[760px]:rounded-2xl">
          <CardHeader class="px-[clamp(24px,3vw,34px)] pb-0 pt-7 max-[760px]:px-5 max-[760px]:pt-6">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#86868b]"><Badge variant="secondary" class="rounded-md bg-[#0071e3]/10 px-[7px] py-1 text-[#0071e3] hover:bg-[#0071e3]/10">{step === 'credentials' ? '01' : '02'}</Badge><span>{step === 'credentials' ? t('验证工作区', 'VERIFY WORKSPACE') : t('连接资料源', 'CONNECT SOURCE')}</span></div>
            <CardTitle class="mt-[18px] text-[30px] font-semibold leading-[1.12] tracking-[-0.035em] text-[#1d1d1f]">{step === 'credentials' ? t('登录 Stars Manager', 'Sign in to Stars Manager') : t('连接 GitHub', 'Connect GitHub')}</CardTitle>
            <CardDescription class="text-sm leading-[1.55] text-[#6e6e73] max-[760px]:break-words">
            {step === 'credentials'
              ? t('输入工作区账号。', 'Enter your workspace credentials.')
              : t('输入 GitHub token。', 'Enter your GitHub token.')}
            </CardDescription>
          </CardHeader>

          <CardContent class="px-[clamp(24px,3vw,34px)] pb-[30px] pt-6 max-[760px]:px-5 max-[760px]:pb-[26px]">

          {repositories.length > 0 && lastSync ? (
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border-l-[3px] border-[#34c759] bg-[#34c759]/[0.08] px-3 py-[11px] text-sm text-[#1d1d1f]" role="status">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#34c759] shadow-[0_0_0_3px_rgba(52,199,89,.14)]" />
              <span>{t(`已缓存 ${repositories.length} 个仓库`, `${repositories.length} repositories cached`)}</span>
              <small className="basis-full pl-[14px] text-xs text-[#6e6e73]">{t('上次同步', 'Last sync')}: {new Date(lastSync).toLocaleString()}</small>
            </div>
          ) : null}

          {step === 'credentials' ? (
            <>
              <Label htmlFor="workspace-username" class="mb-[7px] text-xs text-[#6e6e73]">Workspace username</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#86868b]" aria-hidden="true" />
                <Input
                  id="workspace-username"
                  type="text"
                  placeholder="ADMIN_USER"
                  modelValue={username}
                  onUpdate:modelValue={(value: string | number) => { setUsername(String(value)); setError(''); }}
                  onKeyDown={(event: Vue.KeyboardEvent<HTMLInputElement>) => void handleKeyPress(event, 'login')}
                  disabled={isLoading}
                  autoComplete="username"
                  autoFocus
                  class="h-12 pl-10 font-mono text-[13px] text-[#1d1d1f] placeholder:text-[#86868b]"
                />
              </div>

              <Label htmlFor="workspace-password" class="mb-[7px] mt-4 text-xs text-[#6e6e73]">Workspace password</Label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#86868b]" aria-hidden="true" />
                <Input
                  id="workspace-password"
                  type="password"
                  placeholder="ADMIN_PASSWORD"
                  modelValue={password}
                  onUpdate:modelValue={(value: string | number) => { setPassword(String(value)); setError(''); }}
                  onKeyDown={(event: Vue.KeyboardEvent<HTMLInputElement>) => void handleKeyPress(event, 'login')}
                  disabled={isLoading}
                  autoComplete="current-password"
                  class="h-12 pl-10 font-mono text-[13px] text-[#1d1d1f] placeholder:text-[#86868b]"
                />
              </div>

              {error ? <Alert variant="destructive" class="mt-3 border-[#ff3b30]/20 bg-[#ff3b30]/[0.09] px-3 py-2.5 text-[#c9342b]"><AlertCircle class="mt-px h-[15px] w-[15px]" aria-hidden="true" /><AlertDescription class="text-[#c9342b]">{error}</AlertDescription></Alert> : null}

              <Button type="button" onClick={() => void handleLogin()} disabled={isLoading || !username.trim() || !password} class="mt-3.5 min-h-12 w-full rounded-[10px] bg-[#0071e3] text-sm font-semibold text-white shadow-[0_2px_5px_rgba(0,113,227,.24)] hover:bg-[#0077ed] hover:shadow-[0_4px_10px_rgba(0,113,227,.27)] disabled:border-[#d1d1d6] disabled:bg-[#e5e5ea] disabled:text-[#636366] disabled:shadow-none">
                {isLoading ? <><Spinner class="size-4 text-white" />{t('验证中…', 'Verifying…')}</> : <>{t('登录工作区', 'Sign in')}<ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
              </Button>
            </>
          ) : (
            <>
              {hasStoredToken ? (
                <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border-l-[3px] border-[#34c759] bg-[#34c759]/[0.08] px-3 py-[11px] text-sm text-[#1d1d1f]" role="status">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#34c759] shadow-[0_0_0_3px_rgba(52,199,89,.14)]" />
                  <span>{t('D1 中已有 GitHub token，可输入新 token 替换。', 'A GitHub token is already stored in D1; enter a new one to replace it.')}</span>
                </div>
              ) : null}

              <Label htmlFor="github-token" class="mb-[7px] text-xs text-[#6e6e73]">GitHub Personal Access Token</Label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#86868b]" aria-hidden="true" />
                <Input
                  id="github-token"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  modelValue={token}
                  onUpdate:modelValue={(value: string | number) => { setToken(String(value)); setError(''); }}
                  onKeyDown={(event: Vue.KeyboardEvent<HTMLInputElement>) => void handleKeyPress(event, 'github')}
                  disabled={isLoading}
                  autoComplete="off"
                  autoFocus
                  class="h-12 pl-10 font-mono text-[13px] text-[#1d1d1f] placeholder:text-[#86868b]"
                />
              </div>

              {error ? <Alert variant="destructive" class="mt-3 border-[#ff3b30]/20 bg-[#ff3b30]/[0.09] px-3 py-2.5 text-[#c9342b]"><AlertCircle class="mt-px h-[15px] w-[15px]" aria-hidden="true" /><AlertDescription class="text-[#c9342b]">{error}</AlertDescription></Alert> : null}

              <Button type="button" onClick={() => void handleConnectGitHub()} disabled={isLoading || !token.trim()} class="mt-3.5 min-h-12 w-full rounded-[10px] bg-[#0071e3] text-sm font-semibold text-white shadow-[0_2px_5px_rgba(0,113,227,.24)] hover:bg-[#0077ed] hover:shadow-[0_4px_10px_rgba(0,113,227,.27)] disabled:border-[#d1d1d6] disabled:bg-[#e5e5ea] disabled:text-[#636366] disabled:shadow-none">
                {isLoading ? <><Spinner class="size-4 text-white" />{t('连接中…', 'Connecting…')}</> : <>{t('连接到 GitHub', 'Connect to GitHub')}<ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
              </Button>

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
          </CardContent>
        </Card>
      </div>
    </main>
  );
};
