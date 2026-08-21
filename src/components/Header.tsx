import Vue, { useMemo, useState } from "../vue-runtime.ts";
import { BookOpen, FileText, GitFork, LayoutGrid, LogOut, Menu, Settings2, Sparkles, X } from '@lucide/vue';
import { useAppStore } from '../store/useAppStore';
import { useDialog } from '../hooks/useDialog';
import { backend } from '../services/backendAdapter';
import { HeaderMenuId, AppState } from '../types';

const MENU_META: Record<HeaderMenuId, { labelZh: string; labelEn: string; icon: Vue.ComponentType<{ className?: string }> }> = {
  repositories: { labelZh: '仓库', labelEn: 'Repositories', icon: LayoutGrid },
  gists: { labelZh: 'Gist', labelEn: 'Gist', icon: FileText },
  releases: { labelZh: '发布', labelEn: 'Releases', icon: BookOpen },
  forks: { labelZh: '复刻', labelEn: 'Forks', icon: GitFork },
  subscription: { labelZh: '趋势', labelEn: 'Trending', icon: Sparkles },
  settings: { labelZh: '设置', labelEn: 'Settings', icon: Settings2 },
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
    <nav className="flex flex-col gap-1" aria-label={t('主导航', 'Main navigation')}>
      <div className="mx-2.5 mb-2.5 text-[11px] font-semibold text-[#86868b]">{t('工作区', 'Workspace')}</div>
      {visibleMenus.map((item) => {
        const meta = MENU_META[item.id];
        const active = currentView === item.id;
        const Icon = meta.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => changeView(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[42px] w-full items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-[11px] text-left text-sm font-medium text-[#6e6e73] transition-[background-color,color,transform] duration-200 hover:bg-black/[0.045] hover:text-[#1d1d1f] active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30 ${active ? 'bg-[#0071e3]/10 font-semibold text-[#0071e3]' : ''}`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0 stroke-2" aria-hidden="true" />
            <span>{t(meta.labelZh, meta.labelEn)}</span>
            {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#0071e3]" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hd-drag fixed inset-y-0 left-0 z-50 hidden w-[248px] flex-col border-r border-black/[0.12] bg-white/[0.72] p-[22px_14px_18px] text-[#1d1d1f] shadow-[1px_0_0_rgba(255,255,255,.55),12px_0_32px_rgba(0,0,0,.025)] backdrop-blur-xl backdrop-saturate-150 lg:flex" aria-label={t('侧边导航', 'Sidebar navigation')}>
        <div className="flex items-center gap-2.5 px-2 pb-[34px]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#1d1d1f] text-base font-bold tracking-[-0.04em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]" aria-hidden="true">S</span>
          <strong className="text-xs font-bold leading-[1.2] tracking-[0.08em] text-[#1d1d1f]">STARS<br />MANAGER</strong>
        </div>
        <div className="hd-btns min-h-0 flex-1 overflow-y-auto">{navigation}</div>
        <div className="hd-btns mt-[18px] border-t border-black/[0.12] pt-3.5">
          {user ? (
            <div className="flex items-center gap-2 rounded-[10px] px-[7px] py-1.5">
              <img className="h-[30px] w-[30px] rounded-full border-2 border-white object-cover shadow-[0_0_0_1px_rgba(60,60,67,.18)]" src={user.avatar_url} alt={user.name || user.login} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#6e6e73]">{(user.name || user.login).slice(0, 1).toUpperCase()}</span>
              <button type="button" onClick={() => void handleLogout()} aria-label={t('退出登录', 'Log out')} className="rounded-[7px] p-[5px] text-[#86868b] transition-[background-color,color,transform] duration-200 hover:bg-black/[0.05] hover:text-[#ff3b30] active:scale-[.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <header className="hd-drag sticky top-0 z-50 flex h-[60px] items-center justify-between border-b border-black/[0.12] bg-white/[0.76] px-[18px] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#1d1d1f] text-sm font-bold tracking-[-0.04em] text-white" aria-hidden="true">S</span>
          <strong className="text-[11px] font-bold leading-[1.2] tracking-[0.08em] text-[#1d1d1f]">STARS MANAGER</strong>
        </div>
        <div className="hd-btns flex">
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-label={t('打开导航', 'Open navigation')} className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-black/[0.04] text-[#1d1d1f] transition-[background-color,transform] duration-200 hover:bg-black/[0.08] active:scale-[.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30">
            {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed left-3 right-3 top-[70px] z-[49] rounded-[14px] border border-black/[0.12] bg-white/[0.84] p-2.5 shadow-[0_18px_48px_rgba(0,0,0,.08),0_2px_8px_rgba(0,0,0,.04)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
          {navigation}
          {user ? (
            <button type="button" onClick={() => void handleLogout()} className="mt-2 flex w-full items-center gap-2 border-0 border-t border-black/[0.12] bg-transparent px-2.5 pb-1.5 pt-3.5 text-left text-xs text-[#6e6e73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30">
              <LogOut className="h-[15px] w-[15px]" aria-hidden="true" /> {t('退出登录', 'Log out')}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
