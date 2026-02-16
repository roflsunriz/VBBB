import { useState, useCallback, useEffect, useRef } from 'react';
import {
  mdiBulletinBoard,
  mdiStar,
  mdiMagnify,
  mdiRefresh,
  mdiAccountKey,
  mdiShieldLock,
  mdiSync,
  mdiLoading,
  mdiInformation,
  mdiClose,
  mdiCookie,
  mdiConsoleLine,
} from '@mdi/js';
import { useBBSStore } from './stores/bbs-store';
import { BoardTree } from './components/board-tree/BoardTree';
import { FavoriteTree } from './components/favorite-tree/FavoriteTree';
import { SearchPanel } from './components/search/SearchPanel';
import { ThreadList } from './components/thread-list/ThreadList';
import { ThreadView } from './components/thread-view/ThreadView';
import { AuthPanel } from './components/auth/AuthPanel';
import { ProxySettings } from './components/settings/ProxySettings';
import { RoundPanel } from './components/round/RoundPanel';
import { NgEditor } from './components/ng-editor/NgEditor';
import { CookieManager } from './components/settings/CookieManager';
import { ConsoleModal } from './components/console/ConsoleModal';
import { MdiIcon } from './components/common/MdiIcon';
import { Modal } from './components/common/Modal';
import { ResizeHandle } from './components/common/ResizeHandle';
import { type ThemeName, ThemeSelector, getStoredTheme, applyTheme } from './components/settings/ThemeSelector';

type LeftPaneTab = 'boards' | 'favorites' | 'search';
type ModalType = 'auth' | 'proxy' | 'round' | 'ng' | 'about' | 'cookie-manager' | 'console' | null;

const LEFT_PANE_MIN = 160;
const LEFT_PANE_MAX = 500;
const LEFT_PANE_DEFAULT = 256;
const CENTER_PANE_MIN = 200;
const CENTER_PANE_DEFAULT = 400;
const STORAGE_KEY_LEFT = 'vbbb-left-pane-width';
const STORAGE_KEY_CENTER = 'vbbb-center-pane-width';

function loadPaneWidth(key: string, defaultVal: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // Ignore storage errors
  }
  return defaultVal;
}

export function App(): React.JSX.Element {
  const statusMessage = useBBSStore((s) => s.statusMessage);
  const menuLoading = useBBSStore((s) => s.menuLoading);
  const fetchMenu = useBBSStore((s) => s.fetchMenu);
  const fetchFavorites = useBBSStore((s) => s.fetchFavorites);
  const fetchNgRules = useBBSStore((s) => s.fetchNgRules);
  const restoreTabs = useBBSStore((s) => s.restoreTabs);
  const restoreSession = useBBSStore((s) => s.restoreSession);

  const [leftTab, setLeftTab] = useState<LeftPaneTab>('boards');
  const [theme, setTheme] = useState<ThemeName>(getStoredTheme);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Resizable pane widths
  const [leftWidth, setLeftWidth] = useState(() => loadPaneWidth(STORAGE_KEY_LEFT, LEFT_PANE_DEFAULT));
  const [centerWidth, setCenterWidth] = useState(() => loadPaneWidth(STORAGE_KEY_CENTER, CENTER_PANE_DEFAULT));

  // Refs to avoid stale closures in IPC listeners
  const setLeftTabRef = useRef(setLeftTab);
  const setActiveModalRef = useRef(setActiveModal);
  useEffect(() => { setLeftTabRef.current = setLeftTab; }, [setLeftTab]);
  useEffect(() => { setActiveModalRef.current = setActiveModal; }, [setActiveModal]);

  // Apply theme on mount and change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Auto-initialize on first mount (runs once via ref guard)
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async (): Promise<void> => {
      await Promise.all([
        fetchMenu(),
        fetchFavorites(),
        fetchNgRules(),
      ]);
      await restoreSession();
      await restoreTabs();
    };
    void init();
  }, [fetchMenu, fetchFavorites, fetchNgRules, restoreSession, restoreTabs]);

  // Subscribe to menu actions from main process via invoke-based long-poll.
  // No ref guard: each mount starts its own poll, cleanup cancels it.
  // This is safe with React Strict Mode's double-invoke.
  useEffect(() => {
    if (typeof window.electronApi === 'undefined') return;

    const api = window.electronApi;
    let cancelled = false;

    const pollMenuAction = async (): Promise<void> => {
      while (!cancelled) {
        try {
          const action = await api.invoke('menu:wait-action');
          if (cancelled) break;

          switch (action.type) {
            case 'refresh-boards':
              void useBBSStore.getState().fetchMenu();
              break;
            case 'switch-tab':
              if (action.tab === 'boards' || action.tab === 'favorites' || action.tab === 'search') {
                setLeftTabRef.current(action.tab);
              }
              break;
            case 'open-modal':
              if (action.modal === 'auth' || action.modal === 'proxy' || action.modal === 'round' || action.modal === 'ng' || action.modal === 'about' || action.modal === 'cookie-manager' || action.modal === 'console') {
                setActiveModalRef.current(action.modal);
              }
              break;
            case 'toggle-ng':
              setActiveModalRef.current((prev) => prev === 'ng' ? null : 'ng');
              break;
          }
        } catch {
          if (!cancelled) {
            await new Promise<void>((r) => { setTimeout(r, 1000); });
          }
        }
      }
    };

    void pollMenuAction();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = useCallback((newTheme: ThemeName) => {
    setTheme(newTheme);
  }, []);

  const switchToBoards = useCallback(() => { setLeftTab('boards'); }, []);
  const switchToFavorites = useCallback(() => { setLeftTab('favorites'); }, []);
  const switchToSearch = useCallback(() => { setLeftTab('search'); }, []);
  const closeSearch = useCallback(() => { setLeftTab('boards'); }, []);
  const closeModal = useCallback(() => { setActiveModal(null); }, []);

  const handleRefreshBoards = useCallback(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const openAuth = useCallback(() => { setActiveModal('auth'); }, []);
  const openProxy = useCallback(() => { setActiveModal('proxy'); }, []);
  const openRound = useCallback(() => { setActiveModal('round'); }, []);
  const openCookieManager = useCallback(() => { setActiveModal('cookie-manager'); }, []);
  const openConsole = useCallback(() => { setActiveModal('console'); }, []);
  const openAbout = useCallback(() => { setActiveModal('about'); }, []);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.max(LEFT_PANE_MIN, Math.min(LEFT_PANE_MAX, w + delta)));
  }, []);

  const handleLeftResizeEnd = useCallback(() => {
    setLeftWidth((w) => { localStorage.setItem(STORAGE_KEY_LEFT, String(w)); return w; });
  }, []);

  const handleCenterResize = useCallback((delta: number) => {
    setCenterWidth((w) => Math.max(CENTER_PANE_MIN, w + delta));
  }, []);

  const handleCenterResizeEnd = useCallback(() => {
    setCenterWidth((w) => { localStorage.setItem(STORAGE_KEY_CENTER, String(w)); return w; });
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2">
        {/* Refresh boards */}
        <button
          type="button"
          onClick={handleRefreshBoards}
          disabled={menuLoading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          title="板一覧を更新 (Ctrl+R)"
        >
          <MdiIcon
            path={menuLoading ? mdiLoading : mdiRefresh}
            size={14}
            className={menuLoading ? 'animate-spin' : ''}
          />
          板一覧更新
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        {/* Auth */}
        <button
          type="button"
          onClick={openAuth}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="認証設定 (Ctrl+Shift+A)"
        >
          <MdiIcon path={mdiAccountKey} size={14} />
          認証
        </button>

        {/* Proxy */}
        <button
          type="button"
          onClick={openProxy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="プロキシ設定 (Ctrl+Shift+P)"
        >
          <MdiIcon path={mdiShieldLock} size={14} />
          プロキシ
        </button>

        {/* Round */}
        <button
          type="button"
          onClick={openRound}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="巡回リスト (Ctrl+Shift+R)"
        >
          <MdiIcon path={mdiSync} size={14} />
          巡回
        </button>

        {/* Cookie/UA Manager */}
        <button
          type="button"
          onClick={openCookieManager}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="Cookie/UA管理"
        >
          <MdiIcon path={mdiCookie} size={14} />
          Cookie/UA
        </button>

        {/* Console */}
        <button
          type="button"
          onClick={openConsole}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="診断コンソール (Ctrl+Shift+L)"
        >
          <MdiIcon path={mdiConsoleLine} size={14} />
          コンソール
        </button>

        <div className="flex-1" />

        {/* About */}
        <button
          type="button"
          onClick={openAbout}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="VBBBについて"
        >
          <MdiIcon path={mdiInformation} size={14} />
        </button>
      </header>

      {/* Main 3-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left pane: Board Tree / Favorites / Search */}
        <aside className="flex h-full shrink-0 flex-col" style={{ width: leftWidth }}>
          {/* Left pane tabs */}
          <div className="flex h-8 shrink-0 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <button
              type="button"
              onClick={switchToBoards}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'boards'
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiBulletinBoard} size={12} />
              板一覧
            </button>
            <button
              type="button"
              onClick={switchToFavorites}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'favorites'
                  ? 'border-b-2 border-[var(--color-warning)] text-[var(--color-warning)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiStar} size={12} />
              お気に入り
            </button>
            <button
              type="button"
              onClick={switchToSearch}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'search'
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiMagnify} size={12} />
              検索
            </button>
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === 'boards' && <BoardTree />}
            {leftTab === 'favorites' && <FavoriteTree />}
            {leftTab === 'search' && <SearchPanel onClose={closeSearch} />}
          </div>
        </aside>

        <ResizeHandle onResize={handleLeftResize} onResizeEnd={handleLeftResizeEnd} />

        {/* Center: Thread List */}
        <div className="shrink-0" style={{ width: centerWidth }}>
          <ThreadList />
        </div>

        <ResizeHandle onResize={handleCenterResize} onResizeEnd={handleCenterResizeEnd} />

        {/* Right: Thread View */}
        <ThreadView />
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4">
        <span className="text-xs text-[var(--color-text-muted)]">{statusMessage}</span>
        <ThemeSelector currentTheme={theme} onThemeChange={handleThemeChange} />
      </footer>

      {/* Modal: Auth */}
      <Modal open={activeModal === 'auth'} onClose={closeModal}>
        <AuthPanel onClose={closeModal} />
      </Modal>

      {/* Modal: Proxy */}
      <Modal open={activeModal === 'proxy'} onClose={closeModal}>
        <ProxySettings onClose={closeModal} />
      </Modal>

      {/* Modal: NG Editor */}
      <Modal open={activeModal === 'ng'} onClose={closeModal} width="max-w-2xl">
        <div className="max-h-[70vh] overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <NgEditor onClose={closeModal} />
        </div>
      </Modal>

      {/* Modal: Round */}
      <Modal open={activeModal === 'round'} onClose={closeModal} width="max-w-md">
        <div className="max-h-[70vh] overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <RoundPanel onClose={closeModal} />
        </div>
      </Modal>

      {/* Modal: Cookie/UA Manager */}
      <Modal open={activeModal === 'cookie-manager'} onClose={closeModal} width="max-w-xl">
        <CookieManager onClose={closeModal} />
      </Modal>

      {/* Modal: Console */}
      <Modal open={activeModal === 'console'} onClose={closeModal} width="max-w-4xl">
        <ConsoleModal onClose={closeModal} />
      </Modal>

      {/* Modal: About */}
      <Modal open={activeModal === 'about'} onClose={closeModal} width="max-w-sm">
        <div className="flex flex-col items-center gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6">
          <MdiIcon path={mdiBulletinBoard} size={48} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">VBBB</h2>
          <p className="text-center text-sm font-medium text-[var(--color-text-secondary)]">
            Versatile BBS Browser
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            v{__APP_VERSION__}
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            2ch/5ch互換BBSブラウザ
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            Electron + React + TypeScript
          </p>
          <button
            type="button"
            onClick={closeModal}
            className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
          >
            <MdiIcon path={mdiClose} size={12} />
            閉じる
          </button>
        </div>
      </Modal>
    </div>
  );
}
