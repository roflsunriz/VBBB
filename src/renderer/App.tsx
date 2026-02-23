import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
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
  mdiLinkPlus,
  mdiHistory,
  mdiGithub,
  mdiScriptText,
} from '@mdi/js';
import { useBBSStore } from './stores/bbs-store';
import { BoardTree } from './components/board-tree/BoardTree';
import { ThreadList } from './components/thread-list/ThreadList';
import { ThreadView } from './components/thread-view/ThreadView';
import { StatusConsole } from './components/status-console/StatusConsole';
import { MdiIcon } from './components/common/MdiIcon';
import { Modal } from './components/common/Modal';
import { ResizeHandle } from './components/common/ResizeHandle';
import {
  type ThemeName,
  ThemeSelector,
  getStoredTheme,
  applyTheme,
} from './components/settings/ThemeSelector';

// Left-pane tabs: loaded on first activation (not needed on startup)
const FavoriteTree = lazy(() =>
  import('./components/favorite-tree/FavoriteTree').then((m) => ({ default: m.FavoriteTree })),
);
const SearchPanel = lazy(() =>
  import('./components/search/SearchPanel').then((m) => ({ default: m.SearchPanel })),
);
const HistoryPanel = lazy(() =>
  import('./components/history/HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
);

// Modals: loaded on first open (never shown on startup)
const NgEditor = lazy(() =>
  import('./components/ng-editor/NgEditor').then((m) => ({ default: m.NgEditor })),
);
const AuthPanel = lazy(() =>
  import('./components/auth/AuthPanel').then((m) => ({ default: m.AuthPanel })),
);
const ProxySettings = lazy(() =>
  import('./components/settings/ProxySettings').then((m) => ({ default: m.ProxySettings })),
);
const RoundPanel = lazy(() =>
  import('./components/round/RoundPanel').then((m) => ({ default: m.RoundPanel })),
);
const CookieManager = lazy(() =>
  import('./components/settings/CookieManager').then((m) => ({ default: m.CookieManager })),
);
const ConsoleModal = lazy(() =>
  import('./components/console/ConsoleModal').then((m) => ({ default: m.ConsoleModal })),
);
const AddBoardDialog = lazy(() =>
  import('./components/board-tree/AddBoardDialog').then((m) => ({ default: m.AddBoardDialog })),
);
const UpdateDialog = lazy(() =>
  import('./components/update/UpdateDialog').then((m) => ({ default: m.UpdateDialog })),
);
const DslEditor = lazy(() =>
  import('./components/dsl-editor/DslEditor').then((m) => ({ default: m.DslEditor })),
);

type LeftPaneTab = 'boards' | 'favorites' | 'search' | 'history';
type ModalType =
  | 'auth'
  | 'proxy'
  | 'round'
  | 'ng'
  | 'about'
  | 'cookie-manager'
  | 'console'
  | 'add-board'
  | 'update'
  | 'dsl-editor'
  | null;

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
  const loadPostHistory = useBBSStore((s) => s.loadPostHistory);

  const [leftTab, setLeftTab] = useState<LeftPaneTab>('boards');
  const [theme, setTheme] = useState<ThemeName>(getStoredTheme);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Resizable pane widths
  const [leftWidth, setLeftWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_LEFT, LEFT_PANE_DEFAULT),
  );
  const [centerWidth, setCenterWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_CENTER, CENTER_PANE_DEFAULT),
  );

  // Refs to avoid stale closures in IPC listeners
  const setLeftTabRef = useRef(setLeftTab);
  const setActiveModalRef = useRef(setActiveModal);
  useEffect(() => {
    setLeftTabRef.current = setLeftTab;
  }, [setLeftTab]);
  useEffect(() => {
    setActiveModalRef.current = setActiveModal;
  }, [setActiveModal]);

  // Apply theme on mount and change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Save tabs and session state before window unload (synchronous to guarantee completion)
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const state = useBBSStore.getState();
      const savedTabs = state.tabs.map((t) => ({
        boardUrl: t.boardUrl,
        threadId: t.threadId,
        title: t.title,
        scrollTop: t.scrollTop,
      }));
      // Use synchronous IPC to ensure the write completes before the process exits.
      // The async `saveTabs()` via `invoke` was unreliable here because app.quit()
      // could terminate the process before atomicWriteFile finished.
      window.electronApi.sendSync('tab:save-sync', savedTabs);
      window.electronApi.sendSync('session:save-sync', {
        selectedBoardUrl: state.selectedBoard?.url ?? null,
        activeThreadTabId: state.activeTabId ?? undefined,
        boardTabUrls: state.boardTabs.map((t) => t.board.url),
        activeBoardTabId: state.activeBoardTabId ?? undefined,
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Auto-initialize on first mount (runs once via ref guard)
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const api = window.electronApi;

    const init = async (): Promise<void> => {
      // Phase 1: Fetch menu + local data + prefetch session/tab data — all in parallel
      const [, , , , sessionData, savedTabs] = await Promise.all([
        fetchMenu(),
        fetchFavorites(),
        fetchNgRules(),
        loadPostHistory(),
        api.invoke('session:load'),
        api.invoke('tab:load'),
      ]);

      // Phase 2: Restore board sessions and thread tabs in parallel.
      // restoreSession needs the menu (populated by fetchMenu above).
      // restoreTabs is independent of restoreSession — openThread
      // fetches DAT directly and falls back to disk for threadIndices.
      // Pass activeThreadTabId from the prefetched session to restoreTabs
      // so it doesn't need to re-read session.json (which may be
      // clobbered by selectBoard calls inside restoreSession).
      await Promise.all([
        restoreSession(sessionData),
        restoreTabs(savedTabs, sessionData.activeThreadTabId),
      ]);
    };
    void init();
  }, [fetchMenu, fetchFavorites, fetchNgRules, loadPostHistory, restoreSession, restoreTabs]);

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
              if (
                action.tab === 'boards' ||
                action.tab === 'favorites' ||
                action.tab === 'search' ||
                action.tab === 'history'
              ) {
                setLeftTabRef.current(action.tab);
              }
              break;
            case 'open-modal':
              if (
                action.modal === 'auth' ||
                action.modal === 'proxy' ||
                action.modal === 'round' ||
                action.modal === 'ng' ||
                action.modal === 'about' ||
                action.modal === 'cookie-manager' ||
                action.modal === 'console' ||
                action.modal === 'update' ||
                action.modal === 'dsl-editor'
              ) {
                setActiveModalRef.current(action.modal);
              }
              break;
            case 'toggle-ng':
              setActiveModalRef.current((prev) => (prev === 'ng' ? null : 'ng'));
              break;
          }
        } catch {
          if (!cancelled) {
            await new Promise<void>((r) => {
              setTimeout(r, 1000);
            });
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

  const switchToBoards = useCallback(() => {
    setLeftTab('boards');
  }, []);
  const switchToFavorites = useCallback(() => {
    setLeftTab('favorites');
  }, []);
  const switchToSearch = useCallback(() => {
    setLeftTab('search');
  }, []);
  const switchToHistory = useCallback(() => {
    setLeftTab('history');
  }, []);
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const handleRefreshBoards = useCallback(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const openAuth = useCallback(() => {
    setActiveModal('auth');
  }, []);
  const openProxy = useCallback(() => {
    setActiveModal('proxy');
  }, []);
  const openRound = useCallback(() => {
    setActiveModal('round');
  }, []);
  const openCookieManager = useCallback(() => {
    setActiveModal('cookie-manager');
  }, []);
  const openConsole = useCallback(() => {
    setActiveModal('console');
  }, []);
  const openAbout = useCallback(() => {
    setActiveModal('about');
  }, []);
  const openAddBoard = useCallback(() => {
    setActiveModal('add-board');
  }, []);
  const openDslEditor = useCallback(() => {
    setActiveModal('dsl-editor');
  }, []);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.max(LEFT_PANE_MIN, Math.min(LEFT_PANE_MAX, w + delta)));
  }, []);

  const handleLeftResizeEnd = useCallback(() => {
    setLeftWidth((w) => {
      localStorage.setItem(STORAGE_KEY_LEFT, String(w));
      return w;
    });
  }, []);

  const handleCenterResize = useCallback((delta: number) => {
    setCenterWidth((w) => Math.max(CENTER_PANE_MIN, w + delta));
  }, []);

  const handleCenterResizeEnd = useCallback(() => {
    setCenterWidth((w) => {
      localStorage.setItem(STORAGE_KEY_CENTER, String(w));
      return w;
    });
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

        {/* Add external board */}
        <button
          type="button"
          onClick={openAddBoard}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="外部掲示板を追加 (したらば/まちBBS)"
        >
          <MdiIcon path={mdiLinkPlus} size={14} />
          外部板追加
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

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        {/* DSL Editor */}
        <button
          type="button"
          onClick={openDslEditor}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="DSLエディタ (Ctrl+Shift+D)"
        >
          <MdiIcon path={mdiScriptText} size={14} />
          DSL
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
            <button
              type="button"
              onClick={switchToHistory}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'history'
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiHistory} size={12} />
              履歴
            </button>
          </div>
          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {leftTab === 'boards' && <BoardTree />}
            {leftTab === 'favorites' && (
              <Suspense fallback={null}>
                <FavoriteTree />
              </Suspense>
            )}
            {leftTab === 'search' && (
              <Suspense fallback={null}>
                <SearchPanel />
              </Suspense>
            )}
            {leftTab === 'history' && (
              <Suspense fallback={null}>
                <HistoryPanel />
              </Suspense>
            )}
          </div>
          {/* Status console */}
          <StatusConsole />
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

      {/* Modal: Auth (resizable) */}
      <Modal
        open={activeModal === 'auth'}
        onClose={closeModal}
        resizable
        initialWidth={500}
        initialHeight={400}
      >
        <Suspense fallback={null}>
          <AuthPanel onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: Proxy (resizable) */}
      <Modal
        open={activeModal === 'proxy'}
        onClose={closeModal}
        resizable
        initialWidth={520}
        initialHeight={480}
      >
        <Suspense fallback={null}>
          <ProxySettings onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: NG Editor */}
      <Modal open={activeModal === 'ng'} onClose={closeModal} width="max-w-2xl">
        <div className="max-h-[70vh] overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <Suspense fallback={null}>
            <NgEditor onClose={closeModal} />
          </Suspense>
        </div>
      </Modal>

      {/* Modal: Round (resizable) */}
      <Modal
        open={activeModal === 'round'}
        onClose={closeModal}
        resizable
        initialWidth={480}
        initialHeight={500}
      >
        <div className="h-full overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <Suspense fallback={null}>
            <RoundPanel onClose={closeModal} />
          </Suspense>
        </div>
      </Modal>

      {/* Modal: Cookie/UA Manager (resizable) */}
      <Modal
        open={activeModal === 'cookie-manager'}
        onClose={closeModal}
        resizable
        initialWidth={600}
        initialHeight={500}
      >
        <Suspense fallback={null}>
          <CookieManager onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: Console (resizable) */}
      <Modal
        open={activeModal === 'console'}
        onClose={closeModal}
        resizable
        initialWidth={900}
        initialHeight={600}
      >
        <Suspense fallback={null}>
          <ConsoleModal onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: Add Board */}
      <Modal open={activeModal === 'add-board'} onClose={closeModal} width="max-w-lg">
        <Suspense fallback={null}>
          <AddBoardDialog onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: Update */}
      <Modal open={activeModal === 'update'} onClose={closeModal} width="max-w-sm">
        <Suspense fallback={null}>
          <UpdateDialog onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: DSL Editor (resizable) */}
      <Modal
        open={activeModal === 'dsl-editor'}
        onClose={closeModal}
        resizable
        initialWidth={800}
        initialHeight={600}
      >
        <Suspense fallback={null}>
          <DslEditor onClose={closeModal} />
        </Suspense>
      </Modal>

      {/* Modal: About */}
      <Modal open={activeModal === 'about'} onClose={closeModal} width="max-w-sm">
        <div className="flex flex-col items-center gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6">
          <MdiIcon path={mdiBulletinBoard} size={48} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">VBBB</h2>
          <p className="text-center text-sm font-medium text-[var(--color-text-secondary)]">
            Versatile BBS Browser
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">v{__APP_VERSION__}</p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            2ch/5ch互換BBSブラウザ
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            Electron + React + TypeScript
          </p>
          <button
            type="button"
            onClick={() => {
              void window.electronApi.invoke(
                'shell:open-external',
                'https://github.com/roflsunriz/VBBB',
              );
            }}
            className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <MdiIcon path={mdiGithub} size={14} />
            https://github.com/roflsunriz/VBBB
          </button>
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
