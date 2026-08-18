import Vue, { useMemo, useState } from "../vue-runtime.ts";
import { LogOut, Menu, X } from '@lucide/vue';
import { useAppStore } from '../store/useAppStore';
import { useDialog } from '../hooks/useDialog';
import { backend } from '../services/backendAdapter';
import { HeaderMenuId, AppState } from '../types';

const MENU_META: Record<HeaderMenuId, { labelZh: string; labelEn: string; code: string }> = {
  repositories: { labelZh: '仓库', labelEn: 'Repositories', code: '01' },
  gists: { labelZh: 'Gist', labelEn: 'Gist', code: '02' },
  releases: { labelZh: '发布', labelEn: 'Releases', code: '03' },
  forks: { labelZh: '复刻', labelEn: 'Forks', code: '04' },
  subscription: { labelZh: '趋势', labelEn: 'Trending', code: '05' },
  settings: { labelZh: '设置', labelEn: 'Settings', code: '06' },
};

export const Header: Vue.FC = () => {
  const { user, currentView, headerMenuConfig, setCurrentView, logout, language } = useAppStore();
  const { confirm } = useDialog();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const visibleMenus = useMemo(
    () => [...headerMenuConfig].filter(item => item.visible).sort((a, b) => a.order - b.order),
    [headerMenuConfig],
  );

  const handleLogout = async () => {
    const confirmed = await confirm(
      t('退出登录确认', 'Logout confirmation'),
      t(
        '退出登录？',
        'Log out?',
      ),
      { type: 'warning' },
    );
    if (confirmed) {
      try {
        await backend.logout();
      } catch {
        // Clear the local session even if the Worker is temporarily unavailable.
      }
      logout();
    }
  };

  const changeView = (view: HeaderMenuId) => {
    setCurrentView(view as AppState['currentView']);
    setMobileMenuOpen(false);
  };

  const navigation = (
    <nav className="signal-nav" aria-label={t('主导航', 'Main navigation')}>
      <div className="signal-nav-label">{t('工作区', 'Workspace')}</div>
      {visibleMenus.map((item) => {
        const meta = MENU_META[item.id];
        const active = currentView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => changeView(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`signal-nav-item ${active ? 'is-active' : ''}`}
          >
            <span className="signal-nav-code">{meta.code}</span>
            <span>{t(meta.labelZh, meta.labelEn)}</span>
            {active ? <span className="signal-nav-mark" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="signal-sidebar hd-drag" aria-label={t('侧边导航', 'Sidebar navigation')}>
        <div className="signal-wordmark">
          <span className="signal-wordmark-mark" aria-hidden="true">S</span>
          <strong>STARS<br />MANAGER</strong>
        </div>
        <div className="hd-btns signal-sidebar-scroll">{navigation}</div>
        <div className="hd-btns signal-sidebar-footer">
          {user ? (
            <div className="signal-user-card">
              <img src={user.avatar_url} alt={user.name || user.login} />
              <span className="signal-user-initial">{(user.name || user.login).slice(0, 1).toUpperCase()}</span>
              <button type="button" onClick={() => void handleLogout()} aria-label={t('退出登录', 'Log out')}>
                <LogOut aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <header className="signal-mobile-header hd-drag">
        <div className="signal-mobile-wordmark">
          <span className="signal-wordmark-mark" aria-hidden="true">S</span>
          <strong>STARS MANAGER</strong>
        </div>
        <div className="hd-btns signal-mobile-actions">
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-label={t('打开导航', 'Open navigation')}>
            {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="signal-mobile-menu">
          {navigation}
          {user ? (
            <button type="button" onClick={() => void handleLogout()} className="signal-mobile-logout">
              <LogOut aria-hidden="true" /> {t('退出登录', 'Log out')}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
